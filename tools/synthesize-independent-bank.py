"""Optional content-authoring only. Learning runtime has no Python dependency.

Install edge-tts into ignored work/authoring-python and provide ffmpeg/ffprobe.
Only project-original texts and the frozen 70 vocabulary candidates are sent.
No account configuration, API credentials or personal learner data are read.
"""
import argparse, asyncio, hashlib, importlib.metadata, json, os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUTHOR_PACKAGES = ROOT / 'work' / 'authoring-python'
if AUTHOR_PACKAGES.is_dir():
    sys.path.insert(0, str(AUTHOR_PACKAGES))
import edge_tts

FLAGS = 0x08000000 if os.name == 'nt' else 0
WORK = ROOT / 'work' / 'independent-bank-tts'
VOICE_SOURCE = 'https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts'
PAIRS = {'en-GB': ['en-GB-SoniaNeural', 'en-GB-RyanNeural'], 'en-US': ['en-US-AriaNeural', 'en-US-GuyNeural'], 'en-AU': ['en-AU-NatashaNeural', 'en-AU-WilliamNeural'], 'en-IN': ['en-IN-NeerjaNeural', 'en-IN-PrabhatNeural']}
PRONUNCIATION_CONTEXTS = {'compact': 'Please compact the loose soil.'}

def sha(value):
    if isinstance(value, str): value = value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()

def write_json(target, value):
    target.parent.mkdir(parents=True, exist_ok=True)
    incoming = target.with_name(target.name + '.incoming')
    incoming.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(incoming, target)

def probe(target):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name', '-of', 'json', str(target)], check=True, capture_output=True, creationflags=FLAGS)
    data = json.loads(result.stdout)
    duration = float(data['format']['duration'])
    if duration < .1 or not any(s.get('codec_name') == 'mp3' for s in data.get('streams', [])):
        raise RuntimeError('Invalid MP3 duration or codec')
    return duration

def split_speakers(text, pair):
    result, assigned = [], {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line: continue
        match = re.match(r'^([A-Za-z][A-Za-z ]{0,25}):\s*(.+)$', line)
        voice = pair[0]
        if match:
            label, line = match.groups()
            if label not in assigned: assigned[label] = pair[len(assigned) % len(pair)]
            voice = assigned[label]
        if result and result[-1][0] == voice:
            result[-1] = (voice, result[-1][1] + '\n' + line)
        else:
            result.append((voice, line))
    return result

async def synth(text, voice, rate, target):
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice=voice, rate=rate, connect_timeout=25, receive_timeout=100).save(str(target))
            if target.stat().st_size < 300: raise RuntimeError('Empty synthesized audio')
            return
        except Exception:
            if attempt == 3: raise
            await asyncio.sleep(2 ** attempt)

async def synth_context_word(word, sentence, voice, rate, target):
    """Use real service word boundaries to preserve the verb stress of a homograph."""
    boundaries = []
    for attempt in range(4):
        try:
            boundaries = []
            with target.open('wb') as output:
                async for chunk in edge_tts.Communicate(sentence, voice=voice, rate=rate, boundary='WordBoundary', connect_timeout=25, receive_timeout=100).stream():
                    if chunk['type'] == 'audio': output.write(chunk['data'])
                    elif chunk['type'] == 'WordBoundary': boundaries.append(chunk)
            matches = [b for b in boundaries if re.sub(r'[^a-z]', '', b['text'].lower()) == word.lower()]
            if len(matches) != 1: raise RuntimeError('No unique real word boundary for ' + word)
            b = matches[0]
            return {'spokenContext': sentence, 'contextHash': sha(sentence), 'targetWord': word, 'startSeconds': max(0, b['offset'] / 10000000 - .035), 'endSeconds': (b['offset'] + b['duration']) / 10000000 + .06, 'boundaryMethod': 'Actual service WordBoundary metadata, then ffmpeg extraction; no estimated subtitle timeline'}
        except Exception:
            if attempt == 3: raise
            await asyncio.sleep(2 ** attempt)

