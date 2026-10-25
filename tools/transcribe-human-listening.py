"""Optional offline authoring check, not a learner service or accent classifier.

Dependencies and the public model stay in ignored work/. No personal token,
learner archive or paid API is used. ASR output is a fallible comparison aid.
"""
import argparse, hashlib, importlib.metadata, json, os, subprocess, sys, types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'work' / 'human-asr-python'))
os.environ['HF_HOME'] = str(ROOT / 'work' / 'human-asr-hf-cache')
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
from huggingface_hub import snapshot_download
# Use the already installed ffmpeg decoder rather than loading PyAV's native
# decoder. Whisper inference still runs in the actual CTranslate2 model.
import numpy as np
decoder = types.ModuleType('faster_whisper.audio')
def decode_audio(input_file, sampling_rate=16000, split_stereo=False):
    if split_stereo: raise ValueError('This authoring tool accepts mono audio only')
    if not isinstance(input_file, (str, Path)): raise ValueError('Expected a local course audio path')
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(input_file), '-ar', str(sampling_rate), '-ac', '1', '-f', 'f32le', '-'], check=True, capture_output=True, creationflags=0x08000000 if os.name == 'nt' else 0)
    return np.frombuffer(result.stdout, dtype=np.float32)
def pad_or_trim(array, length=3000, axis=-1):
    if array.shape[axis] > length:
        return array.take(indices=range(length), axis=axis)
    if array.shape[axis] < length:
        pads = [(0, 0)] * array.ndim
        pads[axis] = (0, length - array.shape[axis])
        return np.pad(array, pads)
    return array
decoder.decode_audio = decode_audio
decoder.pad_or_trim = pad_or_trim
sys.modules['faster_whisper.audio'] = decoder
from faster_whisper import WhisperModel

def fox_tail_check(model, audio, output, force=False):
    target = output / 'fox-tail-check.json'
    if target.exists() and not force: return
    samples = decode_audio(audio)[60*16000:82*16000]
    segments, _ = model.transcribe(samples, language='en', beam_size=5, condition_on_previous_text=False, vad_filter=False)
    rows = [{'start': 60+s.start, 'end': 60+s.end, 'text': s.text.strip()} for s in segments]
    target.write_text(json.dumps({'inputOriginalAudioHash': hashlib.sha256(audio.read_bytes()).hexdigest(), 'originalRangeSeconds': [60, 82], 'referencePromptProvided': False, 'segments': rows}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def main(args):
    model_dir = ROOT / 'work' / 'human-asr-models' / args.model
    if not (model_dir / 'model.bin').exists():
        snapshot_download('Systran/faster-whisper-' + args.model, local_dir=str(model_dir), cache_dir=str(ROOT / 'work' / 'human-asr-hf-cache'), token=False, allow_patterns=['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.*', 'preprocessor_config.json'])
    model = WhisperModel(str(model_dir), device='cpu', compute_type='int8', cpu_threads=4)
    sources = sorted((ROOT / 'curriculum' / 'human-listening' / 'sources').glob('*.json'))
    output = ROOT / 'work' / 'human-listening-asr-output'
    output.mkdir(parents=True, exist_ok=True)
    for meta_path in sources:
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        if args.id and meta['id'] != args.id: continue
        target = output / (meta['id'] + '.json')
        preview = ROOT / 'work' / 'human-listening-asr-input' / (meta['id'] + '.wav')
        audio = preview if preview.exists() else ROOT / meta['originalAudio']
        if meta['id'] == 'independent-human-us-fox-crow':
            fox_tail_check(model, ROOT / meta['originalAudio'], output, args.force)
        audio_hash = hashlib.sha256(audio.read_bytes()).hexdigest()
        if target.exists() and not args.force:
            old = json.loads(target.read_text(encoding='utf-8'))
            if old.get('inputHash') == audio_hash and old.get('model') == args.model:
                print(json.dumps({'id': meta['id'], 'status': 'cached'}), flush=True)
                continue
        segments, info = model.transcribe(str(audio), language='en', beam_size=5, word_timestamps=True, condition_on_previous_text=False, vad_filter=False)
        rows = []
        for segment in segments:
            rows.append({'start': segment.start, 'end': segment.end, 'text': segment.text.strip(), 'avgLogprob': segment.avg_logprob, 'noSpeechProb': segment.no_speech_prob, 'words': [{'start': w.start, 'end': w.end, 'word': w.word, 'probability': w.probability} for w in segment.words or []]})
        result = {'schema': 1, 'id': meta['id'], 'inputAudio': audio.relative_to(ROOT).as_posix(), 'inputHash': audio_hash, 'model': args.model, 'modelRepository': 'Systran/faster-whisper-' + args.model, 'modelHash': hashlib.sha256((model_dir / 'model.bin').read_bytes()).hexdigest(), 'package': 'faster-whisper ' + importlib.metadata.version('faster-whisper'), 'decoder': 'installed ffmpeg CLI to mono float32; PyAV is not loaded', 'device': 'cpu', 'computeType': 'int8', 'referencePromptProvided': False, 'durationSeconds': info.duration, 'segments': rows, 'note': '真实原音的本机ASR对照；不能证明口音、真人程度或难度。仍须逐段与可信原文比较并核对片段句界。'}
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'id': meta['id'], 'status': 'transcribed', 'segments': len(rows), 'seconds': info.duration}), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default='base.en', choices=['tiny.en', 'base.en', 'small.en'])
    parser.add_argument('--id')
    parser.add_argument('--force', action='store_true')
    main(parser.parse_args())
