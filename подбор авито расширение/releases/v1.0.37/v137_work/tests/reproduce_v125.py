import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(os.environ['AF_V125_ROOT'])
CID='11111111-1111-4111-8111-111111111111'
IDENTITY={'origin':'https://chatgpt.com','chat_path':'/c/'+CID,'conversation_id':CID}
REPORT='Avito Finder: выполнен ограниченный UI-план\nЗадача: test\nСтатус: выполнен\n\nКарточки:\n1. Компьютер — 14 000 ₽\nCPU: i5-8400 / RAM: 16 GB\nhttps://www.avito.ru/izhevsk/nastolnye_kompyutery/kompyuter_8387774977\n2. ПК — 12 000 ₽'
SHIM='''window.sentMessages=[];window.listeners=[];window.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f),removeListener:()=>{}},sendMessage:(m,cb)=>{sentMessages.push(m);let r={ok:true,data:null};cb?.(r);return Promise.resolve(r);}}}; window.send=m=>new Promise(resolve=>listeners.forEach(l=>l(m,{},resolve)));'''
async def main():
 out=[]
 async with async_playwright() as pw:
  b=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  ctx=await b.new_context();await ctx.route('**/*',lambda r:r.abort())
  for mode in ['textarea','rich_paragraph_normalization','rich_newline_to_space']:
   p=await ctx.new_page()
   control='<textarea id="prompt-textarea"></textarea>' if mode=='textarea' else '<div id="prompt-textarea" class="ProseMirror" contenteditable="true"><p><br></p></div>'
   await p.set_content('<main><section data-turn="user" data-turn-id="initial"><div data-message-author-role="user">Ищи</div></section></main><form style="position:fixed;bottom:0;width:90%;height:300px">'+control+'<button type="button" data-testid="send-button" aria-label="Отправить">Отправить</button></form>')
   await p.add_script_tag(content=SHIM)
   await p.evaluate('''mode=>{window.clicks=0;const e=document.getElementById('prompt-textarea');e.style.cssText='white-space:pre-wrap;width:90%;height:200px';
   e.addEventListener('input',()=>{if(mode!=='textarea')setTimeout(()=>{const raw=e.textContent;e.replaceChildren();if(mode==='rich_paragraph_normalization'){for(const line of raw.split('\\n')){const q=document.createElement('p');q.textContent=line;if(!line)q.append(document.createElement('br'));e.append(q);}}else{const q=document.createElement('p');q.textContent=raw.replace(/\\n/g,' ');e.append(q);}},30);});
   document.querySelector('button').onclick=()=>{clicks++;let s=document.createElement('section');s.dataset.turn='user';s.dataset.turnId='delivered';s.innerHTML='<div data-message-author-role="user"></div>';s.firstChild.textContent=e.value??e.innerText;document.querySelector('main').append(s);if(mode==='textarea')e.value='';else e.replaceChildren();};}''',mode)
   await p.add_script_tag(path=str(ROOT/'core.js'))
   await p.add_script_tag(content="(()=>{const location=new URL('https://chatgpt.com/c/"+CID+"');"+(ROOT/'chatgpt_content.js').read_text()+"})();")
   r=await p.evaluate('m=>send(m)',{'type':'AF_CAPTURE_SEND_REPORT','expected_identity':IDENTITY,'search_id':'test','delivery_id':'test','report_text':REPORT})
   snap=await p.evaluate('''()=>({clicks,raw:document.getElementById('prompt-textarea').value??document.getElementById('prompt-textarea').textContent,html:document.getElementById('prompt-textarea').outerHTML,diagnostics:sentMessages.filter(m=>m.type==='AF_CAPTURE_DIAGNOSTIC').map(m=>m.details?.code)})''')
   out.append({'fixture':mode,'result':r,**snap,'user_edits':0});print(mode,r,'clicks',snap['clicks'],flush=True)
   await p.close()
  await b.close()
 Path(os.environ.get('AF_REPRO_REPORT','/tmp/af-reproduced-v125.json')).write_text(json.dumps({'production_adapter':'1.0.25','scope':'offline Chromium; rich editor re-render simulated, no live ChatGPT DOM captured','cases':out},ensure_ascii=False,indent=2))
asyncio.run(main())
