'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const path=require('path');
const sourcePath=process.argv[2];
if(!sourcePath) throw new Error('SOURCE_PATH_REQUIRED');
const source=fs.readFileSync(sourcePath,'utf8');

function extractFunction(name){
  const asyncMarker=`async function ${name}`;
  const marker=`function ${name}`;
  let start=source.indexOf(asyncMarker);
  if(start<0) start=source.indexOf(marker);
  if(start<0) throw new Error(`FUNCTION_NOT_FOUND:${name}`);
  const paren=source.indexOf('(',start);
  if(paren<0) throw new Error(`FUNCTION_PARAMS_NOT_FOUND:${name}`);
  let pdepth=0, quote=null, esc=false, line=false, block=false, closeParen=-1;
  for(let i=paren;i<source.length;i++){
    const ch=source[i], next=source[i+1];
    if(line){if(ch==='\n') line=false; continue;}
    if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
    if(quote){if(esc){esc=false;continue;}if(ch==='\\'){esc=true;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='/'&&next==='/'){line=true;i++;continue;}
    if(ch==='/'&&next==='*'){block=true;i++;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='(') pdepth++;
    else if(ch===')'){pdepth--; if(pdepth===0){closeParen=i;break;}}
  }
  if(closeParen<0) throw new Error(`FUNCTION_PARAMS_UNTERMINATED:${name}`);
  const brace=source.indexOf('{',closeParen);
  if(brace<0) throw new Error(`FUNCTION_BODY_NOT_FOUND:${name}`);
  let depth=0; quote=null; esc=false; line=false; block=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i], next=source[i+1];
    if(line){if(ch==='\n') line=false; continue;}
    if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
    if(quote){if(esc){esc=false;continue;}if(ch==='\\'){esc=true;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='/'&&next==='/'){line=true;i++;continue;}
    if(ch==='/'&&next==='*'){block=true;i++;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{') depth++;
    else if(ch==='}') {depth--; if(depth===0) return source.slice(start,i+1);}
  }
  throw new Error(`FUNCTION_UNTERMINATED:${name}`);
}

const requested='https://www.avito.ru/yuzhno-sahalinsk/nastolnye_kompyutery/dell_vostro_3470_4750223208';
let created=0, applied=0, logged=0;
const context={
  String,
  Number,
  Error,
  persistedRunOwnedAvitoTab: async()=>null,
  selectVisibleAvitoTab: async()=>{throw new Error('AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB');},
  createInitialPublicAvitoTab: async(state,purpose)=>{created++; return {tab:{id:777,windowId:state.current_window_id,url:'https://www.avito.ru/'},created:true,navigated:false,reused:false,source:'initial_active_public_root'};},
  applyRequestedVisibleAvitoUrl: async(state,tab,url,purpose,source)=>{applied++; return {tab:{...tab,url},navigated:true,reload_requested:false,source,previous_url:'https://www.avito.ru/',requested_url:url};},
  log: async()=>{logged++;},
  shortTab:t=>t,
};
vm.createContext(context);
vm.runInContext(extractFunction('ensureAvitoTarget'),context,{filename:'ensureAvitoTarget.js'});
const ensure=context.ensureAvitoTarget;

(async()=>{
  const base={current_window_id:7,user_started:true,avito_target_bound_once:false,diagnostic_request:{allow_navigation:true},command_mode:'AVITO_UI',search_id:'red-v140'};
  const result=await ensure(base,requested,'ui_plan');
  assert.strictEqual(created,1,'ambiguous first binding with explicit URL must create one dedicated tab');
  assert.strictEqual(applied,1,'new dedicated tab must be routed through normal requested-url path');
  assert.strictEqual(result.created,true,'result must record dedicated tab creation');
  assert.strictEqual(result.tab.id,777,'must return the newly created run-owned tab');
  assert.strictEqual(result.requested_url,requested,'must preserve exact explicit requested URL');
  console.log('dedicated_requested_tab_on_ambiguity_v140: PASS 5/5');
})().catch(err=>{console.error(err&&err.stack||err);process.exit(1);});
