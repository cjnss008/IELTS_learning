'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./family-lessons-v95-fixture.cjs'),Composer=require('../tools/family-public-append-v1.cjs');

test('linked lessons append to the published 365-day public source without changing original material, day or plan contracts',()=>{
 const data=F.copy(require('../assets/curriculum-data.js')),before={days:JSON.stringify(data.days),materials:JSON.stringify(data.materials),plan:JSON.stringify(data.publicCoursePlan)};
 delete data.yearFirstUse;
 const pack=F.packageData(),result=Composer.append(data,{root:pack.root,releasePath:'fixtures/release.json',assessment:F.A,player:F.P,essential:require('../assets/essential-vocabulary-data.js')});
 assert.equal(result.result.added,6);assert.equal(result.result.units,1);
 assert.equal(JSON.stringify(data.days),before.days);
 assert.equal(JSON.stringify(data.materials.slice(0,-6)),before.materials);
 assert.equal(JSON.stringify(data.publicCoursePlan),before.plan);
 assert.equal(data.familyLessonRelease.publicAppendReceipt.appended.length,6);
 const changed=F.copy(require('../assets/curriculum-data.js'));changed.days[0].title+=' changed';
 assert.throws(()=>Composer.append(changed,{root:pack.root,releasePath:'fixtures/release.json'}),/original data mismatch/);
 assert.equal(changed.familyLessonRelease,undefined);
});
