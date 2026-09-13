'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');

// Exact prepatch RED supplies argv[2]. Once copied into release/tests, the
// aggregate `node --test tests/*.test.js` must test that release's own worker.
const sourcePath=process.argv[2] || path.resolve(__dirname,'..','service_worker.js');
const source=fs.readFileSync(sourcePath,'utf8');

function extractFunction(name){
  const marker=`function ${name}`;
  const asyncMarker=`async function ${name}`;
  let start=source.indexOf(asyncMarker);
  if(start<0) start=source.indexOf(marker);
  if(start<0) throw new Error(`FUNCTION_NOT_FOUND:${name}`);
  const brace=source.indexOf('{',start);
  if(brace<0) throw new Error(`FUNCTION_BODY_NOT_FOUND:${name}`);
  let depth=0, quote=null, esc=false, lineComment=false, blockComment=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i], next=source[i+1];
    if(lineComment){ if(ch==='\n') lineComment=false; continue; }
    if(blockComment){ if(ch==='*'&&next==='/'){blockComment=false;i++;} continue; }
    if(quote){ if(esc){esc=false;continue;} if(ch==='\\'){esc=true;continue;} if(ch===quote) quote=null; continue; }
    if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
    if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{') depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0) return source.slice(start,i+1);
    }
  }
  throw new Error(`FUNCTION_UNTERMINATED:${name}`);
}

let tabs=[];
const context={
  URL,
  tabsQuery: async()=>tabs.map(x=>({...x})),
  Core:{
    isAvitoUrl(value){
      try{ const u=new URL(String(value||'')); return u.protocol==='https:' && (u.hostname==='www.avito.ru'||u.hostname==='avito.ru'); }
      catch(_){ return false; }
    }
  }
};
vm.createContext(context);
for(const name of ['normalizedVisibleAvitoUrl','sameVisibleAvitoRoute','selectVisibleAvitoTab']){
  vm.runInContext(extractFunction(name),context,{filename:`${name}.js`});
}
const select=context.selectVisibleAvitoTab;

async function expectAmbiguous(label, requested){
  let err=null;
  try{ await select(7,requested); }catch(e){err=e;}
  assert(err,`${label}: expected ambiguity error`);
  assert.strictEqual(String(err.message||err),'AVITO_VISIBLE_TAB_AMBIGUOUS_SELECT_ONE_TAB',`${label}: wrong error`);
}

(async()=>{
  const dell='https://www.avito.ru/yuzhno-sahalinsk/nastolnye_kompyutery/dell_vostro_3470_4750223208';
  const dellWithContext=dell+'?context=abc#foo';
  const other='https://www.avito.ru/moskva/nastolnye_kompyutery/drugoy_pk_9999999999';

  // LIVE regression: ChatGPT is active, therefore no Avito tab is active. Among
  // several visible Avito tabs, exactly one already matches requested listing.
  // Old v1.0.38 ignores requestedUrl and throws AMBIGUOUS. Patched behavior must
  // select only the unique exact normalized route, without navigating any tab.
  tabs=[
    {id:101,windowId:7,active:false,url:dellWithContext,status:'complete'},
    {id:102,windowId:7,active:false,url:other,status:'complete'}
  ];
  const exact=await select(7,dell);
  assert.strictEqual(exact.tab.id,101,'unique exact requested route must select existing matching tab');
  assert.strictEqual(exact.source,'exact_requested_avito_tab','selection source must prove exact-request match');

  // Safety boundary: zero exact matches among multiple Avito tabs remains terminal ambiguity.
  tabs=[
    {id:201,windowId:7,active:false,url:other,status:'complete'},
    {id:202,windowId:7,active:false,url:'https://www.avito.ru/ufa/nastolnye_kompyutery/pk_8888888888',status:'complete'}
  ];
  await expectAmbiguous('zero_exact_matches',dell);

  // Safety boundary: duplicate exact matches are still ambiguous; never guess.
  tabs=[
    {id:301,windowId:7,active:false,url:dell,status:'complete'},
    {id:302,windowId:7,active:false,url:dell+'#duplicate',status:'complete'}
  ];
  await expectAmbiguous('duplicate_exact_matches',dell);

  // Preserve historical active-tab preference.
  tabs=[
    {id:401,windowId:7,active:true,url:other,status:'complete'},
    {id:402,windowId:7,active:false,url:dell,status:'complete'}
  ];
  const active=await select(7,dell);
  assert.strictEqual(active.tab.id,401,'existing unique active Avito preference must remain unchanged');
  assert.strictEqual(active.source,'active_avito_tab');

  // Preserve historical single-Avito-tab behavior even when it needs later routing.
  tabs=[{id:501,windowId:7,active:false,url:other,status:'complete'}];
  const single=await select(7,dell);
  assert.strictEqual(single.tab.id,501,'single Avito tab behavior must remain unchanged');
  assert.strictEqual(single.source,'single_avito_tab');

  console.log('visible_tab_exact_request_disambiguation: PASS 5/5');
})().catch(err=>{ console.error(err && err.stack || err); process.exit(1); });
