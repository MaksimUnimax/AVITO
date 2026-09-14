/* Test-only RPC bus. Production worker runs unchanged in Node VM; real DOM
 * adapters run in Chromium. Chrome APIs are simulated; no provider network. */
'use strict';
const readline=require('node:readline');const {loadWorker}=require('./helpers/worker_vm.cjs');
let w,serial=0,tabSequence=40;const pending=new Map();
const output=x=>process.stdout.write(JSON.stringify(x)+'\n');
function browser(method,data={}){const id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});output({browser_request:id,method,...data});});}
function finishApi(done,promise){promise.then(value=>done?.(value)).catch(error=>{w.chrome.runtime.lastError={message:String(error)};done?.();w.chrome.runtime.lastError=null;});}
function createWorker(local={},session={}){
 const tabs=w ? [...w.tabs] : null;if(w)w.dispose();
 w=loadWorker({local,session,rateLimitBackoffMs:1000,onMessage(id,message,done){finishApi(done,browser('message',{tab_id:id,message}));return true;}});
 if(tabs){w.tabs.clear();for(const [id,tab]of tabs)w.tabs.set(id,tab);}
 else{w.tabs.get(1).active=true;w.tabs.get(7).active=false;}
 w.chrome.tabs.update=(id,props,done)=>{const tab=w.tabs.get(id);if(!tab)return finishApi(done,Promise.reject('No tab'));
  Object.assign(tab,props);if(props.active)for(const t of w.tabs.values())if(t.id!==id)t.active=false;
  if(!props.url){done?.({...tab});return;}
  tab.time_origin=Date.now();tab.pendingUrl=props.url;tab.status='loading';w.calls.push(['navigate',id,props.url]);
  finishApi(done,browser('navigate',{tab_id:id,url:props.url}).then(()=>{tab.pendingUrl=null;tab.status='complete';w.chrome.tabs.onUpdated.emit(id,{status:'complete',url:props.url},{...tab});return {...tab};}));};
 w.chrome.tabs.create=(props,done)=>{const id=tabSequence++;const tab={id,windowId:props.windowId||2,...props,status:'loading',time_origin:Date.now()};w.tabs.set(id,tab);if(props.active)for(const t of w.tabs.values())if(t.id!==id)t.active=false;w.calls.push(['create',id,props.url]);
  finishApi(done,browser('navigate',{tab_id:id,url:props.url}).then(()=>{tab.status='complete';w.chrome.tabs.onCreated.emit({...tab});return {...tab};}));};
 w.chrome.tabs.reload=(id,props,done)=>{const tab=w.tabs.get(id);w.calls.push(['reload',id]);tab.time_origin=Date.now();
  finishApi(done,browser('navigate',{tab_id:id,url:tab.url,reload:true}).then(()=>{tab.status='complete';w.chrome.tabs.onUpdated.emit(id,{status:'complete'},{...tab});}));};
 w.chrome.tabs.remove=(id,done)=>{w.tabs.delete(id);w.calls.push(['close',id]);finishApi(done,browser('close',{tab_id:id}));};
 w.chrome.scripting.executeScript=(details,done)=>finishApi(done,browser('execute',{tab_id:details.target.tabId,files:details.files||null,func:details.func?.toString()||null,args:details.args||[]}).then(result=>[{result}]));
}
createWorker();
async function dispatch(message,tab_id){const sender=tab_id ? {tab:{...w.tabs.get(tab_id)},url:w.tabs.get(tab_id)?.url,id:w.chrome.runtime.id}:{id:w.chrome.runtime.id,url:w.chrome.runtime.getURL('popup.html')};return new Promise(resolve=>{for(const listener of w.chrome.runtime.onMessage.listeners)listener(message,sender,resolve);});}
readline.createInterface({input:process.stdin}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
 if(m.browser_response){const p=pending.get(m.browser_response);pending.delete(m.browser_response);if(p)(m.error?p.reject(m.error):p.resolve(m.result));return;}
 (async()=>{switch(m.op){case 'message':return dispatch(m.message,m.tab_id);case 'state':return w.h.getState();case 'view':return {state:await w.h.getState(),calls:w.calls,logs:w.local[w.C.STORAGE.logs]||[],alarms:[...w.alarms.entries()]};case 'seed':{let s=await w.seed(m.state||{});if(m.direct)await w.h.saveProxyRuntime({...await w.h.getProxyRuntime(),mode:'direct'});return s;}case 'patchstate':return w.h.saveState({...await w.h.getState(),...m.state});case 'wake':return w.h.recoverRuntimeOnWake();case 'fire_alarm':{w.alarms.delete(m.name);w.chrome.alarms.onAlarm.emit({name:m.name});return true;}case 'restart':{const local=structuredClone(w.local),session=structuredClone(w.session);createWorker(local,session);return w.h.recoverRuntimeOnWake();}case 'shutdown':w.dispose();setTimeout(()=>process.exit(0),100);return true;default:throw Error('unknown operation');}})().then(result=>output({response:m.id,result})).catch(error=>output({response:m.id,error:String(error.stack||error)}));
});
