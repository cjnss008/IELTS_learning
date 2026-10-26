"""Generate exact-reference local reading demonstrations; authoring uses edge-tts.

Learners only need the emitted MP3s and JavaScript map. Section and word-limit
segmentation comes from the same JS implementation as the oral practice UI.
"""
import argparse
import asyncio
import hashlib
import json
import os
import sys
import subprocess
from pathlib import Path

AUTHOR_PACKAGES = Path(__file__).resolve().parent.parent / 'work' / 'authoring-python'
if AUTHOR_PACKAGES.is_dir(): sys.path.insert(0, str(AUTHOR_PACKAGES))
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'audio' / 'oral-models'
INDEX = ROOT / 'curriculum' / 'oral-model-audio-index.json'
MAP = ROOT / 'assets' / 'oral-model-audio.js'
TEMP = ROOT / '.cache' / 'oral-model-speech_audio'
VOICE = 'en-US-AriaNeural'
FLAGS = 0x08000000 if os.name == 'nt' else 0


def plan():
    script = """
const path=require('node:path'),root=process.argv[1];
const data=require(path.join(root,'assets/curriculum-data.js'));
const oral=require(path.join(root,'assets/oral-practice.js'));
const rows=[];
for(const material of data.materials.filter(m=>m.skill==='speaking'&&m.pool==='training')){
 const reading=data.materials.find(m=>m.id===material.id.replace(/-speaking$/,''));
 const reference=typeof material.reference==='string'&&material.reference.trim()?material.reference:reading?.passage;
 if(!reference)continue;
 oral.spokenReferenceParts(reference,65).forEach((reference,index)=>rows.push({materialId:material.id,readingId:reading?.id||material.id,week:material.week,segmentIndex:index,reference}));
}
process.stdout.write(JSON.stringify(rows));
"""
    result = subprocess.run(['node', '-e', script, str(ROOT)], capture_output=True,
                            check=True, creationflags=FLAGS)
    rows = json.loads(result.stdout.decode('utf-8'))
    unique = {}
    for row in rows:
        digest = hashlib.sha256(row['reference'].encode('utf-8')).hexdigest()
        if digest not in unique:
            unique[digest] = {'id': 'oral-' + digest[:24], 'reference': row['reference'],
                              'textHash': digest, 'src': 'audio/oral-models/' + hashlib.sha256((VOICE + '|' + ('-15%' if row['week'] <= 8 else '-5%') + '|' + row['reference']).encode('utf-8')).hexdigest()[:24] + '.mp3',
                              'voice': VOICE, 'rate': '-15%' if row['week'] <= 8 else '-5%',
                              'synthetic': True, 'sources': [], 'ready': False}
        unique[digest]['sources'].append({key: row[key] for key in ('materialId', 'readingId', 'segmentIndex')})
    return list(unique.values()), len(rows)


def atomic_text(path, value):
    temporary = path.with_suffix(path.suffix + '.speech_audio.tmp')
    temporary.write_text(value, encoding='utf-8', newline='\n')
    os.replace(temporary, path)


