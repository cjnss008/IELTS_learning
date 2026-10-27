'use strict';
const path=require('node:path'),assert=require('node:assert/strict'),base=path.resolve(__dirname,'..');
const A=require('../assets/assessment-core.js'),R=require('../assets/learning-records.js');
globalThis.IELTSAssessment=A;globalThis.IELTSVocabularyPractice=require('../assets/vocabulary-practice.js');globalThis.IELTSCourseExpansion=require('../assets/course-expansion.js');globalThis.IELTSPlanState=require('../assets/daily-plan-state.js');globalThis.IELTSPublicContextPractice=require('../assets/public-context-practice.js');
const P=require('../assets/course-player.js'),Hub=require('../assets/today-hub.js'),DOM=require('./year-first-use-dom-fixture.cjs');
function fixture(overrides={},options={}){return DOM.fixture(overrides,{...options,window:{...options.window,IELTSTodayHub:Hub}});}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));},open=async(f,skill='reading')=>{await settle();await f.nodes.get('courseTasks').children.find(n=>n.dataset.taskId===skill).fire('click');};
async function answer(f,value='red'){const input=f.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value===value);assert(input);input.checked=true;await input.fire('change');f.advance(1000);await f.nodes.get('courseSubmit').fire('click');await settle();}
module.exports={fixture,settle,open,answer,P,Hub,A,R,base};
