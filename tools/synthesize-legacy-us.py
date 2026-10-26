"""Rebuild the supplied 52 readings in US English with actual word boundaries.

Old media is retained. The page switches only after all 52 new media sets exist.
No profile, credential, recording or user folder is read or written.
"""
import argparse, asyncio, bisect, hashlib, json, os, re, subprocess, sys, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import curriculum_audio_authoring as A
from curriculum_audio_layout import normalized, sha

VOICE, HZ = 'en-US-AriaNeural', 24000
WORK = ROOT / 'work/legacy-us-audio'
A.CACHE = WORK / 'groups'
META = ROOT / 'curriculum/legacy-us-audio'

def source():
    text = (ROOT / '开始学习.html').read_text(encoding='utf-8')
    take = lambda name: json.loads(re.search(r'^const ' + name + r'=(.*);\r?$', text, re.M)[1])
    return take('LESSONS'), take('GAPDATA')

def encode(frames, target):
    temporary = WORK / (target.stem + '.wav')
    try:
        with wave.open(str(temporary), 'wb') as out:
            out.setnchannels(1); out.setsampwidth(2); out.setframerate(HZ); out.writeframes(frames)
        incoming = WORK / (target.stem + '-complete.mp3')
        A.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(temporary), '-ar', str(HZ), '-ac', '1', '-b:a', '48k', str(incoming)])
        duration = A.probe(incoming)
        decoded = A.pcm(incoming)
        if abs(len(decoded) - len(frames)) / (2 * HZ) > .1: raise ValueError('Encoded timeline drift')
        target.parent.mkdir(parents=True, exist_ok=True); os.replace(incoming, target)
        return duration
    finally: temporary.unlink(missing_ok=True)

def word_positions(text):
    positions = []
    for index, char in enumerate(text): positions.extend([index] * len(normalized(char)))
    return positions

def clock(seconds):
    ms = round(seconds * 1000)
    return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'

async def generate(lesson, old, semaphore):
    async with semaphore:
        day = lesson['day']; stem = f'Day{day:02d}_us'
        texts = [g['text'] for g in old['groups']]
        expected = lesson['title'].rstrip('.') + '.' + lesson['text']
        if normalized(''.join(texts)) != normalized(expected): raise ValueError('Paragraphs no longer exactly cover lesson ' + str(day))
        signature = sha(json.dumps({'texts': texts, 'voice': VOICE, 'slowRate': '-25%', 'normalRate': '+0%', 'pauseRule': '1:1', 'version': 1}, ensure_ascii=False, sort_keys=True))
        meta_file = META / (stem + '.json')
        if meta_file.exists():
            previous = json.loads(meta_file.read_text(encoding='utf-8'))
            if previous.get('configurationHash') == signature and all((ROOT / path).exists() and sha((ROOT / path).read_bytes()) == digest for path, digest in previous['files'].items()):
                print(json.dumps({'day': day, 'status': 'cached'}), flush=True); return previous
        _, _, normal, _, _ = await A.voice_group(['\n\n'.join(texts)], VOICE, '+0%')
        normal_target = ROOT / 'audio' / (stem + '_normal.mp3')
        normal_seconds = await asyncio.to_thread(encode, normal, normal_target)
        key, _, pcm, aligned, _ = await A.voice_group(texts, VOICE, '-25%')
        boundaries = json.loads((A.CACHE / (key + '.json')).read_text(encoding='utf-8'))['wordBoundaries']
        lengths, total = [], 0
        for text in texts: total += len(normalized(text)); lengths.append(total)
        positions, words, cursor = [word_positions(text) for text in texts], [[] for _ in texts], 0
        slices = []
        count = len(pcm) // 2
        for index, bound in enumerate(aligned):
            lower = 0 if index == 0 else (aligned[index-1]['endSeconds'] + bound['startSeconds']) / 2
            upper = count / HZ if index == len(aligned)-1 else (bound['endSeconds'] + aligned[index+1]['startSeconds']) / 2
            first = max(0, round(max(lower, bound['startSeconds']-.06) * HZ))
            last = min(count, round(min(upper, bound['endSeconds']+.12) * HZ))
            if last <= first: raise ValueError('Empty actual speech slice')
            slices.append((first, last))
        for word in boundaries:
            token = normalized(word['text'])
            if not token: continue
            index = bisect.bisect_right(lengths, cursor); within = cursor - (lengths[index-1] if index else 0)
            first, last = slices[index]; from_char = positions[index][within]; to_char = positions[index][within+len(token)-1]+1
            words[index].append({'text': texts[index][from_char:to_char], 'fromChar': from_char, 'toChar': to_char, 'start': max(0, word['offset']/10000000-first/HZ), 'end': min((last-first)/HZ, (word['offset']+word['duration'])/10000000-first/HZ)})
            cursor += len(token)
        if cursor != total: raise ValueError('Incomplete actual word coverage')
        joined, groups, files = bytearray(), [], {normal_target.relative_to(ROOT).as_posix(): sha(normal_target.read_bytes())}
        for index, ((first,last), before) in enumerate(zip(slices, old['groups'])):
            content = pcm[first*2:last*2]; duration = (last-first)/HZ; start = len(joined)/(2*HZ)
            complete = content + b'\0\0'*(last-first); joined.extend(complete)
            target = ROOT / 'audio' / (stem + f'_paragraph{index:02d}.mp3')
            await asyncio.to_thread(encode, complete, target); files[target.relative_to(ROOT).as_posix()] = sha(target.read_bytes())
            groups.append({'index': index, 'text': before['text'], 'zh': before['zh'], 'start': start, 'voiceEnd': start+duration, 'end': start+2*duration, 'voiceSeconds': duration, 'pauseSeconds': duration, 'sourceStart': first/HZ, 'sourceEnd': last/HZ, 'words': words[index]})
        slow_target = ROOT / 'audio' / (stem + '_slow.mp3')
        slow_seconds = await asyncio.to_thread(encode, joined, slow_target); files[slow_target.relative_to(ROOT).as_posix()] = sha(slow_target.read_bytes())
        srt = ROOT / 'audio' / (stem + '_slow.srt')
        srt.write_text('\n\n'.join(f"{i+1}\n{clock(g['start'])} --> {clock(g['end'])}\n{g['text']}\n{g['zh']}" for i,g in enumerate(groups))+'\n', encoding='utf-8'); files[srt.relative_to(ROOT).as_posix()] = sha(srt.read_bytes())
        gap = {'day': day, 'title': lesson['title'], 'groups': groups, 'duration': slow_seconds, 'voice': VOICE, 'locale': 'en-US', 'rate': '-25%', 'pauseRule': '1:1', 'unit': 'paragraph', 'sourceTextVerified': True, 'synthetic': True}
        metadata = {'schema': 1, 'day': day, 'configurationHash': signature, 'transcriptHash': sha(lesson['text']), 'voice': VOICE, 'locale': 'en-US', 'synthetic': True, 'normalDurationSeconds': normal_seconds, 'slowDurationSeconds': slow_seconds, 'files': files, 'gap': gap, 'note': 'Actual service WordBoundary and decoded PCM slices; equal voiced-length silence. Supplied learning text, not authentic human audio.'}
        A.write_json(meta_file, metadata); print(json.dumps({'day': day, 'status': 'generated', 'groups': len(groups), 'normalSeconds': round(normal_seconds,2), 'slowSeconds': round(slow_seconds,2)}), flush=True); return metadata