async def bank_item(m, semaphore):
    async with semaphore:
        mid, text, locale = m['id'], m['transcript'], m['audioLocale']
        rate = {'A1': '-18%', 'A2': '-8%', 'B1': '-3%', 'B2': '+0%'}[m['level']]
        segments = split_speakers(text, PAIRS[locale])
        target = ROOT / 'audio' / 'independent-bank' / (mid + '.mp3')
        meta_path = ROOT / 'curriculum' / 'independent-bank' / 'audio' / (mid + '.json')
        configuration = {'transcriptHash': sha(text), 'segments': segments, 'rate': rate, 'format': 'mp3-24000-mono-48k'}
        config_hash = sha(json.dumps(configuration, sort_keys=True))
        if target.exists() and meta_path.exists():
            old = json.loads(meta_path.read_text(encoding='utf-8'))
            if old.get('configurationHash') == config_hash and old.get('audioHash') == sha(target.read_bytes()):
                probe(target)
                print(json.dumps({'id': mid, 'status': 'cached'}), flush=True)
                return
        parts, segment_meta = [], []
        for index, (voice, content) in enumerate(segments):
            part = WORK / (mid + '-' + str(index) + '.mp3')
            await synth(content, voice, rate, part)
            duration = await asyncio.to_thread(probe, part)
            parts.append(part)
            segment_meta.append({'voice': voice, 'textHash': sha(content), 'durationSeconds': duration})
        listing = WORK / (mid + '.concat.txt')
        listing.write_text('\n'.join("file '" + str(p).replace('\\', '/').replace("'", "'\\''") + "'" for p in parts), encoding='utf-8')
        normalized = WORK / (mid + '-verified.mp3')
        await asyncio.to_thread(subprocess.run, ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing), '-ar', '24000', '-ac', '1', '-b:a', '48k', str(normalized)], check=True, capture_output=True, creationflags=FLAGS)
        duration = await asyncio.to_thread(probe, normalized)
        if duration < 5: raise RuntimeError('Listening audio unexpectedly short')
        target.parent.mkdir(parents=True, exist_ok=True)
        incoming = target.with_name(target.name + '.incoming')
        incoming.write_bytes(normalized.read_bytes())
        os.replace(incoming, target)
        meta = {'schema': 3, 'id': mid, 'synthetic': True, 'provider': 'Microsoft online TTS via edge-tts', 'authoringPackageVersion': importlib.metadata.version('edge-tts'), 'locale': locale, 'voices': list(dict.fromkeys(v for v, _ in segments)), 'voiceMetadataSource': VOICE_SOURCE, 'rate': rate, 'transcriptHash': sha(text), 'audioHash': sha(target.read_bytes()), 'configurationHash': config_hash, 'durationSeconds': duration, 'segments': segment_meta, 'note': '原创情境的合成声音；地域按官方voice元数据标注，非真人录音、未做独立真人口音听审。段时长来自实际媒体，仅审计使用，不伪造字幕时间轴。'}
        write_json(meta_path, meta)
        for part in [*parts, listing, normalized]: part.unlink(missing_ok=True)
        print(json.dumps({'id': mid, 'status': 'ready', 'locale': locale, 'seconds': round(duration, 2)}), flush=True)

def read_mapping():
    file = ROOT / 'assets' / 'vocabulary-audio.js'
    raw = file.read_text(encoding='utf-8')
    start = raw.index('const data=') + len('const data=')
    return json.JSONDecoder().raw_decode(raw[start:])[0]

