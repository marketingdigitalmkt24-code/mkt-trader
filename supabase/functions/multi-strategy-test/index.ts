// Modo TESTE com 7 estratégias (pedido 16/10/2026): roda a cada minuto em TODOS os ativos abertos da IQ Option.
// Nada abre na corretora. Cada entrada é registrada como TESTE na vela :00 com expiração de 1 minuto
// e resolvida pelas velas reais da IQ Option. Telegram: só o resultado WIN da Tendência (mesmo em teste).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { IQ_TELEGRAM_CHANNEL } from '../_shared/telegram-iq-alert.ts';
import { nextReversalMinute } from '../_shared/four-win-reversal.ts';
import { closedTestResult, prioritizeResultAssets } from '../_shared/test-candle-result.ts';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { sendCandleRequestBatches } from '../_shared/candle-request-batches.ts';
import { recentLearningAdjustment, type LearningOutcome } from '../_shared/recent-signal-learning.ts';
import { matchesTrendSequence, TREND_SEQUENCE_TEST } from '../_shared/trend-sequence-test.ts';
import { forceFirstObservation, FORCE_FIRST_TEST } from '../_shared/force-first-test.ts';
import { demoContinuation, demoCeiling, DEMO_CEILING, demoLearningAdjustment, chartFeatures, chartPatternAdjustment, chooseDemoCandidate, DEMO_CONTINUATION, DEMO_REFERENCE_SIGNAL, similarToReference, type DemoCandidate } from '../_shared/demo-continuation.ts';
import { extendDemoChart } from '../_shared/demo-chart-snapshot.ts';
import { selectedDemoTrend } from '../_shared/selected-demo-trend.ts';
import { selectedDemoPrincipal } from '../_shared/selected-demo-principal.ts';
import { demoTargetMinute, demoCandleRequestTime } from '../_shared/demo-timing.ts';
import { quedaWinCall, quedaWinRetry, QUEDA_WIN_CALL, QUEDA_WIN_RETRY } from '../_shared/queda-win-call.ts';
import { demoHistoryOutcome } from '../_shared/demo-history.ts';
import { demoBalance } from '../_shared/demo-balance.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const AUTH_URLS = ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login'];
const WS_URL = 'wss://iqoption.com/echo/websocket';
const OPEN = 'test7_open';
type K = { t: number; o: number; c: number; h: number; l: number };

export const LABELS: Record<string, string> = {
  TENDENCIA: 'Tendência', REVERSAO_RSI: 'Reversão RSI', VELA_FORCA: 'Vela de força', ROMPIMENTO: 'Rompimento',
  RECUO_EMA21: 'Recuo na média 21', KDJ: 'KDJ', ICHIMOKU: 'Ichimoku',
  [FORCE_FIRST_TEST]: 'Força sem rompimento · primeira vela (TESTE)',
};

async function login(email: string, password: string): Promise<string | null> {
  for (const u of AUTH_URLS) {
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, body: new URLSearchParams({ identifier: email, password }), signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (d.code === 'success' && d.ssid) return d.ssid;
    } catch (_) { /* */ }
  }
  return null;
}

function symbolOf(rawName: string) {
  let n = String(rawName || '').toUpperCase().replace('FRONT.', '');
  const otc = n.includes('-OTC') || /otc/i.test(rawName);
  n = n.replace('-OTC', '').replace('-OP', '');
  if (/^[A-Z]{6}$/.test(n)) n = `${n.slice(0, 3)}/${n.slice(3)}`;
  const base = n.replace(/[-\s]*BLITZ/i, '').replace(/[-\s]*OTC$/i, '').trim();
  return otc ? `${base}-OTC` : base;
}

const ema = (p: number, src: number[]) => { const a = 2 / (p + 1); const r: number[] = []; src.forEach((x, i) => r.push(i ? x * a + r[i - 1] * (1 - a) : x)); return r; };

