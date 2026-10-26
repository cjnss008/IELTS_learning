"""Author one sense-specific US model; preserve the default adjective recording."""
import argparse, asyncio, hashlib, importlib.util, json, os, subprocess
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);args=p.parse_args();root=args.root
spec=importlib.util.spec_from_file_location('independent_audio',root/'tools/synthesize-independent-bank.py')
A=importlib.util.module_from_spec(spec);spec.loader.exec_module(A)
word='compact';sentence='Please compact the loose soil.';voice='en-US-AriaNeural';rate='-10%'
configuration={'word':word,'context':sentence,'voice':voice,'locale':'en-US','rate':rate,'format':'mp3-24000-mono-48k','method':'context-word-boundary-v1','ipa':'/kəmˈpækt/','pos':'verb'}
sha=lambda value:hashlib.sha256(value.encode('utf-8') if isinstance(value,str) else value).hexdigest()
config_hash=sha(json.dumps(configuration,ensure_ascii=False,sort_keys=True,separators=(',',':')))
stem='compact-verb-us-'+config_hash[:10]
out=root/'audio/vocabulary';work=root/'work/context-pronunciation';work.mkdir(parents=True,exist_ok=True)
target=out/(stem+'.mp3');source=out/(stem+'-context-source.mp3');metadata=out/'metadata'/(stem+'.json')

async def main():
    mapping=A.read_mapping();default=dict(mapping['items'][word]);raw=work/(stem+'-raw.mp3');normalized=work/(stem+'-clip.mp3')
    if target.exists() and metadata.exists():
        proof=json.loads(metadata.read_text(encoding='utf-8'))
        if proof['configurationHash']!=config_hash or proof['audioHash']!=sha(target.read_bytes()) or proof['contextExtraction']['sourceAudioHash']!=sha(source.read_bytes()):raise RuntimeError('Existing sense recording is inconsistent; no replacement performed')
    else:
        extraction=await A.synth_context_word(word,sentence,voice,rate,raw)
        source_incoming=source.with_suffix('.mp3.incoming');source_incoming.write_bytes(raw.read_bytes());os.replace(source_incoming,source)
        duration=A.probe(source);extraction.update({'sourceAudio':source.relative_to(root).as_posix(),'sourceAudioHash':sha(source.read_bytes()),'sourceDurationSeconds':duration})
        if extraction['endSeconds']>duration+.1:raise RuntimeError('Provider word boundary outside actual audio')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(raw),'-ss',str(extraction['startSeconds']),'-t',str(extraction['endSeconds']-extraction['startSeconds']),'-ar','24000','-ac','1','-b:a','48k',str(normalized)],check=True,capture_output=True,creationflags=A.FLAGS)
        clip_duration=A.probe(normalized);incoming=target.with_suffix('.mp3.incoming');incoming.write_bytes(normalized.read_bytes());os.replace(incoming,target)
        proof={'schema':1,'word':word,'voice':voice,'locale':'en-US','rate':rate,'configuration':configuration,'configurationHash':config_hash,'textHash':sha(word),'audioHash':sha(target.read_bytes()),'durationSeconds':clip_duration,'synthetic':True,'provider':'Microsoft online TTS via edge-tts','contextExtraction':extraction,'note':'美式动词语境示范：服务实际词边界截取。不是人工音素听审或发音评分。'}
        A.write_json(metadata,proof)
    variant={'ipa':configuration['ipa'],'pos':'verb','senseLabels':['压实','压缩','使紧密结合'],'audio':target.relative_to(root).as_posix(),'audioHash':proof['audioHash'],'textHash':proof['textHash'],'durationSeconds':proof['durationSeconds'],'configurationHash':config_hash,'source':'generated','voice':voice,'locale':'en-US','synthetic':True}
    variants=[v for v in default.get('senseVariants',[]) if not(v.get('ipa')==variant['ipa'] and v.get('pos')=='verb')]+[variant]
    mapping['items'][word]={**default,'senseVariants':variants};A.emit_mapping(mapping)
    if mapping['items'][word]['audio']!=default['audio'] or mapping['items'][word]['audioHash']!=default['audioHash']:raise RuntimeError('Default recording changed')
    print(json.dumps({'word':word,'defaultPreserved':True,'variant':variant,'contextExtraction':proof['contextExtraction']},ensure_ascii=True),flush=True)

asyncio.run(main())
