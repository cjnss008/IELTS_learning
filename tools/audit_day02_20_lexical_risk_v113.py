#!/usr/bin/env python3
"""Read-only 2–20 base/linked word-risk audit. Emits JSON to stdout only."""
import csv
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_ECDICT = 'd1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc'

NODE_SCRIPT = r'''
const D = require('./assets/curriculum-data.js');
const V = require('./assets/essential-vocabulary-data.js');
const fs = require('node:fs');
const drafts = Array.from({length:10},(_,i)=>JSON.parse(fs.readFileSync(`curriculum/linked-course-next/day${i+11}.json`)));
process.stdout.write(JSON.stringify({
  days:D.days.filter(d=>d.day<=20).map(d=>({day:d.day,materials:d.tasks.filter(t=>t.skill==='vocabulary').flatMap(t=>t.materialIds)})),
  materials:D.materials.filter(m=>m.skill==='vocabulary').map(m=>({id:m.id,words:(m.vocabulary||[]).map(v=>v.word)})),
  dictionary:V.entries.map(e=>({id:e.id,word:e.word,variants:e.spellingVariants||[]})),
  linked:[...D.familyLessonRelease.units,...drafts].map(u=>({day:u.day,active:u.active,targets:u.targets.map(t=>({word:t.word||t.canonicalWord||t.surface,canonicalId:t.canonicalId}))}))
}));
'''

