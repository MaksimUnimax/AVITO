/* Avito Finder v1.0.33 — shared recovery policy, persisted rate-limit backoff and bounded async primitives.
 * No Avito APIs, selectors, product scoring or network side effects live here.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AvitoFinderRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = '1.0.33';
  const MAX_ATTEMPTS = 4;
  const RECOVERY_BUDGET_MS = 90000;
  const RATE_LIMIT_RECOVERY_BUDGET_MS = 120000;
  const RATE_LIMIT_BACKOFF_MS = Object.freeze([10000, 20000, 30000, 45000]);
  const READ_ONLY_STEPS = new Set(['WAIT','WAIT_FOR','SNAPSHOT','COLLECT_MENU','COLLECT_LISTINGS','COLLECT_LISTING_DETAILS']);
  const QUEUE_STEPS = new Set(['COLLECT_EXPLICIT_LISTING_QUEUE','RESUME_EXPLICIT_LISTING_QUEUE']);
  function replayPolicy(plan) {
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    if (steps.length === 1 && QUEUE_STEPS.has(steps[0]?.type)) return 'CHECKPOINT_ONLY';
    return steps.length > 0 && steps.every(s => READ_ONLY_STEPS.has(s?.type)) ? 'READ_ONLY' : 'NEVER';
  }
  function interruption(value = {}) {
    const reasons = [value.blocked_reason, ...(Array.isArray(value.steps) ? value.steps.map(s => s?.blocked_reason) : [])].filter(Boolean);
    if (value.captcha === true || reasons.some(x => ['BLOCKED_LOGIN_OR_CAPTCHA','CAPTCHA_MANUAL_REQUIRED'].includes(x))) return 'CAPTCHA';
    if (value.rate_limit === true || Number(value.status_code) === 429 || reasons.includes('AVITO_RATE_LIMIT')) return 'RATE_LIMIT';
    if (value.ip_block === true || reasons.includes('AVITO_IP_BLOCK') || Number(value.status_code) === 403) return 'IP_BLOCK';
    const transportText = [value.error, ...reasons].filter(Boolean).join(' ');
    if (/ERR_(?:TUNNEL_CONNECTION_FAILED|PROXY_CONNECTION_FAILED|NO_SUPPORTED_PROXIES|PROXY_AUTH_REQUESTED)/.test(transportText)) return 'PROXY_TRANSPORT';
    return null;
  }
  function operationKey(state) { return String(state?.operation_id || `${state?.search_id || ''}:${state?.last_consumed_form_key || 'legacy'}`); }
  function sameOperation(expected, actual) { return expected?.search_id === actual?.search_id && operationKey(expected) === operationKey(actual); }
  function isCancelled(state) { return !state || state.status === 'CANCELLED_BY_USER' || state.user_started === false; }
  function recoveryBudgetMs(kind = null) { return kind === 'RATE_LIMIT' ? RATE_LIMIT_RECOVERY_BUDGET_MS : RECOVERY_BUDGET_MS; }
  function rateLimitBackoffMs(attempt) {
    const index = Math.max(0, Math.min(RATE_LIMIT_BACKOFF_MS.length - 1, Number(attempt || 1) - 1));
    return RATE_LIMIT_BACKOFF_MS[index];
  }
  // RFC 9110 §10.2.3: either non-negative decimal seconds or HTTP-date.
  // This is a lower bound; an internal retry budget may never shorten it.
  function retryAfterTime(value, now = Date.now()) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (/^\d+$/u.test(raw)) {
      const seconds=Number(raw), at=now+seconds*1000;
      return Number.isSafeInteger(seconds) && Number.isSafeInteger(at) && at<=8640000000000000 ? at : Number.MAX_SAFE_INTEGER;
    }
    if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(raw)) return null;
    const at=Date.parse(raw);
    return Number.isFinite(at) ? Math.max(now,at) : null;
  }
  function freshRecovery(state, tabId, now = Date.now(), kind = null) {
    const key = `${operationKey(state)}:tab:${tabId}`;
    const old = state?.connection_recovery;
    if (old?.key === key) return {...old};
    return {key, tab_id:tabId, attempt:0, started_at:now, deadline_at:now+recoveryBudgetMs(kind), phase:'IDLE', create:null, interruption_kind:kind || null};
  }
  function reserveAttempt(record, now = Date.now()) {
    if (now >= record.deadline_at) throw new Error('AVITO_RECOVERY_DEADLINE_EXCEEDED');
    if (record.attempt >= MAX_ATTEMPTS) throw new Error('AVITO_IP_BLOCK_RECOVERY_EXHAUSTED');
    return {...record, attempt:record.attempt+1, phase:'PREPARING', updated_at:now};
  }
  function serialLane() {
    let tail = Promise.resolve();
    return fn => { const next = tail.catch(()=>{}).then(fn); tail = next.catch(()=>{}); return next; };
  }
  function singleFlight() {
    const flights = new Map();
    return (key, fn) => {
      if (flights.has(key)) return flights.get(key);
      const task = Promise.resolve().then(fn);
      flights.set(key, task);
      task.finally(() => { if (flights.get(key) === task) flights.delete(key); }).catch(()=>{});
      return task;
    };
  }
  function deadline(promise, ms, code = 'OPERATION_TIMEOUT', signal = null, onTimeout = null) {
    return new Promise((resolve,reject)=>{
      let settled=false, timer;
      const finish=(fn,value)=>{ if(settled) return; settled=true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
      const abort=()=>finish(reject,new Error('OPERATION_CANCELLED'));
      timer=setTimeout(()=>{ if(settled) return; finish(reject,new Error(code)); try{onTimeout?.();}catch(_){} },Math.max(1,Number(ms)||1));
      if(signal?.aborted){abort();return;}
      signal?.addEventListener('abort',abort,{once:true});
      Promise.resolve(promise).then(v=>finish(resolve,v),e=>finish(reject,e));
    });
  }
  async function fetchBounded(fetchFn, url, options = {}, policy = {}) {
    const controller = new AbortController();
    const external = policy.signal || null;
    const abort=()=>controller.abort();
    if(external?.aborted) throw new Error('OPERATION_CANCELLED');
    external?.addEventListener('abort',abort,{once:true});
    const budget=Number(policy.timeout_ms)||12000, start=Date.now();
    let response, reader=null, idleTimer=null, consumed=false;
    const cleanup=()=>{clearTimeout(idleTimer);external?.removeEventListener('abort',abort);};
    const discard=()=>{abort();try{reader?.cancel().catch(()=>{});}catch(_){}cleanup();};
    try {
      response=await deadline(Promise.resolve().then(()=>fetchFn(url,{...options,signal:controller.signal})),budget,'PROVIDER_REQUEST_TIMEOUT',external,discard);
    } catch(e) {cleanup();throw e;}
    // Callers using only status must not retain a live response/signal forever.
    idleTimer=setTimeout(discard,Math.max(1,budget-(Date.now()-start)));
    const read = async kind => {
      if(consumed) throw new Error('PROVIDER_BODY_ALREADY_CONSUMED');
      consumed=true;clearTimeout(idleTimer);
      try {
        const readBody=async()=>{
          if(response.body && typeof response.body.getReader==='function') {
            reader=response.body.getReader();const chunks=[];
            const maxBytes=Number(policy.max_bytes||policy.max_chars||2097152);let bytes=0;
            while(true) {
              if(controller.signal.aborted) throw new Error('OPERATION_CANCELLED');
              const part=await reader.read();if(part.done)break;
              bytes+=part.value.byteLength;
              if(bytes>maxBytes) {discard();throw new Error('PROVIDER_RESPONSE_TOO_LARGE');}
              chunks.push(part.value);
            }
            const buffer=new Uint8Array(bytes);let offset=0;
            for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
            const raw=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
            return kind==='json'?JSON.parse(raw):raw;
          }
          // Response-shaped doubles and responses without a streaming body.
          return response[kind]();
        };
        const raw=await deadline(Promise.resolve().then(readBody),Math.max(1,budget-(Date.now()-start)),'PROVIDER_BODY_TIMEOUT',external,discard);
        const length=typeof raw==='string'?raw.length:JSON.stringify(raw).length;
        if(length>Number(policy.max_chars||2097152)){discard();throw new Error('PROVIDER_RESPONSE_TOO_LARGE');}
        return raw;
      } finally {try{reader?.releaseLock();}catch(_){}cleanup();}
    };
    return {ok:response.ok,status:response.status,headers:response.headers,json:()=>read('json'),text:()=>read('text'),discard};
  }
  function pacMatches(effective, config) {
    if (effective?.levelOfControl !== 'controlled_by_this_extension') return false;
    if (effective?.value?.mode !== config?.mode) return false;
    return config.mode !== 'pac_script' || effective.value.pacScript?.data === config.pacScript?.data;
  }
  function redactedError(error) {
    return String(error?.message || error || 'UNKNOWN_ERROR').replace(/https?:\/\/\S+/g,'[url]').replace(/(?:api[_-]?key|password|authorization|token)\s*[:=]\s*\S+/gi,'[secret]').slice(0,220);
  }
  return Object.freeze({VERSION,MAX_ATTEMPTS,RECOVERY_BUDGET_MS,RATE_LIMIT_RECOVERY_BUDGET_MS,RATE_LIMIT_BACKOFF_MS,recoveryBudgetMs,rateLimitBackoffMs,retryAfterTime,replayPolicy,interruption,operationKey,sameOperation,isCancelled,freshRecovery,reserveAttempt,serialLane,singleFlight,deadline,fetchBounded,pacMatches,redactedError});
});
