'use strict';
// Authoring CLI only. The shared UMD core also runs without fs/Node in a browser.
const fs=require('node:fs'),path=require('node:path'),Core=require('../assets/public-course-planner.js');
function vocabularyCoverageReference(root,contexts){
 const file=path.join(root,'curriculum/public-target-coverage.json'),bytes=fs.readFileSync(file),report=JSON.parse(bytes);
 if(report.publicRelease?.sha256!==contexts.release?.sha256||report.publicSources!==contexts.sources.length)throw Error('Refresh the public target-coverage audit for this source release');
 const numbers={targetHeadwords:report.essentialTarget,scheduledLiteralCandidates:report.baseline?.headwordsWithSourceFamilyForm,publicLiteralCandidates:report.publicHeadwordCandidates,incrementalLiteralCandidates:report.additionalOrthographicCandidates,unionLiteralCandidates:report.combinedOrthographicCandidates,remainingWithoutLocatedLiteralCandidate:report.remainingOrthographicGaps};
 if(Object.values(numbers).some(v=>!Number.isInteger(v)||v<0)||numbers.unionLiteralCandidates+numbers.remainingWithoutLocatedLiteralCandidate!==numbers.targetHeadwords)throw Error('Invalid vocabulary source-audit reference');
 return{status:'source-audit-reference-not-sense-teaching',...numbers,meaningCoverageVerified:0,masteryCredit:0,provenance:'curriculum/public-target-coverage.json',reportSha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),reportGeneratedAt:report.generatedAt,scope:'Located orthographic candidates from the source-acquisition audit; not a fresh mastery/semantic coverage measurement or execution of context links.'};
}
function main(argv=process.argv.slice(2)){
 const args={};for(let i=0;i<argv.length;i+=2){if(!/^--/.test(argv[i])||!argv[i+1])throw Error('Options require values');args[argv[i].slice(2)]=argv[i+1];}
 if(!args.root||!args.output)throw Error('Explicit local code-only --root and staging --output required');
 const root=path.resolve(args.root),output=path.resolve(args.output),data=require(path.join(root,'assets/curriculum-data.js')),sourceContexts=require(path.join(root,'assets/public-context-data.js')),entries=require(path.join(root,'assets/essential-vocabulary-data.js')).entries,A=require(path.join(root,'assets/assessment-core.js')),E=require(path.join(root,'assets/course-expansion.js'));
 const coverage=vocabularyCoverageReference(root,sourceContexts);
 const plan=Core.build(data,{sourceContexts,entries,materialContentHash:A.materialContentHash,expandDay:E.overlay,vocabularyCoverage:coverage});fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'public-course-plan.json'),JSON.stringify(plan,null,2)+'\n');
 fs.writeFileSync(path.join(output,'public-course-plan-audit.json'),JSON.stringify({schema:1,planHash:plan.planHash,status:plan.status,input:plan.input,policy:plan.policy,...plan.audit,blocked:plan.blocked,reviewBlocked:plan.reviewBlocked},null,2)+'\n');
 const compact=JSON.stringify(plan).replace(/</g,'\\u003c');fs.writeFileSync(path.join(output,'public-course-plan.js'),`(function(root){'use strict';const data=${compact};root.IELTSPublicCoursePlanData=data;if(typeof module==='object'&&module.exports)module.exports=data;})(typeof globalThis!=='undefined'?globalThis:this);\n`);
 console.log(JSON.stringify({planHash:plan.planHash,status:plan.status,...plan.audit.summary,blocking:plan.blocked}));return plan;
}
module.exports={...Core,vocabularyCoverageReference,main};if(require.main===module)try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
