'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),H=require('./selection-transfer-v94-fixture.cjs');
test('actual saved WritingPath independent H3 topic cannot open translation while ordinary learning remains available',async()=>{
  const value=await H.run();assert.equal(value.transferBodyIsActualParent,true);assert.equal(value.transferCaptureAllowed,false);assert.equal(value.triggerVisible,false);assert.equal(value.translationVisible,undefined);assert.equal(value.ordinarySurfaceStillAvailable,true);assert.equal(value.transferInputUnchanged,true);
});
