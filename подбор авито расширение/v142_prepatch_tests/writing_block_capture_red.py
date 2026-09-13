import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "подбор авито расширение" / "releases" / "v1.0.41" / "v141_work"
OUT = Path(os.environ.get("AF_RED_OUT", REPO / "подбор авито расширение" / "v142_prepatch_tests" / "RED_LOCAL.json"))
CID = "11111111-1111-4111-8111-111111111111"
BASE = '''<!doctype html><body><main id="turns"><section data-turn="user" data-turn-id="start"><div data-message-author-role="user">Ищи</div></section></main><form><textarea id="prompt-textarea"></textarea><button type="button" data-testid="send-button">Send</button></form></body>'''
SHIM = '''(()=>{const ls=new Set();window.__AF_TEST_EXPORTS={};window.sentMessages=[];window.chrome={runtime:{onMessage:{addListener:f=>ls.add(f),removeListener:f=>ls.delete(f)},sendMessage:(m,cb)=>{sentMessages.push(m);const r={ok:true,data:{accepted:true}};cb?.(r);return Promise.resolve(r);}}};window.AF_FIXTURE_SEND=m=>new Promise(r=>{for(const l of [...ls])l(m,{},r)});window.__AF_TEST_PROMPT_STABILITY_MS=80;window.__AF_TEST_PROMPT_PAYLOAD_SAMPLE_MS=40;window.__AF_TEST_PROMPT_PAYLOAD_STABILITY_MS=120;window.__AF_TEST_PROMPT_INVALID_PAYLOAD_STABILITY_MS=240;window.__AF_TEST_PROMPT_PAYLOAD_MIN_SAMPLES=3;})();'''
VALID = "Режим:\nAVITO_UI\nСтраница:\nhttps://www.avito.ru/moskva/tovary_dlya_kompyutera/monitor_27_ips_8348999864\nШаги:\nСобери до 20 видимых объявлений."


async def inject_runtime(page):
    await page.set_content(BASE)
    await page.add_script_tag(content=SHIM)
    await page.add_script_tag(path=str(SOURCE / "core.js"))
    code = "(()=>{const location=window.AF_FIXTURE_LOCATION=new URL('https://chatgpt.com/c/" + CID + "');" + (SOURCE / "chatgpt_content.js").read_text(encoding="utf-8") + "})();"
    await page.add_script_tag(content=code)


async def add_current_writing_block(page, text=VALID, with_unrelated=False):
    await page.evaluate(
        '''(x)=>{
          const s=document.createElement('section');
          s.dataset.turn='assistant'; s.dataset.turnId='a1';
          const root=document.createElement('div'); root.id='wb-root';
          const body=document.createElement('pre'); body.id='wb'; body.textContent=x.text; root.append(body);
          const edit=document.createElement('button'); edit.dataset.testid='writing-block-header-magic-edit-button'; edit.ariaLabel='Редактировать'; edit.textContent='Редактировать'; root.append(edit);
          const copy=document.createElement('button'); copy.ariaLabel='Копировать'; copy.textContent='Копировать'; root.append(copy);
          s.append(root);
          if(x.unrelated){const u=document.createElement('button');u.id='unrelated';u.ariaLabel='Предложение 0';u.title='Предложение 0';u.textContent='Предложение';s.append(u);}
          document.querySelector('main').append(s);
        }''',
        {"text": text, "unrelated": with_unrelated},
    )


async def start(page):
    await page.evaluate(
        "c=>__AF_TEST_EXPORTS.chatCapture.startFixturePromptPoll({run_id:'fixture',conversation_id:c,anchor_turn_id:'start'})",
        CID,
    )


async def snapshot(page):
    return await page.evaluate(
        '''()=>({
          full: sentMessages.filter(m=>m.type==='AF_CAPTURE_FULL_TEXT').map(m=>m.candidate?.prompt_text||''),
          diagnostics: sentMessages.filter(m=>m.type==='AF_CAPTURE_DIAGNOSTIC').map(m=>({code:m.details?.code||'', structural_signature:m.details?.structural_signature||'', payload_bytes:m.details?.payload_bytes??null, payload_extraction_error:m.details?.payload_extraction_error||''})),
          clone_count: window.__afWbCloneCount||0
        })'''
    )


