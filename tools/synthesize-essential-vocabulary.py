"""Generate standalone headword MP3s from verified word-boundary batches."""
import argparse,asyncio,json,hashlib,os,re,subprocess,sys,time,uuid
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--limit',type=int,default=8000);p.add_argument('--concurrency',type=int,default=6);p.add_argument('--batch',type=int,default=40);args=p.parse_args()
ROOT=args.root;sys.path.insert(0,str(ROOT/'tools'));import curriculum_audio_authoring as A
WORK=ROOT/'work/essential-vocabulary/audio-us';WORK.mkdir(parents=True,exist_ok=True);A.CACHE=WORK/'groups';A.CACHE.mkdir(exist_ok=True);A.GROUP_VERSION='essential-word-groups-v69-us-1'
OUT=ROOT/'audio/vocabulary';META=OUT/'metadata';META.mkdir(parents=True,exist_ok=True)
def js(script):return json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,creationflags=A.FLAGS).decode('utf-8'))
seed=js("const d=require('./assets/essential-vocabulary-data.js');console.log(JSON.stringify(d.entries||d.words||[]))")[:args.limit]
if not seed:raise ValueError('Published essential vocabulary is empty')
items=js("console.log(JSON.stringify(require('./assets/vocabulary-audio.js').items))")
course_words=js("console.log(JSON.stringify(require('./assets/curriculum-data.js').materials.flatMap(m=>m.type==='vocabulary'?(m.vocabulary||[]).map(v=>v.word):[])))")
known={e['word'].lower() for e in seed}
for w in list(items)+course_words:
 if w.strip().lower() not in known:seed.append({'word':w.strip()});known.add(w.strip().lower())
def sha(v):return hashlib.sha256(v.encode('utf-8') if isinstance(v,str) else v).hexdigest()
def filenames(word):
 key=word.strip().lower();slug=re.sub('[^a-z0-9]+','-',key).strip('-')[:55];name=slug+'-'+sha(key)[:10];return OUT/(name+'.mp3'),META/(name+'.json')
def valid_existing(word):
 info=items.get(word.lower());file=ROOT/(info or {}).get('audio','')
 return bool(info and info.get('voice')=='en-US-AriaNeural' and file.is_file() and info.get('audioHash')==sha(file.read_bytes()))
def attach_configuration(info):
 config={key:info[key] for key in ['word','voice','locale','rate','groupConfigurationHash','groupAudioHash','wordStartSeconds','wordEndSeconds','groupSliceStartSeconds','groupSliceEndSeconds']}
 config.update({'method':'provider-word-boundary-slice-v1','output':'mp3-24000-mono-48k','leadingSilenceSeconds':.12,'trailingSilenceSeconds':.16})
 info['configuration']=config;info['configurationHash']=sha(json.dumps(config,ensure_ascii=False,sort_keys=True,separators=(',',':')))
 return info

def repair_existing_metadata():
 repaired=0
 for entry in seed:
  word=entry['word'];target,meta=filenames(word)
  if not valid_existing(word) or not meta.is_file():continue
  info=json.loads(meta.read_text(encoding='utf-8'))
  if info.get('configurationHash') or not info.get('groupConfigurationHash'):continue
  if info.get('audioHash')!=sha(target.read_bytes()) or info.get('textHash')!=sha(info['word']):raise ValueError('Existing audio metadata mismatch: '+word)
  A.write_json(meta,attach_configuration(info));repaired+=1
 return repaired

def emit():
 ordered=dict(sorted(items.items()));data={'schema':1,'voice':'en-US-AriaNeural' if all(v.get('voice')=='en-US-AriaNeural' for v in items.values()) else 'mixed-during-authoring','locale':'en-US','rate':'-10%','count':len(ordered),'items':ordered};raw="/* Generated standalone vocabulary audio; verified local MP3 files only. */\n(function(root){'use strict';const data="+json.dumps(data,ensure_ascii=False,separators=(',',':'))+";root.IELTSVocabularyAudio=data;if(typeof module==='object'&&module.exports)module.exports=data;})(typeof globalThis!=='undefined'?globalThis:this);\n"
 target=ROOT/'assets/vocabulary-audio.js';temp=target.with_name(target.name+'.incoming');temp.write_text(raw,encoding='utf-8');os.replace(temp,target)
