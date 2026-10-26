"""Bounded authoring of original course audio; no learner data or credentials."""
import argparse, asyncio, importlib, importlib.metadata, json, math, os, subprocess, sys, time, uuid, wave
from array import array
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGES = ROOT / 'work/authoring-python'
if PACKAGES.is_dir(): sys.path.insert(0, str(PACKAGES))
import edge_tts
from curriculum_audio_layout import LABEL, LAYOUT_VERSION, PAUSES, align_boundaries, configuration, layout, sha, with_role_voices

MATERIALS, OUT, META = ROOT / 'curriculum/materials', ROOT / 'audio/curriculum', ROOT / 'curriculum/audio'
WORK = ROOT / 'work/curriculum-tts-v68'
CACHE = WORK / 'groups'
FLAGS = 0x08000000 if os.name == 'nt' else 0
HZ = 24000
PAIRS = [('en-US-AriaNeural', 'en-US-GuyNeural'), ('en-US-JennyNeural', 'en-US-EricNeural'), ('en-US-MichelleNeural', 'en-US-ChristopherNeural')]
NARRATORS = ['en-US-AvaNeural', 'en-US-BrianNeural', 'en-US-EmmaNeural']
VERSION = importlib.metadata.version('edge-tts')
GROUP_VERSION = 'curriculum-word-boundary-groups-v1'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    incoming = path.with_name(path.name + '.' + uuid.uuid4().hex + '.incoming')
    incoming.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(incoming, path)


def run(command):
    return subprocess.run(command, check=True, capture_output=True, creationflags=FLAGS)


def probe(path):
    value = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', str(path)]).stdout)
    duration = float(value['format']['duration'])
    if duration < .1 or not any(s.get('codec_name') == 'mp3' and s.get('sample_rate') == '24000' and s.get('channels') == 1 for s in value['streams']): raise ValueError('Invalid 24kHz mono MP3')
    return duration


def pcm(path):
    return run(['ffmpeg', '-v', 'error', '-i', str(path), '-ar', str(HZ), '-ac', '1', '-f', 's16le', '-']).stdout


def pause_settings(material):
    requirements = material.get('audioRequirements') or {}
    paragraph = requirements.get('paragraphGapMs', round(PAUSES['paragraph']*1000)) / 1000
    turn = requirements.get('turnGapMs', round(PAUSES['speaker-change']*1000)) / 1000
    if not .2 <= paragraph <= 3 or not .2 <= turn <= 3: raise ValueError('Unsafe source pause requirement')
    return {'paragraph': paragraph, 'speaker-change': turn, 'section': max(PAUSES['section'], paragraph)}


def settings(material):
    index = 0 if material['week'] <= 8 else (material['week'] - 9) % len(PAIRS)
    rate = '-15%' if material['week'] <= 8 else '-5%' if material['week'] <= 20 else '+0%'
    planned = layout(material['transcript'], PAIRS[index], NARRATORS[index], PAIRS[1] if index != 1 else PAIRS[0])
    requirements = material.get('audioRequirements') or {}
    planned = with_role_voices(planned, requirements.get('roleVoices'))
    minimum = requirements.get('minimumSpeakers', 0)
    spoken_voices = {segment['voice'] for segment in planned['segments']}
    if minimum and len(spoken_voices) < minimum: raise ValueError('Source requires at least ' + str(minimum) + ' real speaker voices, found ' + str(len(spoken_voices)))
    pauses = pause_settings(material)
    for index, segment in enumerate(planned['segments']):
        if not index: continue
        kind = 'section' if segment['boundary'] == 'section' else 'speaker-change' if planned['segments'][index-1]['role'] != segment['role'] else 'paragraph'
        segment['pauseBeforeSeconds'] = pauses[kind]
    config, digest = configuration(material['transcript'], planned, rate, VERSION)
    return planned, config, digest, rate