def norm(word):
    return ' '.join(str(word or '').lower().split())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    result = subprocess.run(['node', '-e', NODE_SCRIPT], cwd=str(ROOT), check=True, capture_output=True)
    data = json.loads(result.stdout)
    file_names = ['tools/audit_day02_20_lexical_risk_v113.py', 'assets/curriculum-data.js', 'assets/essential-vocabulary-data.js'] + [f'curriculum/linked-course-next/day{d}.json' for d in range(11, 21)]
    inputs = {name:digest(ROOT / name) for name in file_names}
    by_id = {m['id']:m for m in data['materials']}
    spelling_ids = {}
    for entry in data['dictionary']:
        for form in [entry['word'], *entry['variants']]:
            spelling_ids.setdefault(norm(form), set()).add(entry['id'])
    base = []
    for day in data['days']:
        for material_id in day['materials']:
            if material_id not in by_id:
                raise ValueError(f'Missing vocabulary material {material_id}')
            for word in by_id[material_id]['words']:
                if norm(word):
                    base.append({'day':day['day'],'word':word,'materialId':material_id})
    linked = []
    for unit in data['linked']:
        for target in unit['targets']:
            linked.append({'day':unit['day'],'word':target['word'],'canonicalId':target['canonicalId'],
                           'sourceStatus':'published' if unit['active'] else 'inactive-draft'})
    observed = {norm(x['word']) for x in base + linked}
    ecdict_path = ROOT / 'work/essential-vocabulary/ecdict.csv'
    inflections = {}
    if ecdict_path.exists():
        actual = digest(ecdict_path)
        inputs['work/essential-vocabulary/ecdict.csv'] = actual
        if actual != EXPECTED_ECDICT:
            raise ValueError('Cached ECDICT hash does not match pinned source')
        with ecdict_path.open(encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                word = norm(row['word'])
                if word not in observed:
                    continue
                parts = dict(part.split(':', 1) for part in row['exchange'].split('/') if ':' in part)
                lemma, tags = norm(parts.get('0')), parts.get('1', '')
                if lemma and lemma != word and any(c in tags for c in 'dispr3t'):
                    inflections[word] = {'possibleLemma':lemma,'exchange':row['exchange']}
        inflection_status = 'pinned-ecdict-exchange-candidates-only'
    else:
        inflection_status = 'cache-missing-inflection-comparison-not-performed'

    def relation(a, b):
        x, y = norm(a['word']), norm(b['word'])
        if x == y:
            return 'exact-surface'
        if spelling_ids.get(x, set()) & spelling_ids.get(y, set()):
            return 'known-core-spelling-variant'
        ax, by = inflections.get(x, {}).get('possibleLemma', x), inflections.get(y, {}).get('possibleLemma', y)
        if ax == by and (x in inflections or y in inflections):
            return 'possible-ecdict-inflection-needs-sense-review'
        return None

    day_rows = []
    for day in range(2, 21):
        today = [x for x in base if x['day'] == day]
        entries = []
        for item in today:
            prior = []
            for other in base:
                if other['day'] >= day:
                    continue
                why = relation(item, other)
                if why:
                    prior.append({'day':other['day'],'word':other['word'],'materialId':other['materialId'],'relation':why})
            entries.append({'word':item['word'],'materialId':item['materialId'],
                            'possibleEcdictInflection':inflections.get(norm(item['word'])),
                            'earlierLiteralBaseMatches':prior})
        targets = []
        for target in (x for x in linked if x['day'] == day):
            base_matches = []
            for other in base:
                why = relation(target, other)
                if why:
                    base_matches.append({'day':other['day'],'word':other['word'],'materialId':other['materialId'],
                                         'relation':why,'timing':'before' if other['day']<day else 'same-day' if other['day']==day else 'later-through-day20'})
            linked_matches = []
            for other in linked:
                if other['day'] >= day:
                    continue
                why = relation(target, other)
                if why or target['canonicalId'] == other['canonicalId']:
                    linked_matches.append({'day':other['day'],'word':other['word'],'canonicalId':other['canonicalId'],
                                           'sourceStatus':other['sourceStatus'],'relation':why or 'same-canonical-id'})
            targets.append({**target,'possibleEcdictInflection':inflections.get(norm(target['word'])),
                            'literalBaseMatchesThroughDay20':base_matches,'earlierLinkedMatches':linked_matches})
        day_rows.append({'day':day,'literalBaseVocabulary':entries,'linkedTargets':targets})
    risky_linked = []
    for day in day_rows:
        for target in day['linkedTargets']:
            relevant = [m for m in target['literalBaseMatchesThroughDay20'] if m['timing'] != 'later-through-day20']
            if relevant or target['earlierLinkedMatches']:
                risky_linked.append({'day':target['day'],'word':target['word'],'canonicalId':target['canonicalId'],
                                     'basePriorOrSameDay':relevant,'earlierLinked':target['earlierLinkedMatches']})
    output = {'schema':1,'scope':'第2–20课原始词汇任务与已发布4–10/未发布11–20关联目标的静态重合风险；不读取用户记录。',
              'method':{'exact':'大小写及空白规范化的词面','spelling':'核心8000登记的拼写变体映射到同一个canonicalId',
                        'inflection':inflection_status,'inflectionCaveat':'ECDICT的0/1仅产生待人工核义候选；分词可能承担独立形容词/名词义，不自动判为重复或新增。',
                        'timeline':'原始课表与关联版可能同时/交替使用；列出过往、同日和至20课未来位置，并不代表个人已学。'},
              'inputSha256':inputs,'summary':{'baseDays':19,'baseWordOccurrences':sum(len(x['literalBaseVocabulary']) for x in day_rows),
                    'baseOccurrencesWithEarlierLiteralBaseMatch':sum(bool(v['earlierLiteralBaseMatches']) for d in day_rows for v in d['literalBaseVocabulary']),
                    'linkedTargets':len(linked),'linkedTargetsWithPriorOrSameDayRisk':len(risky_linked),
                    'linkedTargetsWithEarlierLinkedRisk':sum(bool(v['earlierLinkedMatches']) for d in day_rows for v in d['linkedTargets'])},
              'linkedPriorOrSameDayRisks':risky_linked,'days':day_rows,
              'caveats':['无个人档案或已开始课信息，不推断实际掌握、新词数或实际重复。','同一词出现多次只作为来源位置；同源题、大小写和拼写变体不可凭出现次数计新增。','对potential inflection须按上下文核查词性和义项；普通屈折形不算独立新词。']}
    for name, expected in inputs.items():
        if digest(ROOT/name) != expected:
            raise ValueError(f'Input changed during audit: {name}')
    print(json.dumps(output, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
