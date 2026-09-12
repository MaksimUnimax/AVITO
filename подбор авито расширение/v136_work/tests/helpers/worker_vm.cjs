'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=process.env.AF_SOURCE_ROOT ? path.resolve(process.env.AF_SOURCE_ROOT) : path.resolve(__dirname,'../..');
function event(){const listeners=new Set();return {listeners,addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:(...a)=>[...listeners].map(fn=>fn(...a))};}
function clone(x){return x===undefined?undefined:structuredClone(x);}
function loadWorker(options={}) {
  const local=clone(options.local||{}),session=clone(options.session||{}),timers=new Set(),calls=[],sent=[],tabs=new Map();
  let nextId=40,ctx,effective={levelOfControl:'controlled_by_this_extension',value:{mode:'direct'}};
  const identity={origin:'https://chatgpt.com',chat_path:'/c/11111111-1111-1111-1111-111111111111',conversation_id:'11111111-1111-1111-1111-111111111111'};
  tabs.set(1,{id:1,windowId:2,active:false,url:'https://chatgpt.com'+identity.chat_path,status:'complete'});
  tabs.set(7,{id:7,windowId:2,active:true,url:'https://www.avito.ru/all/nastolnye_kompyutery?q=computer',status:'complete',time_origin:Date.now()-10000});
  const finish=(done,value)=>queueMicrotask(()=>done?.(clone(value)));
  function store(data){return {
    get(keys,done){let out={};if(keys===null)out=clone(data);else for(const k of typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys||{}))if(k in data)out[k]=clone(data[k]);finish(done,out);},
    set(values,done){Object.assign(data,clone(values));finish(done);},remove(keys,done){for(const k of Array.isArray(keys)?keys:[keys])delete data[k];finish(done);},setAccessLevel:()=>Promise.resolve()
  };}
  const sessionRules=new Map(),dynamicRules=new Map(),alarmEvent=event(),alarms=new Map();
  function updateRules(map,config,done){for(const id of config.removeRuleIds||[])map.delete(id);for(const rule of config.addRules||[])map.set(rule.id,clone(rule));finish(done);}
  const chrome={
    runtime:{id:'a'.repeat(32),lastError:null,getManifest:()=>JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json'))),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p,onInstalled:event(),onStartup:event(),onMessage:event()},
    storage:{local:store(local),session:store(session)},
    proxy:{settings:{clear(_,done){calls.push(['proxy_clear']);effective={levelOfControl:'controllable_by_this_extension',value:options.systemProxy||{mode:'system'}};finish(done);},set({value},done){calls.push(['pac',clone(value)]);effective={levelOfControl:options.controlLevel||'controlled_by_this_extension',value:clone(value)};if(options.onPacSet)options.onPacSet(value,{chrome,ctx,local,session,effective,done:()=>finish(done)});else finish(done);},get(_,done){finish(done,effective);}},onProxyError:event()},
    declarativeNetRequest:{updateDynamicRules:(x,done)=>updateRules(dynamicRules,x,done),updateSessionRules:(x,done)=>updateRules(sessionRules,x,done),getSessionRules:done=>finish(done,[...sessionRules.values()])},
    tabs:{onUpdated:event(),onRemoved:event(),onCreated:event(),
      query(query,done){finish(done,[...tabs.values()].filter(t=>(query.windowId===undefined||t.windowId===query.windowId)&&(!query.active||t.active)&&(!query.url||t.url.startsWith('https://www.avito.ru/'))));},
      get(id,done){const t=tabs.get(id);if(t)finish(done,t);else {queueMicrotask(()=>{chrome.runtime.lastError={message:'No tab with id '+id};done?.();chrome.runtime.lastError=null;});}},
      update(id,props,done){const t=tabs.get(id);if(!t)return finish(done,null);Object.assign(t,props);if(props.active)for(const other of tabs.values())if(other.id!==id)other.active=false;if(props.url){t.time_origin=Date.now();t.status='complete';t.pendingUrl=null;calls.push(['navigate',id,props.url]);options.onNavigate?.(t,ctx);}finish(done,t);},
      reload(id,props,done){const t=tabs.get(id);calls.push(['reload',id,props]);if(t){t.time_origin=Date.now();t.status='complete';t.pendingUrl=null;options.onReload?.(t,ctx);}finish(done);},
      create(props,done){const t={...props,id:nextId++,status:'complete',time_origin:Date.now()};tabs.set(t.id,t);calls.push(['create',t.id,props.url]);finish(done,t);},
      remove(id,done){tabs.delete(id);calls.push(['close',id]);finish(done);},
      sendMessage(id,msg,done){calls.push(['message',id,msg.type]);
        if(options.onMessage && options.onMessage(id,msg,done,{chrome,ctx,tabs,finish,sent,identity})===true)return;
        if(msg.type==='AF_CAPTURE_PING') return finish(done,{ok:true,content_script_protocol:'avito_finder_bridge_exact_capture_v1',content_script_version:fs.readFileSync(path.join(ROOT,'chatgpt_content.js'),'utf8').match(/const CONTENT_SCRIPT_VERSION = "([^"]+)"/)[1],identity});
        if(msg.type==='AF_CAPTURE_SEND_REPORT'){sent.push(msg);return finish(done,{ok:true,identity,anchor_turn_id:'user-'+sent.length});}
        if(msg.type==='AF_CAPTURE_BEGIN_PROMPT_POLL'||msg.type==='AF_CAPTURE_STOP'||msg.type==='AF_CANCEL_AVITO_OPERATION')return finish(done,{ok:true});
        if(msg.type==='AF_AVITO_PING')return finish(done,{ok:true,version:fs.readFileSync(path.join(ROOT,'avito_content.js'),'utf8').match(/const ADAPTER_VERSION = "([^"]+)"/)[1]});
        if(msg.type==='AF_GET_ROUTE_CONTEXT')return finish(done,{ok:true,context:{url:tabs.get(id)?.url,page_kind:'search_results',city:'',query:'computer',dialog_open:false,login_popup:false}});
        if(msg.type==='AF_EXECUTE_AVITO_UI_PLAN')return finish(done,{ok:true,result:{ok:true,url:tabs.get(id)?.url,steps:[{type:'COLLECT_LISTINGS',status:'completed',index:1}],listings:[{title:'Test PC',href:'https://www.avito.ru/test/pc_12345678',price:'10000'}],blocked_reason:null}});
        if(msg.type==='AF_SEQUENTIAL_READ_PUBLIC_LISTING')return finish(done,{ok:true,result:{details:{title:'PC',price:'10000',sections:[],blocked_reason:null}}});
        if(msg.type==='AF_DIAGNOSE_AVITO_DOM'||msg.type==='AF_INSPECT_AVITO_DOM')return finish(done,{ok:true,snapshot:{url:tabs.get(id)?.url,scope:'PAGE_MAIN_VISIBLE',blocked_reason:null,tree_text:'DOM'}});
        return finish(done,{ok:true});
      }
    },
    scripting:{executeScript(details,done){if(details.files)return finish(done,[]);const t=tabs.get(details.target.tabId),probe={href:t?.url,ready_state:'complete',body_present:true,title_present:true,time_origin:t?.time_origin||Date.now(),ip_block:t?.ip_block===true,captcha:t?.captcha===true,normal_avito:!t?.ip_block};finish(done,[{result:options.probe?options.probe(details,t,probe):probe}]);}},
    debugger:{attach:(_,__,done)=>finish(done),detach:(_,done)=>finish(done),sendCommand:(_,method,params,done)=>{calls.push(['debugger',method,params]);finish(done);}},
    alarms:{onAlarm:alarmEvent,get:async name=>{const a=alarms.get(name);return a?{...clone(a),scheduledTime:a.when}:undefined;},create:(name,info)=>{alarms.set(name,clone(info||{}));calls.push(['alarm',name,Number(info?.when||0)]);},clear:(name,done)=>{const existed=alarms.delete(name);finish(done,existed);}},
    webRequest:{onAuthRequired:event(),onCompleted:event(),onHeadersReceived:event(),onErrorOccurred:event(),onBeforeRequest:event(),onActionIgnored:event(),handlerBehaviorChanged:done=>finish(done)}
  };
  // No automatic alarm/startup invocation in this VM. The wake function is called explicitly by tests.
  const timerFn=(fn,ms,...args)=>{const t=setTimeout(()=>{timers.delete(t);fn(...args);},ms);timers.add(t);return t;};
  ctx={chrome,console,URL,Date,Math,Promise,Array,String,Number,Boolean,Error,TypeError,Set,Map,RegExp,JSON,Object,Uint8Array,TextEncoder,TextDecoder,AbortController,structuredClone,queueMicrotask,
    setTimeout:timerFn,clearTimeout:t=>{timers.delete(t);clearTimeout(t);},__AF_TEST_EXPORTS:{},__AF_TEST_VISIBLE_DELAY_MS:0,__AF_TEST_RATE_LIMIT_BACKOFF_MS:(options.rateLimitBackoffMs===undefined?0:Number(options.rateLimitBackoffMs)),
    fetch:options.fetch|| (async()=>({ok:true,status:200,headers:{},json:async()=>({ip:'185.42.12.34'}),text:async()=>'{"ip":"185.42.12.34"}'}))};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  ctx.importScripts=(...names)=>{for(const name of names)vm.runInContext(fs.readFileSync(path.join(ROOT,name),'utf8'),ctx,{filename:name});};
  vm.runInContext(fs.readFileSync(path.join(ROOT,'service_worker.js'),'utf8'),ctx,{filename:'service_worker.js'});
  const h=ctx.__AF_TEST_EXPORTS.recovery,R=ctx.AvitoFinderRecovery,P=ctx.AvitoFinderProxy,C=ctx.AvitoFinderCore;
  const profile=P.normalizeProxyMarketRecord({id:123,ip:'pool.proxy.market',port:10000,http_port:10000,login:'fixture-user',password:'fixture-password',country:'ru',package_id:68507,rotation_settings:{rotate:0}});
  async function seed(extra={}){
    await h.savePersistedProxyProfiles([profile]);await h.saveProxySecret({profiles:[profile],active_profile_id:profile.id,api_key:options.apiKey||'',package_id:68507});
    await h.saveProxyRuntime({mode:'proxy',profiles:[P.profileSummary(profile)],selected_profile_id:profile.id,data_saver_enabled:true});
    const state=C.makeState({search_id:'test-run',operation_id:'test-run:command1',status:'WAITING_FOR_AVITO_PAGE_READY',command_mode:'AVITO_UI',ui_action_plan:{timing_profile:'CONTROL_VISIBLE',steps:[{type:'COLLECT_LISTINGS',limit:20}],plan_fingerprint:'plan-1'},user_started:true,avito_tab_id:7,current_window_id:2,chatgpt_tab_id:1,chatgpt_window_id:2,chat_origin:identity.origin,chat_path:identity.chat_path,conversation_id:identity.conversation_id,anchor_turn_id:'initial-user',avito_ready_deadline_at:new Date(Date.now()+30000).toISOString(),operation_page_url:tabs.get(7).url,operation_started_at:Date.now(),...extra});
    await h.saveState(state);return state;
  }
  return {h,R,P,C,ctx,chrome,local,session,calls,sent,tabs,alarms,identity,profile,seed,effective:()=>effective,dispose(){for(const t of timers)clearTimeout(t);h.clearTimers();}};
}
module.exports={loadWorker,ROOT,event};