async def primary_payload_oscillation(page):
    await inject_runtime(page)
    await add_current_writing_block(page)
    # Current ChatGPT uses a local Edit+Copy toolbar. Production capture reads the
    # same root several times while classifying a candidate, then re-reads it in
    # confirmLocalWritingBlockCopyAndExtract(). Make only that final body read of
    # each stable attempt transiently empty: candidate identity stays the same.
    await page.evaluate(
        '''()=>{
          const nativeClone=Element.prototype.cloneNode;
          window.__afWbCloneCount=0;
          Element.prototype.cloneNode=function(deep){
            const clone=nativeClone.call(this,deep);
            if(this instanceof Element && this.id==='wb-root'){
              window.__afWbCloneCount += 1;
              // current-local candidate: 4 root reads; confirmation: 2 more.
              // Empty the second confirmation read on every stable attempt.
              if(window.__afWbCloneCount % 10 === 0){
                const body=clone.querySelector('#wb'); if(body) body.textContent='';
              }
            }
            return clone;
          };
        }'''
    )
    await start(page)
    await page.wait_for_timeout(1250)
    snap = await snapshot(page)
    codes = [x["code"] for x in snap["diagnostics"]]
    empty_count = codes.count("PROMPT_EMPTY_WRITING_BLOCK_IGNORED")
    restart_count = codes.count("PROMPT_DOM_STABILITY_STARTED")
    broken = len(snap["full"]) == 0 and empty_count >= 2 and restart_count >= 2
    # Future-correct behavior: transient body loss must not force the whole
    # structural candidate back to zero forever; the same valid payload must be
    # handed off once within the bounded fixture window.
    future_ok = snap["full"] == [VALID]
    return {
        "name": "same-block payload unavailable/non-empty oscillation",
        "future_expectation": "one exact AF_CAPTURE_FULL_TEXT within bounded window",
        "full_text_count": len(snap["full"]),
        "empty_payload_diagnostics": empty_count,
        "structural_restarts": restart_count,
        "clone_count": snap["clone_count"],
        "broken_behavior_observed": broken,
        "future_expectation_pass": future_ok,
    }


async def secondary_unrelated_button_churn(page):
    await inject_runtime(page)
    await add_current_writing_block(page, with_unrelated=True)
    await page.evaluate(
        '''()=>{
          let n=0;
          window.__afChurn=setInterval(()=>{const b=document.querySelector('#unrelated');if(!b)return;n+=1;b.title='Предложение '+n;b.setAttribute('aria-label','Предложение '+n);},20);
        }'''
    )
    await start(page)
    await page.wait_for_timeout(650)
    await page.evaluate("()=>clearInterval(window.__afChurn)")
    snap = await snapshot(page)
    starts = [x for x in snap["diagnostics"] if x["code"] == "PROMPT_DOM_STABILITY_STARTED"]
    signatures = {x["structural_signature"] for x in starts if x["structural_signature"]}
    broken = len(snap["full"]) == 0 and len(starts) >= 2 and len(signatures) >= 2
    # Future-correct behavior: an unrelated assistant control cannot own local
    # Writing Block stability, so capture must complete while it churns.
    future_ok = snap["full"] == [VALID]
    return {
        "name": "unrelated assistant-button churn",
        "future_expectation": "one exact AF_CAPTURE_FULL_TEXT despite unrelated control churn",
        "full_text_count": len(snap["full"]),
        "structural_restarts": len(starts),
        "distinct_structural_signatures": len(signatures),
        "broken_behavior_observed": broken,
        "future_expectation_pass": future_ok,
    }


async def main():
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "1.0.41", manifest
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            executable_path=os.environ.get("CHROMIUM") or None,
            headless=True,
            args=["--no-sandbox", "--disable-gpu"],
        )
        ctx = await browser.new_context(viewport={"width": 1000, "height": 700})
        await ctx.route("**/*", lambda route: route.abort())
        p1 = await ctx.new_page()
        primary = await primary_payload_oscillation(p1)
        await p1.close()
        p2 = await ctx.new_page()
        secondary = await secondary_unrelated_button_churn(p2)
        await p2.close()
        await browser.close()

    report = {
        "schema": "avito_finder_v142_exact_v141_red_v1",
        "source_version": "1.0.41",
        "source_root": str(SOURCE.relative_to(REPO)),
        "runtime_under_test": "production chatgpt_content.js + core.js in Chromium DOM fixture",
        "primary": primary,
        "secondary": secondary,
        "red_confirmed": primary["broken_behavior_observed"] and secondary["broken_behavior_observed"],
        "future_expectations_pass": primary["future_expectation_pass"] and secondary["future_expectation_pass"],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    # This is deliberately a future-behavior regression test. Exact broken
    # v1.0.41 MUST fail it; the workflow captures that non-zero exit as RED.
    raise SystemExit(0 if report["future_expectations_pass"] else 1)


if __name__ == "__main__":
    asyncio.run(main())