def publish(entries, total):
    ready = [entry for entry in entries if entry.get('ready')]
    metadata = {'schema': 1, 'segmentWords': 65, 'provider': 'Microsoft online TTS via edge-tts',
                'voice': VOICE, 'locale': 'en-US', 'synthetic': True, 'plannedSegments': total,
                'uniqueSegments': len(entries), 'readySegments': len(ready),
                'note': 'Synthetic model readings of the exact displayed original learning text.',
                'segments': entries}
    # Incomplete batches stay in ignored authoring staging. Existing runtime
    # resources remain complete until every required new MP3 passes verification.
    atomic_text(TEMP / 'oral-model-audio-index.pending.json', json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    if len(ready) != len(entries): return
    atomic_text(INDEX, json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    data = [{key: entry[key] for key in ('id', 'reference', 'src', 'textHash', 'durationSeconds', 'audioHash', 'voice', 'rate')}
            for entry in ready]
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    atomic_text(MAP, "(function(root){'use strict';const entries=" + encoded + ";"
                "const byReference=new Map(entries.map(item=>[item.reference,Object.freeze(item)]));"
                "const api=Object.freeze({schema:1,synthetic:true,entries:Object.freeze(entries),"
                "get:reference=>typeof reference==='string'?byReference.get(reference.trim())||null:null});"
                "root.IELTSOralModelAudio=api;if(typeof module==='object'&&module.exports)module.exports=api;"
                "})(typeof globalThis!=='undefined'?globalThis:this);\n")


def probe(path):
    output = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                      '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
                                     creationflags=FLAGS)
    return float(output.decode().strip())


async def main(args):
    for folder in (OUT, INDEX.parent, TEMP):
        folder.mkdir(parents=True, exist_ok=True)
    entries, total = plan()
    try:
        pending_index = TEMP / 'oral-model-audio-index.pending.json'
        candidate_index = pending_index if pending_index.exists() else INDEX
        old = {entry['textHash']: entry for entry in json.loads(candidate_index.read_text(encoding='utf-8'))['segments']}
    except (OSError, ValueError, KeyError, TypeError):
        old = {}
    for entry in entries:
        previous = old.get(entry['textHash'], {})
        target = ROOT / entry['src']
        if (previous.get('ready') and previous.get('voice') == entry['voice']
                and previous.get('rate') == entry['rate'] and previous.get('reference') == entry['reference']
                and isinstance(previous.get('durationSeconds'), (float, int))
                and 0.1 <= previous['durationSeconds'] <= 180 and target.exists() and target.stat().st_size > 1000):
            actual_hash = hashlib.sha256(target.read_bytes()).hexdigest()
            if previous.get('audioHash') and previous['audioHash'] != actual_hash: continue
            entry.update(ready=True, durationSeconds=previous['durationSeconds'], bytes=target.stat().st_size, audioHash=actual_hash)
    publish(entries, total)
    pending = [entry for entry in entries if not entry['ready']]
    if args.limit:
        pending = pending[:args.limit]
    semaphore = asyncio.Semaphore(args.concurrency)
    completed = 0

    async def generate(entry):
        nonlocal completed
        async with semaphore:
            part = TEMP / (entry['id'] + '-source.mp3')
            converted = TEMP / (entry['id'] + '-complete.mp3')
            error = None
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(entry['reference'], voice=VOICE, rate=entry['rate'],
                                               connect_timeout=20, receive_timeout=90).save(str(part))
                    await asyncio.to_thread(subprocess.run, ['ffmpeg', '-hide_banner', '-loglevel', 'error',
                                           '-y', '-i', str(part), '-ar', '24000', '-ac', '1', '-b:a', '48k', str(converted)],
                                           check=True, capture_output=True, creationflags=FLAGS)
                    duration = await asyncio.to_thread(probe, converted)
                    if not 0.1 <= duration <= 180 or converted.stat().st_size < 1000:
                        raise ValueError('invalid synthesized audio duration or size')
                    os.replace(converted, ROOT / entry['src'])
                    entry.update(ready=True, durationSeconds=duration, bytes=(ROOT / entry['src']).stat().st_size, audioHash=hashlib.sha256((ROOT / entry['src']).read_bytes()).hexdigest())
                    part.unlink(missing_ok=True)
                    completed += 1
                    if completed <= 3 or completed % 10 == 0:
                        publish(entries, total)
                    print(json.dumps({'ready': entry['id'], 'completed': completed, 'pendingThisRun': len(pending),
                                      'seconds': round(duration, 2)}), flush=True)
                    return True
                except Exception as failure:
                    error = type(failure).__name__
                    await asyncio.sleep(2 ** attempt)
            print(json.dumps({'failed': entry['id'], 'error': error}), flush=True)
            return False

    results = await asyncio.gather(*(generate(entry) for entry in pending))
    publish(entries, total)
    failed = sum(result is False for result in results)
    print(json.dumps({'plannedSegments': total, 'uniqueSegments': len(entries),
                      'readySegments': sum(entry['ready'] for entry in entries), 'published': all(entry['ready'] for entry in entries), 'failedThisRun': failed}), flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--concurrency', type=int, choices=range(1, 5), default=3)
    args = parser.parse_args()
    if args.limit < 0:
        parser.error('--limit must be nonnegative')
    raise SystemExit(asyncio.run(main(args)))
