"""Build original course audio. Requires edge-tts and ffmpeg for authoring only."""
import argparse, asyncio, hashlib, json, os, re, subprocess, time
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
MATERIALS = ROOT / 'curriculum' / 'materials'
OUT = ROOT / 'audio' / 'curriculum'
META = ROOT / 'curriculum' / 'audio'
TEMP = ROOT / 'private' / 'tts-work'
PAIRS = [('en-GB-SoniaNeural', 'en-GB-RyanNeural'), ('en-US-AriaNeural', 'en-US-GuyNeural'), ('en-AU-NatashaNeural', 'en-AU-WilliamNeural')]
for folder in (OUT,META,TEMP): folder.mkdir(parents=True,exist_ok=True)

def split_speakers(text,pair):
    rows=[]; speakers={}; current=pair[0]
    for line in text.splitlines():
        line=line.strip()
        if not line: continue
        match=re.match(r'^([A-Za-z][A-Za-z .\-]{0,26}):\s*(.+)$',line)
        if match and not re.match(r'^(Section|Part|Question|Narrator|Introduction)\b',match.group(1),re.I):
            speaker=match.group(1)
            if speaker not in speakers: speakers[speaker]=pair[len(speakers)%len(pair)]
            current=speakers[speaker];line=match.group(2)
        if rows and rows[-1][0]==current: rows[-1]=(current, rows[-1][1]+'\n'+line)
        else: rows.append((current,line))
    return rows or [(pair[0],text)]

async def generate(file,semaphore):
    async with semaphore:
        m=json.loads(file.read_text(encoding='utf8'))
        if m.get('skill')!='listening' or m.get('audioSynthetic') is False: return None
        text=m.get('transcript','').strip()
        if not text: return None
        digest=hashlib.sha256(text.encode()).hexdigest();target=OUT/(m['id']+'.mp3');meta=META/(m['id']+'.json')
        if target.exists() and meta.exists():
            old=json.loads(meta.read_text(encoding='utf8'))
            if old.get('transcriptHash')==digest and target.stat().st_size>1000:
                if not m.get('requireAudioHash') or old.get('audioHash')==hashlib.sha256(target.read_bytes()).hexdigest():return 'cached'
        pair=PAIRS[0 if m['week']<=8 else (m['week']-9)%len(PAIRS)];rate='-15%' if m['week']<=8 else '-5%' if m['week']<=20 else '+0%'
        segments=split_speakers(text,pair);parts=[];voices=[]
        for index,(voice,content) in enumerate(segments):
            part=TEMP/(m['id']+'-'+str(index)+'.mp3');voices.append(voice)
            last_error=None
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(content,voice=voice,rate=rate,connect_timeout=20,receive_timeout=90).save(str(part))
                    last_error=None;break
                except Exception as error:
                    last_error=error
                    await asyncio.sleep(2**attempt)
            if last_error: raise RuntimeError(type(last_error).__name__)
            parts.append(part)
        listing=TEMP/(m['id']+'.concat.txt');listing.write_text('\n'.join("file '"+str(p).replace('\\','/').replace("'","'\\''")+"'" for p in parts),encoding='utf8')
        temporary=TEMP/(m['id']+'-complete.mp3')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(listing),'-ar','24000','-ac','1','-b:a','48k',str(temporary)],check=True,capture_output=True,creationflags=0x08000000)
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(temporary)],creationflags=0x08000000).decode().strip())
        if duration<1 or temporary.stat().st_size<1000:raise RuntimeError('Invalid synthesized audio')
        os.replace(temporary,target)
        meta.write_text(json.dumps({'id':m['id'],'schema':2,'transcriptHash':digest,'audioHash':hashlib.sha256(target.read_bytes()).hexdigest(),'voices':list(dict.fromkeys(voices)),'durationSeconds':duration,'synthetic':True,'provider':'Microsoft online TTS via edge-tts','rate':rate,'note':'原创学习材料合成音频；不同音色/口音，不是真人录音。'},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        for part in parts:part.unlink(missing_ok=True)
        listing.unlink(missing_ok=True)
        print(json.dumps({'id':m['id'],'audio':'ready','seconds':round(duration)},ensure_ascii=False),flush=True)
        return 'ready'

async def main(watch):
    semaphore=asyncio.Semaphore(3);deadline=time.time()+(5400 if watch else 0)
    while True:
        files=[]
        for p in MATERIALS.glob('*.json'):
            try:
                m=json.loads(p.read_text(encoding='utf8'))
                if m.get('skill')=='listening':files.append(p)
            except (OSError,ValueError):pass
        results=await asyncio.gather(*(generate(p,semaphore) for p in files),return_exceptions=True)
        errors=[{'file':p.name,'error':type(r).__name__+': '+str(r)[:80]} for p,r in zip(files,results) if isinstance(r,Exception)]
        print(json.dumps({'scan':len(files),'new':results.count('ready'),'errors':errors},ensure_ascii=False),flush=True)
        if not watch or time.time()>deadline:break
        await asyncio.sleep(12)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--watch',action='store_true');args=parser.parse_args()
    asyncio.run(main(args.watch))
