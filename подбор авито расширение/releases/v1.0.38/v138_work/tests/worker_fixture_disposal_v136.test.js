'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.AF_HELPER_ROOT || __dirname;
const {loadWorker}=require(path.join(base,'helpers/worker_vm.cjs'));
test('a terminated worker fixture cannot re-arm a timer from a late continuation',async()=>{
 const w=loadWorker();let fired=false;
 w.dispose();
 await Promise.resolve().then(()=>w.ctx.setTimeout(()=>{fired=true},5));
 await new Promise(r=>setTimeout(r,40));
 assert.equal(fired,false,'late work from a disposed VM must be fenced like a terminated worker');
});