async def voice_group(texts, voice, rate):
    identity = {'text': '\n\n'.join(texts), 'voice': voice, 'rate': rate, 'boundary': 'WordBoundary', 'packageVersion': VERSION, 'version': GROUP_VERSION}
    key = sha(json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
    target, meta = CACHE / (key + '.mp3'), CACHE / (key + '.json')
    old = json.loads(meta.read_text(encoding='utf-8')) if meta.exists() else None
    if old and target.exists() and old.get('audioHash') == sha(target.read_bytes()) and old.get('identity') == identity:
        aligned = align_boundaries(texts, old['wordBoundaries'])
        return key, old['audioHash'], await asyncio.to_thread(pcm, target), aligned, True
    # A changed role parser must not redownload identical validated voice text.
    # Earlier request caches used the layout revision as a namespace; accept
    # only exact request identity + audio hash + complete boundary coverage.
    for prior_version in ['curriculum-role-pauses-v68-2', 'curriculum-role-pauses-v68-1']:
        previous_identity = {**identity, 'version': prior_version}
        previous_key = sha(json.dumps(previous_identity, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
        previous_target, previous_meta = CACHE / (previous_key + '.mp3'), CACHE / (previous_key + '.json')
        if not previous_meta.exists() or not previous_target.exists(): continue
        previous = json.loads(previous_meta.read_text(encoding='utf-8'))
        if previous.get('identity') != previous_identity or previous.get('audioHash') != sha(previous_target.read_bytes()): continue
        aligned = align_boundaries(texts, previous['wordBoundaries'])
        return previous_key, previous['audioHash'], await asyncio.to_thread(pcm, previous_target), aligned, True
    incoming = CACHE / (key + '.' + uuid.uuid4().hex + '.mp3')
    try:
        for attempt in range(3):
            boundaries = []
            try:
                with incoming.open('wb') as output:
                    async for event in edge_tts.Communicate(identity['text'], voice=voice, rate=rate, boundary='WordBoundary', connect_timeout=25, receive_timeout=90).stream():
                        if event['type'] == 'audio': output.write(event['data'])
                        elif event['type'] == 'WordBoundary': boundaries.append({k: event[k] for k in ['text', 'offset', 'duration']})
                aligned = align_boundaries(texts, boundaries)
                duration = await asyncio.to_thread(probe, incoming); decoded = await asyncio.to_thread(pcm, incoming)
                if len(decoded) < 1000: raise ValueError('Empty synthesized speech')
                audio_hash = sha(incoming.read_bytes()); os.replace(incoming, target)
                write_json(meta, {'identity': identity, 'audioHash': audio_hash, 'durationSeconds': duration, 'wordBoundaries': boundaries})
                return key, audio_hash, decoded, aligned, False
            except Exception:
                if attempt == 2: raise
                await asyncio.sleep(2 ** attempt)
    finally: incoming.unlink(missing_ok=True)


def publish(target, meta_path, candidate, metadata):
    """Publish only complete verified media; retain original rollback bytes."""
    target.parent.mkdir(parents=True, exist_ok=True); meta_path.parent.mkdir(parents=True, exist_ok=True)
    incoming, incoming_meta = target.with_name(target.name + '.incoming'), meta_path.with_name(meta_path.name + '.incoming')
    previous = target.read_bytes() if target.exists() else None
    previous_meta = meta_path.read_bytes() if meta_path.exists() else None
    backup = WORK / 'originals'; backup.mkdir(parents=True, exist_ok=True)
    for raw, extension in [(previous, '.mp3'), (previous_meta, '.json')]:
        if raw is not None:
            copy = backup / (target.stem + '-' + sha(raw)[:16] + extension)
            if not copy.exists(): copy.write_bytes(raw)
    incoming.write_bytes(candidate.read_bytes()); incoming_meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if sha(incoming.read_bytes()) != metadata['audioHash']: raise ValueError('Staged MP3 hash mismatch')
    replaced = False
    try:
        os.replace(incoming, target); replaced = True; os.replace(incoming_meta, meta_path)
    except Exception:
        if replaced and previous is not None: incoming.write_bytes(previous); os.replace(incoming, target)
        raise
    finally: incoming.unlink(missing_ok=True); incoming_meta.unlink(missing_ok=True)


def metadata_for(material, planned, config, digest, rate, duration, audio_hash, segments, origin):
    return {'id': material['id'], 'schema': 3, 'layoutVersion': LAYOUT_VERSION, 'transcriptHash': sha(material['transcript']), 'configurationHash': digest, 'configuration': config, 'audioHash': audio_hash, 'voices': list(dict.fromkeys(s['voice'] for s in planned['segments'])), 'roleVoices': planned['roleVoices'], 'durationSeconds': duration, 'synthetic': True, 'provider': 'Microsoft online TTS via edge-tts', 'authoringPackageVersion': VERSION, 'rate': rate, 'pauseConfiguration': pause_settings(material), 'segments': segments, 'origin': origin, 'locale': 'en-US', 'minimumSpeakers': (material.get('audioRequirements') or {}).get('minimumSpeakers', 0), 'note': '项目原创美式英语合成音频。角色固定分配音色，旁白独立。段位置来自实际PCM拼接，分词时间来自服务真实WordBoundary。未改变原文；不是原声真人或独立听审。保留单段原音时没有虚称新增停顿。'}


async def generate(file, semaphore, checkpoint):
    async with semaphore:
        material = json.loads(file.read_text(encoding='utf-8')); mid = material['id']
        planned, config, digest, rate = settings(material)
        target, meta_path = OUT / (mid + '.mp3'), META / (mid + '.json')
        old = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
        if target.exists() and old.get('configurationHash') == digest and old.get('audioHash') == sha(target.read_bytes()):
            await asyncio.to_thread(probe, target); status = 'cached'
        elif target.exists() and len(planned['segments']) == 1 and old.get('transcriptHash') == sha(material['transcript']) and old.get('rate') == rate and old.get('voices') == [planned['segments'][0]['voice']] and (not old.get('audioHash') or old['audioHash'] == sha(target.read_bytes())):
            duration = await asyncio.to_thread(probe, target); await asyncio.to_thread(pcm, target)
            segment = {k: v for k, v in planned['segments'][0].items() if k != 'text'}
            segment.update({'startSeconds': 0, 'endSeconds': duration, 'durationSeconds': duration, 'pauseBeforeSeconds': 0})
            write_json(meta_path, metadata_for(material, planned, config, digest, rate, duration, sha(target.read_bytes()), [segment], 'retained-verified-single-segment')); status = 'retained-single'
        else:
            groups = {}; group_cache_hits = 0
            for voice in dict.fromkeys(s['voice'] for s in planned['segments']):
                selected = [(i, s) for i, s in enumerate(planned['segments']) if s['voice'] == voice]
                key, group_hash, decoded, boundaries, cached = await voice_group([s['text'] for _, s in selected], voice, rate); group_cache_hits += int(cached); count = len(decoded) // 2
                for at, (index, segment) in enumerate(selected):
                    bound = boundaries[at]
                    lower = 0 if at == 0 else (boundaries[at - 1]['endSeconds'] + bound['startSeconds']) / 2
                    upper = count / HZ if at == len(selected) - 1 else (bound['endSeconds'] + boundaries[at + 1]['startSeconds']) / 2
                    first, last = max(0, round(max(lower, bound['startSeconds'] - .06) * HZ)), min(count, round(min(upper, bound['endSeconds'] + .12) * HZ))
                    if last <= first: raise ValueError('Invalid actual speech slice')
                    groups[index] = (decoded[first * 2:last * 2], {'groupConfigurationHash': key, 'groupAudioHash': group_hash, 'groupStartSeconds': first / HZ, 'groupEndSeconds': last / HZ, 'wordStartSeconds': bound['startSeconds'], 'wordEndSeconds': bound['endSeconds']})
            joined, segment_meta = bytearray(), []
            for index, segment in enumerate(planned['segments']):
                joined.extend(b'\0\0' * round(segment['pauseBeforeSeconds'] * HZ)); start = len(joined) / 2 / HZ
                content, source = groups[index]; joined.extend(content); end = len(joined) / 2 / HZ
                segment_meta.append({**{k: v for k, v in segment.items() if k != 'text'}, **source, 'startSeconds': start, 'endSeconds': end, 'durationSeconds': end - start})
            wave_path, candidate = WORK / (mid + '.wav'), WORK / (mid + '-complete.mp3')
            try:
                with wave.open(str(wave_path), 'wb') as output:
                    output.setnchannels(1); output.setsampwidth(2); output.setframerate(HZ); output.writeframes(joined)
                await asyncio.to_thread(run, ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wave_path), '-ar', str(HZ), '-ac', '1', '-b:a', '48k', str(candidate)])
                duration = await asyncio.to_thread(probe, candidate); final = await asyncio.to_thread(pcm, candidate)
                if abs(len(final) - len(joined)) / 2 / HZ > .1: raise ValueError('Encoded playback duration drift')
                metadata = metadata_for(material, planned, config, digest, rate, duration, sha(candidate.read_bytes()), segment_meta, 'role-group-tts-with-real-boundary-cuts'); metadata['reusedVoiceGroups'] = group_cache_hits
                await asyncio.to_thread(publish, target, meta_path, candidate, metadata)
            finally: wave_path.unlink(missing_ok=True); candidate.unlink(missing_ok=True)
            status = 'generated'
        checkpoint[mid] = {'status': status, 'configurationHash': digest}; write_json(WORK / 'checkpoint.json', {'layoutVersion': LAYOUT_VERSION, 'completed': checkpoint})
        print(json.dumps({'id': mid, 'status': status, 'segments': len(planned['segments']), 'voices': len(set(s['voice'] for s in planned['segments']))}), flush=True)
        return status


def selected_files(ids, tolerant=False):
    files = []
    for file in sorted(MATERIALS.glob('*.json')):
        try:
            material = json.loads(file.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError) as error:
            if not tolerant: raise
            print(json.dumps({'deferredSource': file.name, 'reason': type(error).__name__}), flush=True)
            continue
        if material.get('skill') == 'listening' and material.get('audioSynthetic') is not False and material.get('transcript', '').strip() and (not ids or material['id'] in ids): files.append(file)
    if ids and len(files) != len(set(ids)): raise ValueError('Unknown ID or non-synthetic material')
    return files


def audit(files):
    items, errors = [], []
    for file in files:
        material = json.loads(file.read_text(encoding='utf-8')); mid = material['id']
        try:
            planned, config, digest, _ = settings(material); meta = json.loads((META / (mid + '.json')).read_text(encoding='utf-8')); target = OUT / (mid + '.mp3')
            if meta.get('configurationHash') != digest or meta.get('configuration') != config or meta.get('audioHash') != sha(target.read_bytes()) or meta.get('transcriptHash') != sha(material['transcript']): raise ValueError('Configuration/transcript/audio hash mismatch')
            duration, decoded, segments, maximum = probe(target), pcm(target), meta['segments'], 0
            if meta.get('id') != mid or meta.get('layoutVersion') != LAYOUT_VERSION or meta.get('roleVoices') != planned['roleVoices'] or meta.get('voices') != list(dict.fromkeys(s['voice'] for s in planned['segments'])): raise ValueError('Published identity/voice metadata mismatch')
            if abs(meta.get('durationSeconds', -1) - duration) > .1: raise ValueError('Published duration mismatch')
            if len(segments) != len(planned['segments']): raise ValueError('Missing source segments')
            for index, (segment, expected) in enumerate(zip(segments, planned['segments'])):
                for key in ['role', 'speaker', 'voice', 'sourceStart', 'sourceEnd', 'textHash', 'pauseBeforeSeconds']:
                    if segment[key] != expected[key]: raise ValueError('Source role/span/pause mismatch')
                if sha(material['transcript'][segment['sourceStart']:segment['sourceEnd']]) != segment['textHash']: raise ValueError('Non-verbatim source span')
                if segment['startSeconds'] < 0 or segment['endSeconds'] <= segment['startSeconds'] or segment['endSeconds'] > duration + .1: raise ValueError('Invalid segment positions')
                if abs(segment['durationSeconds'] - (segment['endSeconds'] - segment['startSeconds'])) > 1 / HZ: raise ValueError('Invalid segment duration')
                if index:
                    gap = segment['startSeconds'] - segments[index - 1]['endSeconds']
                    if abs(gap - expected['pauseBeforeSeconds']) > 1 / HZ: raise ValueError('Actual pause duration mismatch')
                    left, right = round((segment['startSeconds'] - gap * .75) * HZ) * 2, round((segment['startSeconds'] - gap * .25) * HZ) * 2
                    samples = array('h', decoded[left:right]); rms = math.sqrt(sum((s / 32768) ** 2 for s in samples) / max(1, len(samples))); maximum = max(maximum, rms)
                    if rms > .003: raise ValueError('Encoded pause is not quiet')
            items.append({'id': mid, 'audioHash': meta['audioHash'], 'configurationHash': digest, 'transcriptHash': meta['transcriptHash'], 'durationSeconds': duration, 'segments': len(segments), 'voices': meta['voices'], 'pauseCount': max(0, len(segments) - 1), 'maximumPauseRms': maximum, 'origin': meta['origin']})
        except Exception as error: errors.append({'id': mid, 'error': type(error).__name__ + ': ' + str(error)[:160]})
    report = {'schema': 1, 'layoutVersion': LAYOUT_VERSION, 'complete': not errors, 'materials': len(files), 'items': items, 'errors': errors, 'scope': 'Recomputed source spans/configuration/audio hashes, decoded mono MP3 and encoded silence gaps; not ASR or independent listening review.'}
    write_json(META / 'role-pause-audit.json', report); print(json.dumps({k: v for k, v in report.items() if k != 'items'}), flush=True)
    return report


async def main(args):
    files = selected_files(args.id, tolerant=args.watch)
    if args.plan:
        materials = [json.loads(f.read_text(encoding='utf-8')) for f in files]
        plans = [settings(m)[0] for m in materials]
        labels = Counter(label['label'] for p in plans for label in p['sourceLabels'])
        prose_colons = Counter(match['label'] for m in materials for match in LABEL.finditer(m['transcript'])) - labels
        print(json.dumps({'materials': len(files), 'segments': sum(len(p['segments']) for p in plans), 'voiceGroups': sum(len(set(s['voice'] for s in p['segments'])) for p in plans), 'singleSegments': sum(len(p['segments']) == 1 for p in plans), 'layoutVersion': LAYOUT_VERSION, 'speakerLabelCounts': dict(labels.most_common()), 'spokenContentColonCounts': dict(prose_colons.most_common())})); return
    if args.audit:
        report = await asyncio.to_thread(audit, files)
        if not report['complete']: raise SystemExit(1)
        return
    for folder in [OUT, META, WORK, CACHE]: folder.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + 5400
    while True:
        if args.watch:
            # Adopt reviewed role-parser fixes between complete batches, never
            # while one media file/configuration is being assembled.
            refreshed = importlib.reload(importlib.import_module('curriculum_audio_layout'))
            for name in ['LABEL', 'LAYOUT_VERSION', 'PAUSES', 'align_boundaries', 'configuration', 'layout', 'sha', 'with_role_voices']: globals()[name] = getattr(refreshed, name)
            files = selected_files(args.id, tolerant=True)
        checkpoint, semaphore = {}, asyncio.Semaphore(args.concurrency)
        results = await asyncio.gather(*(generate(file, semaphore, checkpoint) for file in files), return_exceptions=True)
        errors = [{'id': file.stem, 'error': type(r).__name__ + ': ' + str(r)[:160]} for file, r in zip(files, results) if isinstance(r, Exception)]
        stats = {'layoutVersion': LAYOUT_VERSION, 'materials': len(files), 'generated': results.count('generated'), 'cached': results.count('cached'), 'retainedSingle': results.count('retained-single'), 'failed': len(errors), 'errors': errors}
        write_json(WORK / 'last-run.json', stats); print(json.dumps(stats), flush=True)
        if not args.watch or time.monotonic() >= deadline:
            if errors: raise SystemExit(1)
            return
        await asyncio.sleep(12)


def cli():
    parser = argparse.ArgumentParser(); parser.add_argument('--id', action='append'); parser.add_argument('--concurrency', type=int, default=3); parser.add_argument('--plan', action='store_true'); parser.add_argument('--audit', action='store_true'); parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.concurrency <= 4: parser.error('concurrency must be 1–4')
    asyncio.run(main(args))