// Retorna as estratégias que dispararam na última vela fechada (índice i).
export function detect(cs: K[]): [string, 'CALL' | 'PUT'][] {
  const i = cs.length - 1;
  if (i < 80) return [];
  const c = cs.map(k => k.c);
  const e9 = ema(9, c), e21 = ema(21, c), e12 = ema(12, c), e26 = ema(26, c);
  const macd = c.map((_, j) => e12[j] - e26[j]); const sig = ema(9, macd);
  let s50 = 0; for (let j = i - 49; j <= i; j++) s50 += c[j]; s50 /= 50;
  let ag = 0, al = 0; const rsi: number[] = [50];
  for (let j = 1; j < c.length; j++) {
    const d = c[j] - c[j - 1], g = Math.max(d, 0), l = Math.max(-d, 0);
    if (j <= 14) { ag += g / 14; al += l / 14; } else { ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14; }
    rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  let hi14 = -Infinity, lo14 = Infinity; for (let j = i - 13; j <= i; j++) { hi14 = Math.max(hi14, cs[j].h); lo14 = Math.min(lo14, cs[j].l); }
  const stoch = hi14 === lo14 ? 50 : (c[i] - lo14) / (hi14 - lo14) * 100;
  const out: [string, 'CALL' | 'PUT'][] = [];
  const h = macd[i] - sig[i];
  const upT = e9[i] > e21[i] && e21[i] > s50 && c[i] > e21[i];
  const dnT = e9[i] < e21[i] && e21[i] < s50 && c[i] < e21[i];
  if (upT && h > 0 && rsi[i] >= 50 && rsi[i] <= 60) out.push(['TENDENCIA', 'CALL']);
  else if (dnT && h < 0 && rsi[i] >= 30 && rsi[i] <= 50) out.push(['TENDENCIA', 'PUT']);
  if (rsi[i] > 70 && stoch > 80) out.push(['REVERSAO_RSI', 'PUT']);
  else if (rsi[i] < 30 && stoch < 20) out.push(['REVERSAO_RSI', 'CALL']);
  let avgB = 0; for (let j = i - 20; j < i; j++) avgB += Math.abs(cs[j].c - cs[j].o); avgB /= 20;
  const b = Math.abs(cs[i].c - cs[i].o);
  if (avgB > 0 && b > 2 * avgB) out.push(['VELA_FORCA', cs[i].c > cs[i].o ? 'CALL' : 'PUT']);
  let hi = -Infinity, lo = Infinity; for (let j = i - 20; j < i; j++) { hi = Math.max(hi, cs[j].h); lo = Math.min(lo, cs[j].l); }
  if (c[i] > hi) out.push(['ROMPIMENTO', 'CALL']); else if (c[i] < lo) out.push(['ROMPIMENTO', 'PUT']);
  if (upT && cs[i].l <= e21[i] && c[i] > e21[i]) out.push(['RECUO_EMA21', 'CALL']);
  else if (dnT && cs[i].h >= e21[i] && c[i] < e21[i]) out.push(['RECUO_EMA21', 'PUT']);
  // KDJ (9,3,3)
  let k = 50, d = 50, pk = 50, pd = 50;
  for (let j = 0; j <= i; j++) {
    let h9 = -Infinity, l9 = Infinity; for (let m = Math.max(0, j - 8); m <= j; m++) { h9 = Math.max(h9, cs[m].h); l9 = Math.min(l9, cs[m].l); }
    const rsv = h9 === l9 ? 50 : (c[j] - l9) / (h9 - l9) * 100;
    pk = k; pd = d; k = k * 2 / 3 + rsv / 3; d = d * 2 / 3 + k / 3;
  }
  const jv = 3 * k - 2 * d;
  if (pk <= pd && k > d && jv < 20) out.push(['KDJ', 'CALL']);
  else if (pk >= pd && k < d && jv > 80) out.push(['KDJ', 'PUT']);
  // Ichimoku simplificado
  const mid = (x: number, n: number) => { let a = -Infinity, z = Infinity; for (let m = Math.max(0, x - n + 1); m <= x; m++) { a = Math.max(a, cs[m].h); z = Math.min(z, cs[m].l); } return (a + z) / 2; };
  const tk = mid(i, 9), kj = mid(i, 26), ptk = mid(i - 1, 9), pkj = mid(i - 1, 26);
  const sa = (mid(i - 26, 9) + mid(i - 26, 26)) / 2, sb = mid(i - 26, 52);
  if (ptk <= pkj && tk > kj && c[i] > Math.max(sa, sb)) out.push(['ICHIMOKU', 'CALL']);
  else if (ptk >= pkj && tk < kj && c[i] < Math.min(sa, sb)) out.push(['ICHIMOKU', 'PUT']);
  return out;
}

async function sendTelegram(text: string) {
  const lk = Deno.env.get('LOVABLE_API_KEY'), tk = Deno.env.get('TELEGRAM_API_KEY');
  if (!lk || !tk) { console.error('Telegram não configurado'); return; }
  const r = await fetch('https://connector-gateway.lovable.dev/telegram/sendMessage', {
    method: 'POST', headers: { Authorization: `Bearer ${lk}`, 'X-Connection-Api-Key': tk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: IQ_TELEGRAM_CHANNEL, text }), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) console.error(`Telegram [${r.status}]: ${await r.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return Response.json({ error: 'Missing configuration' }, { status: 500, headers: cors });
  if (req.method !== 'POST' || req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
  }
  const supabase = createClient(url, serviceKey);
  const input = await req.json().catch(() => null);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => key !== 'scheduled')
    || (input.scheduled !== undefined && typeof input.scheduled !== 'boolean')) {
    return Response.json({ error: 'Invalid parameters' }, { status: 400, headers: cors });
  }
  const targetMs = demoTargetMinute(Date.now(), input.scheduled === true);
  const previousDemoRead = supabase.from('iq_demo_test_orders')
    .select('id,entry_strategy,entry_minute,result,profit,asset,direction,status,iq_option_id')
    .eq('status','confirmed').not('iq_option_id','is',null)
    .in('entry_strategy',['CONTINUACAO_QUEDA_V1',QUEDA_WIN_CALL,'TENDENCIA'])
    .eq('entry_minute',new Date(targetMs-60000).toISOString()).then(r=>r);
  console.log('Demo timing prepare:', new Date().toISOString(), 'target:', new Date(targetMs).toISOString());
  // Fetch independent Demo learning inputs while broker login/candles are in flight.
  const demoSince = new Date(Date.now()-14*86400000).toISOString();
  const demoHistPromise = supabase.from('iq_demo_test_orders').select('entry_strategy,entry_minute,result,profit,asset,direction')
    .eq('status','confirmed').not('iq_option_id','is',null).in('result',['win','loss'])
    .gte('entry_minute',demoSince).order('entry_minute',{ascending:false}).limit(1000).then(r=>r);
  const refPromise = supabase.from('iq_demo_test_candidates').select('entry_minute,direction,candles').eq('signal_id',DEMO_REFERENCE_SIGNAL).maybeSingle().then(r=>r);
  const chartPromise = (async()=>{
    const chartRead = await supabase.from('iq_demo_test_candidates').select('signal_id,entry_minute,direction,candles')
      .not('candles','is',null).gte('entry_minute',demoSince)
      .lt('entry_minute',new Date(Math.floor(Date.now()/60000)*60000-60000).toISOString()).limit(1000);
    const ids=(chartRead.data||[]).map(r=>r.signal_id);
    const chartOut=ids.length ? await supabase.from('iq_demo_test_orders').select('signal_id,result').in('signal_id',ids).eq('status','confirmed').in('result',['win','loss']) : {data:[]};
    const outcome=new Map((chartOut.data||[]).map(r=>[r.signal_id,r.result]));
    return (chartRead.data||[]).flatMap(r=>{const res=outcome.get(r.signal_id);
      const f=res&&chartFeatures(r.candles as any[],Date.parse(r.entry_minute)/1000,r.direction);return f?[{f,result:res}]:[];});
  })();
  const historyPromise = supabase.from('operation_results')
    .select('asset, direction, entry_strategy, result, created_at')
    .eq('timeframe', 'TEST').in('result', ['win', 'loss'])
    .neq('entry_strategy', FORCE_FIRST_TEST)
    .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
    .order('created_at', { ascending: false }).limit(500)
    .abortSignal(AbortSignal.timeout(1500)).then(result => result);
  const newlySettled: LearningOutcome[] = [];
  // Start login as soon as the master read finishes, while expired rows are still loading.
  const masterLogin = readMasterIQConfig(supabase).then(async ({ data: cfg }) => ({
    cfg, ssid: cfg ? await login(cfg.email, cfg.password) : null,
  }));
  const [{ cfg, ssid }, { data: open }] = await Promise.all([
    masterLogin,
    supabase.from('operation_results').select('id, asset, direction, entry_strategy, created_at, telegram_sent')
      .eq('result', OPEN).lte('expiration_time', new Date(targetMs).toISOString()).limit(1000),
  ]);
  if (!cfg) return Response.json({ success: false, error: 'no config' }, { headers: cors });
  if (!ssid) return Response.json({ success: false, error: 'login failed' }, { headers: cors });
  let nowSec = Math.floor(Date.now() / 1000);
  const curMin = targetMs / 1000;
  console.log('Demo timing login ready:', new Date().toISOString());

  // Confirm each expired TEST as soon as its broker candle arrives, not after all assets.
  let resolved = 0;
  const confirmations: Promise<void>[] = [];
  const confirmAsset = async (asset: string, candles: K[]) => {
    for (const o of (open || []).filter(row => row.asset === asset)) {
      const entrySec = Math.floor(new Date(o.created_at).getTime() / 1000);
      const outcome = closedTestResult(candles, entrySec, o.direction, Math.floor(Date.now() / 1000));
      if (!outcome) continue;
      const { data: upd } = await supabase.from('operation_results').update(outcome)
        .eq('id', o.id).eq('result', OPEN).select('id');
      if (!upd?.length) continue;
      resolved++;
      if (o.entry_strategy !== FORCE_FIRST_TEST) newlySettled.push({ asset: o.asset, direction: o.direction, entry_strategy: o.entry_strategy,
        result: outcome.result, created_at: o.created_at });
      if (o.telegram_sent && o.entry_strategy !== FORCE_FIRST_TEST) {
        const hh = new Date(o.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        const head = outcome.result === 'win' ? '✅ RESULTADO: WIN' : outcome.result === 'loss' ? '❌ RESULTADO: LOSS' : '⚖️ RESULTADO: EMPATE';
        const delivery = sendTelegram([head + ' — AGÊNCIA MKT TRADER', `💱 Ativo: ${o.asset}`, `🎯 Estratégia: ${LABELS[o.entry_strategy] || o.entry_strategy}`,
          `Direção: ${o.direction === 'CALL' ? '🟢 COMPRA (CALL)' : '🔴 VENDA (PUT)'}`, `⏰ Entrada: ${hh} (Brasília) · 1 minuto`,
          '🧪 Operação TESTE (sem ordem real).'].join('\n')).catch(e => console.error('Telegram:', String(e)));
        // Historic TEST notifications must not hold up the current entry preparation.
        // @ts-ignore Hosted background runtime
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(delivery);
        else await delivery;
      }
    }
  };

  const series = new Map<string, K[]>();
  // Reconcile the exact previous Demo order on this already authenticated socket, before selection.
  let previousDemo = await previousDemoRead;
  const previousPending = (previousDemo.data || []).filter(o=>o.result==='pending');
  const demoSettlements: Promise<void>[] = [];
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(WS_URL);
    let pending = 0; const byReq = new Map<string, string>();
    let demoBalanceId = 0, demoHistoryPending = 0, candleDone = false;
    let demoHistoryTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { if(demoHistoryTimer)clearTimeout(demoHistoryTimer); try { ws.close(); } catch (_) { /* */ } resolve(); };
    const finishCandles = () => { candleDone=true; if(!demoHistoryPending)finish(); };
    const timer = setTimeout(finish, Math.max(0, targetMs - Date.now()) + 30000);
    let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
    let initialized = false;
    const requestInitialization = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
    };
    ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    ws.onerror = () => { clearTimeout(timer); finish(); };
    ws.onclose = () => { if (boundaryTimer) clearTimeout(boundaryTimer); };
    ws.onmessage = async (ev) => {
      const d = JSON.parse(ev.data);
      if (d.name === 'profile') {
        demoBalanceId = demoBalance(d.msg?.balances || [])?.id || 0;
        // Connection is already authenticated; only fresh closed candles are requested at :00.
        console.log('Demo timing broker ready:', new Date().toISOString());
        if (Date.now() < targetMs) boundaryTimer = setTimeout(requestInitialization, targetMs - Date.now());
        else requestInitialization();
      }
      if (d.name === 'initialization-data' && !initialized) {
        const requestTime = demoCandleRequestTime(Date.now(), targetMs);
        if (requestTime === null) { clearTimeout(timer); finish(); return; }
        initialized = true;
        nowSec = requestTime;
        console.log('Demo timing candles requested:', new Date().toISOString());
        if(previousPending.length && demoBalanceId) {
          demoHistoryPending=2;
          demoHistoryTimer=setTimeout(()=>{demoHistoryPending=0;if(candleDone)finish();},1500);
          for(const [name,version] of [['portfolio.get-history-positions','2.0'],['get-history-positions','1.0']]) {
            ws.send(JSON.stringify({name:'sendMessage',request_id:`demo-trigger-${name}`,msg:{name,version,body:{user_balance_id:demoBalanceId,instrument_types:name.startsWith('portfolio')?['binary-option','turbo-option','digital-option']:['turbo'],limit:300,offset:0}}}));
          }
        }
        const all = { ...(d.msg?.binary?.actives || {}), ...(d.msg?.turbo?.actives || {}) };
        const cand = new Map<string, number>();
        for (const [id, a] of Object.entries<any>(all)) {
          if (!a.enabled || a.is_suspended) continue;
          const s = symbolOf(a.name);
          if (!cand.has(s)) cand.set(s, Number(id));
        }
        pending = cand.size;
        if (!pending) { clearTimeout(timer); finishCandles(); return; }
        await sendCandleRequestBatches(prioritizeResultAssets(cand, (open || []).map(o => o.asset)), ([s, id]) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const rid = `m${id}`; byReq.set(rid, s);
          ws.send(JSON.stringify({ name: 'sendMessage', request_id: rid, msg: { name: 'get-candles', version: '2.0', body: { active_id: id, size: 60, to: nowSec, count: 101 } } }));
        });
      }
      if (d.name === 'candles' && byReq.has(d.request_id)) {
        const s = byReq.get(d.request_id); byReq.delete(d.request_id);
        if (!s) return;
        series.set(s, (d.msg?.candles || []).map((c: any) => ({ t: c.from, o: c.open, c: c.close, h: c.max, l: c.min }))
          .filter((k: K) => typeof k.c === 'number').sort((a: K, b: K) => a.t - b.t));
        confirmations.push(confirmAsset(s, series.get(s) || []));
        if (--pending <= 0) { clearTimeout(timer); finishCandles(); }
      }
      if(typeof d.request_id==='string' && d.request_id.startsWith('demo-trigger-')
        && ['history-positions','portfolio.get-history-positions','get-history-positions'].includes(d.name)) {
        const positions=d.msg?.positions || d.msg?.history || (Array.isArray(d.msg)?d.msg:[]);
        for(const pos of positions) {
          const outcome=demoHistoryOutcome(pos);if(!outcome)continue;
          const match=previousPending.find(o=>o.iq_option_id && outcome.ids.includes(o.iq_option_id));
          if(!match)continue;
          demoSettlements.push(supabase.from('iq_demo_test_orders')
            .update({result:outcome.result,profit:outcome.profit,settled_at:new Date().toISOString()})
            .eq('id',match.id).eq('result','pending').select('id').then(({data,error})=>{
              if(!error && data?.length){match.result=outcome.result;match.profit=outcome.profit;}
            }));
        }
        demoHistoryPending=Math.max(0,demoHistoryPending-1);
        if(!demoHistoryPending && candleDone)finish();
      }
    };
  });

  // Await database confirmation, not Telegram, before the atomic four-win claim.
  await Promise.all(confirmations);
  await Promise.all(demoSettlements);
  // Another settlement worker may win the conditional write; refresh instead of trusting its old snapshot.
  if(previousPending.length)previousDemo = await supabase.from('iq_demo_test_orders')
    .select('id,entry_strategy,entry_minute,result,profit,asset,direction,status,iq_option_id')
    .eq('status','confirmed').not('iq_option_id','is',null)
    .in('entry_strategy',['CONTINUACAO_QUEDA_V1',QUEDA_WIN_CALL,'TENDENCIA'])
    .eq('entry_minute',new Date(targetMs-60000).toISOString());
  console.log('Demo timing candles settled:', new Date().toISOString(), 'assets:', series.size);
  for (const o of open || []) {
    const entrySec = Math.floor(new Date(o.created_at).getTime() / 1000);
    const k = series.get(o.asset)?.find(x => x.t === entrySec);
    if ((!k || k.t + 60 > nowSec) && nowSec - entrySec > 600) {
      await supabase.from('operation_results').update({ result: 'expired' }).eq('id', o.id).eq('result', OPEN);
    }
  }

  // 2) Novas entradas TESTE na vela atual (:00) para cada estratégia que disparou na última vela fechada.
  const historyRead = await historyPromise;
  if (historyRead.error) console.error('Recent learning history unavailable:', historyRead.error.message);
  const history = [...newlySettled, ...(historyRead.data || [])]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .filter((row, index, all) => all.findIndex(other => other.asset === row.asset
      && other.created_at === row.created_at && other.entry_strategy === row.entry_strategy) === index);
  const rows: any[] = [];
  const demoPatterns: DemoCandidate[] = [];
  for (const [asset, cs] of series) {
    const closed = cs.filter(k => k.t + 60 <= curMin);
    if (!closed.length || closed[closed.length - 1].t !== curMin - 60) continue;
    // Uma entrada por par por minuto: se várias estratégias dispararem, fica só uma (Tendência tem prioridade).
    // Keep legacy indicator warmup unchanged despite the larger Demo candle window.
    const fired = detect(cs.slice(-90).filter(k => k.t + 60 <= curMin));
    const pattern = demoContinuation(cs,curMin);
    if (pattern) demoPatterns.push({signal_id:`demo-continuation-v1-${asset}-${curMin}`,asset,direction:'PUT',
      entry_strategy:DEMO_CONTINUATION,created_at:new Date(curMin*1000).toISOString(),
      _score:fired.filter(([,direction])=>direction==='PUT').length+0.99*pattern.bodyRatio});
    const ceiling = demoCeiling(cs,curMin);
    if (ceiling) demoPatterns.push({signal_id:`demo-teto-v1-${asset}-${curMin}`,asset,direction:'PUT',
      entry_strategy:DEMO_CEILING,created_at:new Date(curMin*1000).toISOString(),
      _score:fired.filter(([,direction])=>direction==='PUT').length+0.99*ceiling.match});
    // Só os melhores: exige pelo menos 2 estratégias concordando na mesma direção no gráfico IQ.
    const calls = fired.filter(([, d]) => d === 'CALL'), puts = fired.filter(([, d]) => d === 'PUT');
    const agree = calls.length >= 2 && !puts.length ? calls : puts.length >= 2 && !calls.length ? puts : [];
    const pick = agree.find(([st]) => st === 'TENDENCIA') || agree[0];
    for (const [strat, dir] of pick ? [pick] : []) {
      rows.push({
        signal_id: `t7-${asset}-${strat}-${curMin}`, asset, direction: dir, entry_price: closed[closed.length - 1].c,
        result: OPEN, profit: 0, created_at: new Date(curMin * 1000).toISOString(),
        expiration_time: new Date((curMin + 60) * 1000).toISOString(), is_auto_trade: true, is_ai_analyzed: false,
        timeframe: 'TEST', entry_strategy: strat,
        _score: agree.length + Math.min(0.99, 100 * Math.abs(closed[closed.length - 1].c - closed[closed.length - 1].o) / (closed[closed.length - 1].o || 1))
          + recentLearningAdjustment(history, { asset, direction: dir, entry_strategy: strat }, curMin * 1000),
      });
    }
  }
  let inserted = 0;
  // Separate service ledger: new Demo patterns never enter principal TEST history/claims.
  // Display-only enrichment: retain the result and following closed candle.
  // Retry recent snapshots so a missed runner minute cannot strand the chart.
  const enrichCharts = async () => {
  const recentDemo = await supabase.from('iq_demo_test_candidates').select('entry_minute,asset,candles')
    .gte('entry_minute',new Date((curMin-90*60)*1000).toISOString())
    .lt('entry_minute',new Date(curMin*1000).toISOString());
  await Promise.all((recentDemo.data || []).map(async row => {
    if (!Array.isArray(row.candles)) return;
    const candles = extendDemoChart(row.candles as K[],series.get(row.asset) || [],Date.parse(row.entry_minute)/1000,curMin);
    if (JSON.stringify(candles) === JSON.stringify(row.candles)) return;
    const {error}=await supabase.from('iq_demo_test_candidates').update({candles}).eq('entry_minute',row.entry_minute);
    if (error) console.error('Demo result candle write failed:',error.code);
  }));
  };
  const [demoHist,chartSamples,refRow] = await Promise.all([demoHistPromise,chartPromise,refPromise]);
  if (demoHist.error) console.error('Demo learning unavailable:',demoHist.error.code);
  const demoPool = [...rows,...demoPatterns].map(c=>({...c,_score:Math.max(0,c._score
    +2*demoLearningAdjustment(demoHist.data||[],c.entry_strategy,curMin*1000)
    +2*chartPatternAdjustment(chartSamples,chartFeatures(series.get(c.asset)||[],curMin,c.direction)))}));
  // Queda win -> CALL: a confirmed Queda PUT win last minute authorizes a CALL on the same asset.
  const qw = quedaWinCall(previousDemo.data || [], curMin);
  if (qw && series.has(qw.asset)) demoPool.push({ signal_id: `queda-win-call-v1-${qw.asset}-${curMin}`,
    asset: qw.asset, direction: qw.direction, entry_strategy: QUEDA_WIN_CALL,
    created_at: new Date(curMin * 1000).toISOString(), _score: 1 });
  const retry = quedaWinRetry(previousDemo.data || [], curMin);
  if(retry && series.has(retry.asset))demoPool.push({signal_id:`queda-win-retry-v1-${retry.asset}-${curMin}`,
    asset:retry.asset,direction:retry.direction,entry_strategy:QUEDA_WIN_RETRY,
    created_at:new Date(curMin*1000).toISOString(),_score:1});
  const refF = refRow.data ? chartFeatures(refRow.data.candles as any[],Date.parse(refRow.data.entry_minute)/1000,refRow.data.direction) : null;
  // Only charts similar to the user's reference trade may compete; no reference => no Demo entry.
  const demoWinner = chooseDemoCandidate(demoPool.filter(c=>similarToReference(refF,chartFeatures(series.get(c.asset)||[],curMin,c.direction))));
  if (demoWinner) {
    const {error} = await supabase.from('iq_demo_test_candidates').upsert({entry_minute:demoWinner.created_at,
      signal_id:demoWinner.signal_id,asset:demoWinner.asset,direction:demoWinner.direction,
      entry_strategy:demoWinner.entry_strategy,score:demoWinner._score,
      candles:(series.get(demoWinner.asset)||[]).filter(k=>k.t<curMin).slice(-20)},{onConflict:'entry_minute',ignoreDuplicates:true});
    if (error) console.error('Demo candidate write failed:',error.code);
    else {
      console.log('Demo timing candidate persisted:', new Date().toISOString(), demoWinner.signal_id);
      // A selected Trend may independently authorize a principal order; no Demo stake/history reuse.
      if (selectedDemoPrincipal({ ...demoWinner, entry_minute: demoWinner.created_at }, Date.now())) {
        const principalTask = supabase.functions.invoke('selected-demo-trend', {
          body: { candidate: demoWinner.signal_id, brokerSession: { ssid, configId: cfg.id } },
        }).then(async ({ data, error }) => {
          if (error) {
            const details = 'context' in error && error.context instanceof Response ? await error.context.text() : error.message;
            console.error('Selected Trend principal dispatch failed:', details);
          } else console.log('Selected Trend principal outcome:', JSON.stringify(data));
        }).catch(error => console.error('Selected Trend dispatch failed:', String(error)));
        // @ts-ignore Hosted background runtime
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(principalTask); else await principalTask;
      }
      const demoTask=supabase.functions.invoke('iqoption-demo-tests',{body:{candidate:demoWinner.signal_id,brokerSession:{ssid,configId:cfg.id}}})
        .then(({error})=>{if(error)console.error('Demo TEST dispatch failed');});
      // @ts-ignore Hosted background runtime
      if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(demoTask);else await demoTask;
    }
  }
  const chartTask=enrichCharts().catch(error=>console.error('Demo chart enrichment failed:',String(error)));
  // @ts-ignore Hosted background runtime: chart writes must not delay a fresh entry.
  if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(chartTask);else await chartTask;
  if (rows.length) {
    // Independent reads run together after closed-candle confirmation.
    const [{ data: exist }, { data: minuteTaken }, sequenceRead] = await Promise.all([
      supabase.from('operation_results').select('signal_id').in('signal_id', rows.map(r => r.signal_id)),
      supabase.from('operation_results').select('id').eq('created_at', new Date(curMin * 1000).toISOString()).eq('timeframe', 'TEST').neq('entry_strategy', FORCE_FIRST_TEST).limit(1),
      supabase.from('operation_results').select('entry_strategy, result, created_at')
        .eq('timeframe', 'TEST').like('signal_id', 't7-%')
        .lt('created_at', new Date(curMin * 1000).toISOString())
        .gte('created_at', new Date((curMin - 180) * 1000).toISOString())
        .order('created_at', { ascending: false }).order('signal_id', { ascending: false }).limit(4),
    ]);
    const seen = new Set((exist || []).map((e: any) => e.signal_id));
    // Melhor par do minuto: só UMA entrada (mais estratégias concordando, depois vela mais forte).
    const top = rows.filter(r => !seen.has(r.signal_id)).sort((x, y) => y._score - x._score)[0];
    const fresh = top && !minuteTaken?.length ? [top] : [];
    // One best candidate; Telegram is reserved for the four-win reversal.
    const best = fresh.filter(r => r._score >= 0).sort((x, y) => y._score - x._score)[0];
    // Persist the selected TEST first: the atomic claim checks its four predecessors.
    // Observe the same base TEST signal; never duplicate/relabel it or authorize an order.
    const { data: sequenceHistory, error: sequenceError } = sequenceRead;
    if (sequenceError) console.error('TEST sequence read:', sequenceError.message);
    const clean = fresh.map(({ _score, ...r }) => ({ ...r, telegram_sent: false,
      test_inverted_strategy: null, // Força Invertida removida (20/10/2026)
      test_sequence_strategy: !sequenceError && matchesTrendSequence(sequenceHistory || [], r.entry_strategy, curMin * 1000)
        ? TREND_SEQUENCE_TEST : null,
    }));
    if (clean.length) { const { error } = await supabase.from('operation_results').insert(clean); if (error) console.error(error.message); else inserted = clean.length; }
    // Separate shadow: never rank or claim it, and never relabel the original Force.
    if (inserted) {
      const observations = clean.flatMap(base => {
        const observation = forceFirstObservation(base, series.get(base.asset) || []);
        return observation ? [observation] : [];
      });
      if (observations.length) {
        const persist = supabase.from('operation_results').upsert(observations, { onConflict: 'signal_id', ignoreDuplicates: true })
          .then(({ error }) => { if (error) console.error('Force first TEST:', error.message); });
        // Never delay the original real entry for study persistence.
        // @ts-ignore Hosted background runtime
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(persist);
        else await persist;
      }
    }
    if (best && inserted) {
      // Estratégias reais ativas (20/10/2026): Reversão RSI e Retomada; Força Invertida removida.
      const { data: trade, error: claimError } = await supabase.rpc('claim_test_strategy_entry', { p_candidate: best.signal_id });
      if (claimError) console.error('Strategy claim:', claimError.message);
      if (trade && typeof trade === 'object' && !Array.isArray(trade) && 'signalId' in trade) {
        const claimedStrategy = String(trade.entryStrategy);
        const entryAt = nextReversalMinute(curMin * 1000);
        const task = (async () => {
          // Reuse the session that just fetched these candles, avoiding another broker login.
          // This secret travels server-to-server only, never to browser, storage or logs.
          const { data, error } = await supabase.functions.invoke('iqoption-place-trade', {
            body: { ...trade, entryAt, brokerSession: { ssid, configId: cfg.id } },
          });
          const details = error && 'context' in error && error.context instanceof Response
            ? await error.context.text() : error?.message;
          await supabase.from('trade_queue').update({
            status: data?.success ? 'executed' : 'failed', iq_option_id: data?.tradeId || null,
            executed_at: data?.success ? new Date().toISOString() : null,
            error: data?.success ? null : details || data?.error || 'Placement failed',
          }).eq('signal_id', String(trade.signalId)).eq('entry_strategy', claimedStrategy);
        })().catch(async e => {
          console.error('Four-win placement:', String(e));
          await supabase.from('trade_queue').update({ status: 'failed', error: String(e) })
            .eq('signal_id', String(trade.signalId)).eq('status', 'executing');
        });
        // Keep broker placement alive without blocking the minute analysis.
        // @ts-ignore Hosted background runtime
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(task);
        else await task;
         return Response.json({ success: true, assets: series.size, inserted, resolved, strategy: claimedStrategy }, { headers: cors });
      }
    }
    // Other entries remain TEST, but no longer generate new Telegram signals.
    // Previously notified tests still receive their final result above.
  }
  return Response.json({ success: true, assets: series.size, inserted, resolved }, { headers: cors });
});
