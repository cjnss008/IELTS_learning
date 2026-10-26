"""Rebuild only the 16 original synthetic independent recordings in US English.
Human originals and vocabulary publishing are never touched.
"""
import argparse, asyncio, json, os, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools'))
import curriculum_audio_authoring as A
from curriculum_audio_layout import layout,configuration

WORK=ROOT/'work/independent-us-audio'
A.WORK=WORK;A.CACHE=WORK/'groups';A.OUT=ROOT/'audio/independent-bank/us';A.META=WORK/'audio'

def settings(material):
    rate={'A1':'-18%','A2':'-8%','B1':'-3%','B2':'+0%'}[material['level']]
    planned=layout(material['transcript'],A.PAIRS[0],A.NARRATORS[0],A.PAIRS[1])
    for i,segment in enumerate(planned['segments']):
        if i:segment['pauseBeforeSeconds']=.45 if planned['segments'][i-1]['role']!=segment['role'] else 1.2
    config,digest=configuration(material['transcript'],planned,rate,A.VERSION)
    return planned,config,digest,rate
A.settings=settings

async def main(args):
    for folder in [WORK,A.CACHE,A.OUT,A.META]:folder.mkdir(parents=True,exist_ok=True)
    files=[]
    for file in sorted((ROOT/'curriculum/independent-bank/materials').glob('*.json')):
        material=json.loads(file.read_text(encoding='utf-8'))
        if material.get('skill')!='listening' or material.get('audioSynthetic') is not True:continue
        files.append(file)
    if len(files)!=16:raise ValueError('Expected exactly 16 synthetic independent sources, leaving humans untouched')
    semaphore=asyncio.Semaphore(args.concurrency);checkpoint={}
    results=await asyncio.gather(*(A.generate(file,semaphore,checkpoint) for file in files),return_exceptions=True)
    errors=[{'id':file.stem,'error':type(result).__name__+': '+str(result)[:200]} for file,result in zip(files,results) if isinstance(result,Exception)]
    if not errors:
        report=await asyncio.to_thread(A.audit,files)
        errors=report['errors']
    if not errors:
        for file in files:
            metadata=json.loads((A.META/(file.stem+'.json')).read_text(encoding='utf-8'))
            metadata['audio']=(A.OUT/(file.stem+'.mp3')).relative_to(ROOT).as_posix()
            A.write_json(ROOT/'curriculum/independent-bank/audio'/(file.stem+'.json'),metadata)
        A.write_json(ROOT/'curriculum/independent-bank/us-role-pause-audit.json',report)
    summary={'syntheticSources':16,'complete':not errors,'humansChanged':0,'vocabularyWrites':0,'errors':errors}
    A.write_json(WORK/'last-run.json',summary);print(json.dumps(summary),flush=True)
    return 1 if errors else 0

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--concurrency',type=int,choices=range(1,5),default=3)
    raise SystemExit(asyncio.run(main(parser.parse_args())))
