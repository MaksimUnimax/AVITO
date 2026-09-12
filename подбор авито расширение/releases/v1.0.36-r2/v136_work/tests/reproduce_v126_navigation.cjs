/* Set AF_SOURCE_ROOT to an unmodified v1.0.26 directory to reproduce.
 * Read-only VM exercise; no GitHub, Chrome or provider calls. */
const {loadWorker}=require('./helpers/worker_vm.cjs');
(async()=>{const w=loadWorker();try{
 const p1='https://www.avito.ru/all/nastolnye_kompyutery?q=computer&s=104',p2=p1+'&p=2';
 const s=await w.seed({last_route_context:{url:p1,page_kind:'search_results',query:'computer',city:'',login_popup:false,dialog_open:false}});w.tabs.get(7).url=p1;
 const c=w.C.parseCommandForm('Режим:\nAVITO_UI\nСтраница:\n'+p2+'\nСобери до 30 видимых объявлений.');
 await w.h.queueAvitoTask(s,c);
 console.log(JSON.stringify({source:process.env.AF_SOURCE_ROOT||'current',parsed:c.valid,reports:w.sent.map(x=>({delivery_id:x.delivery_id,text:x.report_text})),collections:w.calls.filter(x=>x[0]=='message'&&x[2]=='AF_EXECUTE_AVITO_UI_PLAN').length},null,2));
}finally{w.dispose();}})().catch(e=>{console.error(e);process.exitCode=1});