def emit_mapping(mapping):
    file = ROOT / 'assets' / 'vocabulary-audio.js'
    mapping['count'] = len(mapping['items'])
    mapping['items'] = dict(sorted(mapping['items'].items()))
    text = '/* Generated vocabulary MP3 index; original entries preserved. New lexical contexts: tools/synthesize-independent-bank.py. */\n(function(root){\'use strict\';const data=' + json.dumps(mapping, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c') + ';root.IELTSVocabularyAudio=data;if(typeof module===\'object\'&&module.exports)module.exports=data;})(typeof globalThis!==\'undefined\'?globalThis:this);\n'
    incoming = file.with_name(file.name + '.incoming')
    incoming.write_text(text, encoding='utf-8')
    os.replace(incoming, file)

async def vocabulary_item(word, mapping, semaphore):
    async with semaphore:
        key = re.sub(r'\s+', ' ', word.strip()).lower()
        context_sentence = PRONUNCIATION_CONTEXTS.get(key)
        old = mapping['items'].get(key)
        if old:
            target = ROOT / old['audio']
            meta_file = ROOT / 'audio' / 'vocabulary' / 'metadata' / (target.stem + '.json')
            context_matches = not context_sentence or (meta_file.exists() and json.loads(meta_file.read_text(encoding='utf-8')).get('contextExtraction', {}).get('spokenContext') == context_sentence and json.loads(meta_file.read_text(encoding='utf-8')).get('contextExtraction', {}).get('sourceAudio'))
            if target.exists() and old.get('audioHash') == sha(target.read_bytes()) and context_matches:
                await asyncio.to_thread(probe, target)
                return
        slug = re.sub(r'[^a-z0-9]+', '-', key).strip('-')[:55] or 'word'
        filename = slug + '-' + sha(key)[:10]
        target = ROOT / 'audio' / 'vocabulary' / (filename + '.mp3')
        meta_path = ROOT / 'audio' / 'vocabulary' / 'metadata' / (filename + '.json')
        part, normalized = WORK / (filename + '-raw.mp3'), WORK / (filename + '-verified.mp3')
        voice, rate = PAIRS['en-GB'][0], '-10%'
        extraction = await synth_context_word(word, context_sentence, voice, rate, part) if context_sentence else None
        if not extraction: await synth(word, voice, rate, part)
        if extraction:
            source = target.with_name(filename + '-context-source.mp3')
            source.write_bytes(part.read_bytes())
            extraction.update({'sourceAudio': source.relative_to(ROOT).as_posix(), 'sourceAudioHash': sha(source.read_bytes()), 'sourceDurationSeconds': await asyncio.to_thread(probe, source)})
        command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(part)]
        if extraction: command += ['-ss', str(extraction['startSeconds']), '-t', str(extraction['endSeconds'] - extraction['startSeconds'])]
        command += ['-ar', '24000', '-ac', '1', '-b:a', '48k', str(normalized)]
        await asyncio.to_thread(subprocess.run, command, check=True, capture_output=True, creationflags=FLAGS)
        duration = await asyncio.to_thread(probe, normalized)
        if duration > 15: raise RuntimeError('Word audio unexpectedly long')
        target.parent.mkdir(parents=True, exist_ok=True)
        incoming = target.with_name(target.name + '.incoming')
        incoming.write_bytes(normalized.read_bytes()); os.replace(incoming, target)
        audio_hash = sha(target.read_bytes())
        write_json(meta_path, {'word': word, 'textHash': sha(word), 'configurationHash': sha(json.dumps({'text': word, 'voice': voice, 'rate': rate, 'format': 'mp3-24000-mono-48k', **({'context': context_sentence} if extraction else {})}, sort_keys=True, ensure_ascii=False)), 'voice': voice, 'rate': rate, 'durationSeconds': duration, 'audioHash': audio_hash, 'synthetic': True, 'provider': 'Microsoft online TTS via edge-tts', 'authoringPackageVersion': importlib.metadata.version('edge-tts'), **({'contextExtraction': extraction} if extraction else {}), 'note': '原创语境候选词的合成示范，不是专业发音评分。'})
        mapping['items'][key] = {'audio': target.relative_to(ROOT).as_posix(), 'durationSeconds': duration, 'textHash': sha(word), 'audioHash': audio_hash, 'source': 'generated', 'synthetic': True}
        emit_mapping(mapping)
        part.unlink(missing_ok=True); normalized.unlink(missing_ok=True)
        print(json.dumps({'word': word, 'status': 'ready', 'seconds': round(duration, 2)}), flush=True)

async def main(args):
    WORK.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(args.concurrency)
    tasks = []
    if not args.vocabulary_only:
        files = sorted((ROOT / 'curriculum' / 'independent-bank' / 'materials').glob('*.json'))
        materials = [json.loads(p.read_text(encoding='utf-8')) for p in files]
        selected = [m for m in materials if m.get('skill') == 'listening' and (not args.id or m['id'] == args.id)]
        if not selected: raise RuntimeError('Run node tools/build-independent-bank.cjs --text-only first; no listening materials selected')
        tasks += [bank_item(m, semaphore) for m in selected]
    if args.vocabulary or args.vocabulary_only:
        mapping = read_mapping()
        frozen = json.loads((ROOT / 'curriculum' / 'sources' / 'lexical-context-candidates.json').read_text(encoding='utf-8'))['items']
        tasks += [vocabulary_item(v['word'], mapping, semaphore) for v in frozen if not args.word or v['word'] == args.word]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    errors = [type(r).__name__ + ': ' + str(r)[:180] for r in results if isinstance(r, Exception)]
    print(json.dumps({'complete': not errors, 'jobs': len(tasks), 'errors': errors}, ensure_ascii=False), flush=True)
    if errors: raise SystemExit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--id')
    parser.add_argument('--word')
    parser.add_argument('--vocabulary', action='store_true')
    parser.add_argument('--vocabulary-only', action='store_true')
    parser.add_argument('--concurrency', type=int, default=3)
    args = parser.parse_args()
    if not 1 <= args.concurrency <= 4: parser.error('concurrency must be 1–4')
    asyncio.run(main(args))
