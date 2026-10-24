'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {materials}=require('../tools/listening-maps.cjs');
const A=require('../assets/assessment-core.js'),Player=require('../assets/course-player.js');
const onSegment=(p,a,b)=>a.x===b.x?p.x===a.x&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y):a.y===b.y&&p.y===a.y&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x);
const segments=plan=>plan.paths.flatMap(path=>path.points.slice(1).map((point,i)=>[path.points[i],point]));
const inside=(p,z)=>p.x>=z.x&&p.x<=z.x+z.w&&p.y>=z.y&&p.y<=z.y+z.h;
test('two original map tasks have bounded transcripts, 8 answerable items, exact evidence and no map answer labels',()=>{
  assert.deepEqual(materials.map(m=>[m.id,m.week]),[['listening-map-25',25],['listening-map-31',31]]);
  for(const material of materials){
    assert.equal(material.pool,'training');assert.equal(material.skill,'listening');assert.equal(material.fullTest,false);
    assert.equal(material.source.verification,'reviewed');assert.match(material.source.rights,/原创.*非官方/);
    assert.ok(A.countWords(material.transcript)>=250&&A.countWords(material.transcript)<=450,material.id);
    assert.equal(material.questions.length,8);assert.equal(material.questionCount,8);
    assert.equal(new Set(material.questions.map(q=>q.id)).size,8);
    for(const q of material.questions){assert.equal(q.type,'single');assert.ok(q.options.includes(q.answers[0]));assert.equal(A.gradeQuestion(q,q.answers[0]).correct,true);assert.ok(material.transcript.includes(q.evidence),q.id+' exact evidence');assert.match(q.explanation,/[\u4e00-\u9fff]/);for(const wrong of q.options.filter(v=>v!==q.answers[0]))assert.equal(A.gradeQuestion(q,wrong).correct,false);}
    const plan=Player.planGeometry(material.figure);assert.deepEqual(plan.zones.map(z=>z.label),['A','B','C','D','E','F']);
    assert.ok(!/<\/?[a-z][^>]*>/i.test(JSON.stringify(material.figure)));
    for(const q of material.questions.slice(0,6)){const target=q.prompt.match(/contains the (.*?)\?/)[1];assert.equal(JSON.stringify(material.figure).includes(target),false,target+' must not appear on the plan');}
  }
});
test('both plans connect every room, the entrance and all path segments without teleporting',()=>{
  for(const material of materials){
    const plan=Player.planGeometry(material.figure),lines=segments(plan);
    for(const [a,b]of lines)assert.ok(a.x===b.x||a.y===b.y,'orthogonal corridor');
    const touches=(a,b)=>a.some(p=>onSegment(p,...b))||b.some(p=>onSegment(p,...a))||a[0].x===a[1].x&&b[0].y===b[1].y&&onSegment({x:a[0].x,y:b[0].y},...a)&&onSegment({x:a[0].x,y:b[0].y},...b)||b[0].x===b[1].x&&a[0].y===a[1].y&&onSegment({x:b[0].x,y:a[0].y},...a)&&onSegment({x:b[0].x,y:a[0].y},...b);
    const reached=new Set(lines.flatMap((line,i)=>onSegment(plan.entrance,...line)?[i]:[]));assert.ok(reached.size);
    let previous=-1;while(previous!==reached.size){previous=reached.size;lines.forEach((line,i)=>{if([...reached].some(j=>touches(line,lines[j])))reached.add(i);});}assert.equal(reached.size,lines.length);
    for(const z of plan.zones){const boundaries=[[{x:z.x,y:z.y},{x:z.x+z.w,y:z.y}],[{x:z.x+z.w,y:z.y},{x:z.x+z.w,y:z.y+z.h}],[{x:z.x,y:z.y+z.h},{x:z.x+z.w,y:z.y+z.h}],[{x:z.x,y:z.y},{x:z.x,y:z.y+z.h}]];assert.ok(lines.some(line=>boundaries.some(edge=>touches(line,edge))),z.label+' has a reachable door edge');}
  }
});
test('spoken compass and turn sequences lead to the intended letter zones',()=>{
  // Coordinate y increases downwards, so north is negative y. Destinations are
  // derived from the six spoken instructions, not from the question answer list.
  const expected=[
    [{x:150,y:350},{x:490,y:350},{x:490,y:225},{x:150,y:225},{x:150,y:100},{x:490,y:100}],
    [{x:150,y:90},{x:350,y:55},{x:550,y:90},{x:550,y:430},{x:350,y:465},{x:150,y:430}]
  ];
  materials.forEach((material,i)=>expected[i].forEach((point,j)=>{const zones=material.figure.plan.zones.filter(z=>inside(point,z));assert.equal(zones.length,1);assert.equal(material.questions[j].answers[0],zones[0].label);}));
  const left=direction=>({x:direction.y,y:-direction.x});assert.deepEqual(left({x:-1,y:0}),{x:0,y:1},'leaving the workshop westward, left is south');assert.deepEqual(left({x:0,y:1}),{x:1,y:-0},'southward on the eastern park path, left is east');
  assert.ok(materials[1].figure.plan.landmarks.find(l=>l.label==='Pond').y<260);
});
test('plan geometry rejects unsafe or incomplete coordinates rather than guessing a map',()=>{
  for(const change of [p=>p.zones[0].x=NaN,p=>p.zones[0].w=-1,p=>p.zones[1].label='A',p=>p.paths[0].points[0].x=9999,p=>p.north=null,p=>p.entrance.label='',p=>p.landmarks=[{label:'Clock',x:1,y:Infinity}]]){const figure=structuredClone(materials[0].figure);change(figure.plan);assert.throws(()=>Player.planGeometry(figure));}
});