async def save_one(word,pcm,bound,left,right,group_hash,group_key):
 target,meta=filenames(word);start=max(left,bound['startSeconds']-.10);end=min(right,bound['endSeconds']+.16);first=max(0,round(start*A.HZ));last=min(len(pcm)//2,round(end*A.HZ));chunk=bytes(round(.12*A.HZ)*2)+pcm[first*2:last*2]+bytes(round(.16*A.HZ)*2)
 if len(chunk)<2000:raise ValueError('Empty word slice')
 temporary=WORK/(target.stem+'.'+uuid.uuid4().hex+'.mp3')
 def encode():
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','s16le','-ar',str(A.HZ),'-ac','1','-i','pipe:0','-b:a','48k',str(temporary)],input=chunk,check=True,capture_output=True,creationflags=A.FLAGS)
  duration=A.probe(temporary);audio_hash=sha(temporary.read_bytes());incoming=target.with_suffix('.mp3.incoming');incoming.write_bytes(temporary.read_bytes());os.replace(incoming,target);temporary.unlink()
  info={'word':word,'textHash':sha(word),'audioHash':audio_hash,'voice':'en-US-AriaNeural','locale':'en-US','rate':'-10%','durationSeconds':duration,'synthetic':True,'provider':'Microsoft online TTS via edge-tts','groupConfigurationHash':group_key,'groupAudioHash':group_hash,'wordStartSeconds':bound['startSeconds'],'wordEndSeconds':bound['endSeconds'],'groupSliceStartSeconds':first/A.HZ,'groupSliceEndSeconds':last/A.HZ,'note':'美式合成示范，分词边界来自服务实际时间；音标供核对，当前引擎不支持逐音素强制，不能称所有音素人工验证。'};A.write_json(meta,info)
  A.write_json(meta,attach_configuration(info))
  return {'audio':target.relative_to(ROOT).as_posix(),'durationSeconds':duration,'textHash':sha(word),'audioHash':audio_hash,'source':'generated','synthetic':True,'voice':'en-US-AriaNeural','locale':'en-US'}
 previous_variants=items.get(word.lower(),{}).get('senseVariants',[])
 items[word.lower()]=await asyncio.to_thread(encode)
 if previous_variants:items[word.lower()]['senseVariants']=previous_variants
started=time.time();done=0;errors=[]
async def main():
 global done
 repaired=repair_existing_metadata()
 print(json.dumps({'metadataRepaired':repaired}),flush=True)
 pending=[e['word'] for e in seed if not valid_existing(e['word'])];batches=[pending[i:i+args.batch] for i in range(0,len(pending),args.batch)];sem=asyncio.Semaphore(args.concurrency)
 print(json.dumps({'total':len(seed),'pending':len(pending),'reuse':len(seed)-len(pending),'groups':len(batches)}),flush=True)
 async def batch(words):
  global done
  async with sem:
   try:
    group_key,group_hash,pcm,bounds,_=await A.voice_group([word+'.' for word in words],'en-US-AriaNeural','-10%')
    for i,(word,bound) in enumerate(zip(words,bounds)):
     left=0 if i==0 else (bounds[i-1]['endSeconds']+bound['startSeconds'])/2;right=len(pcm)/2/A.HZ if i==len(words)-1 else (bound['endSeconds']+bounds[i+1]['startSeconds'])/2
     await save_one(word,pcm,bound,left,right,group_hash,group_key)
    done+=len(words)
    if done%400<args.batch:emit()
    print(json.dumps({'generated':done,'pending':len(pending),'failed':len(errors),'elapsedSeconds':round(time.time()-started)}),flush=True)
   except Exception as error:
    errors.append({'words':words,'error':type(error).__name__+': '+str(error)[:150]});print(json.dumps({'error':errors[-1]}),flush=True)
 await asyncio.gather(*(batch(words) for words in batches));emit();A.write_json(ROOT/'curriculum/essential-vocabulary-audio-audit.json',{'schema':1,'target':len(seed),'mapped':sum(valid_existing(e['word']) for e in seed),'generated':done,'reused':len(seed)-len(pending),'errors':errors,'synthetic':True,'boundaryMethod':'actual provider WordBoundary; midpoint-constrained padded clips','complete':not errors})
 print(json.dumps({'complete':not errors,'generated':done,'errors':len(errors),'elapsedSeconds':round(time.time()-started)}),flush=True)
 if errors:raise SystemExit(1)
asyncio.run(main())
