'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {loadWorker,ROOT}=require('./helpers/worker_vm.cjs');
test('actual packaged literal identity matches manifest (not a manifest-derived fake)',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json')));
 const a=fs.readFileSync(path.join(ROOT,'avito_content.js'),'utf8');
 assert.equal(a.match(/const ADAPTER_VERSION = "([^"]+)"/)[1],m.version);
});
test('persistent wrong adapter PING blocks UI execution after one reinjection',async()=>{
 const w=loadWorker({onMessage(id,msg,done,ctx){if(msg.type==='AF_AVITO_PING'){ctx.finish(done,{ok:true,version:'0.0.0'});return true;}}});
 try{await w.seed();await assert.rejects(w.h.sendAvito(7,2,{type:'AF_EXECUTE_AVITO_UI_PLAN'}),/AVITO_ADAPTER_VERSION_MISMATCH_RELOAD_REQUIRED/);
 assert.equal(w.calls.filter(c=>c[0]==='message'&&c[2]==='AF_EXECUTE_AVITO_UI_PLAN').length,0);
 assert.equal(w.calls.filter(c=>c[0]==='message'&&c[2]==='AF_AVITO_PING').length,2);
 }finally{w.dispose();}
});
test('matching adapter PING permits exactly one UI dispatch',async()=>{
 const w=loadWorker();try{await w.seed();const r=await w.h.sendAvito(7,2,{type:'AF_EXECUTE_AVITO_UI_PLAN'});assert.equal(r.ok,true);
 assert.equal(w.calls.filter(c=>c[0]==='message'&&c[2]==='AF_EXECUTE_AVITO_UI_PLAN').length,1);
 }finally{w.dispose();}
});