def publish(rows):
    page = ROOT / '开始学习.html'; text = page.read_text(encoding='utf-8')
    current, _ = source()
    if any(sha(lesson['text']) != row['transcriptHash'] for lesson,row in zip(current,rows)): raise ValueError('Lesson source changed during authoring; no page published')
    data = {str(row['day']): row['gap'] for row in rows}
    text, count = re.subn(r'^const GAPDATA=.*;\r?$', lambda _: 'const GAPDATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';',text,count=1,flags=re.M)
    if count != 1: raise ValueError('Cannot locate exact page gap data')
    text = text.replace('audio/Day${id}_normal.mp3','audio/Day${id}_us_normal.mp3').replace('audio/Day${id}_slow.mp3','audio/Day${id}_us_slow.mp3').replace('audio/Day${id}_paragraph','audio/Day${id}_us_paragraph').replace('wordseek20261003','american20261026')
    text = text.replace('正常版 · 英式英语','正常版 · 美式英语合成').replace('英式慢速 −25%','美式合成慢速 −25%')
    temporary = page.with_name(page.name+'.us-audio.incoming'); temporary.write_text(text,encoding='utf-8'); os.replace(temporary,page)
    A.write_json(ROOT/'curriculum/legacy-us-audio-audit.json',{'schema':1,'complete':True,'lessons':52,'groups':sum(len(row['gap']['groups']) for row in rows),'voice':VOICE,'locale':'en-US','synthetic':True,'files':sum(len(row['files']) for row in rows),'items':[{'day':row['day'],'configurationHash':row['configurationHash'],'transcriptHash':row['transcriptHash'],'files':row['files']} for row in rows],'scope':'Exact text hashes, actual service word boundaries, decoded MP3, PCM-equal shadowing pauses; not independent listening or learning validation.'})

async def main(args):
    for folder in [WORK,A.CACHE,META]:folder.mkdir(parents=True,exist_ok=True)
    lessons,gaps=source();semaphore=asyncio.Semaphore(args.concurrency)
    results=await asyncio.gather(*(generate(lesson,gaps[str(lesson['day'])],semaphore) for lesson in lessons),return_exceptions=True)
    errors=[{'day':lesson['day'],'error':type(result).__name__+': '+str(result)[:200]} for lesson,result in zip(lessons,results) if isinstance(result,Exception)]
    if not errors: publish(results)
    report={'lessons':len(lessons),'ready':len(lessons)-len(errors),'complete':not errors,'errors':errors};A.write_json(WORK/'last-run.json',report);print(json.dumps(report),flush=True)
    return 1 if errors else 0

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--concurrency',type=int,choices=range(1,5),default=3)
    raise SystemExit(asyncio.run(main(parser.parse_args())))
