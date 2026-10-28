// Modo TESTE com 7 estratégias (pedido 16/10/2026): roda a cada minuto em TODOS os ativos abertos da IQ Option.
// Nada abre na corretora. Cada entrada é registrada como TESTE na vela :00 com expiração de 1 minuto
// e resolvida pelas velas reais da IQ Option. Telegram: só o resultado WIN da Tendência (mesmo em teste).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { IQ_TELEGRAM_CHANNEL } from '../_shared/telegram-iq-alert.ts';
import { telegramTradingEnabled } from '../_shared/principal-pause.ts';
import { nextReversalMinute } from '../_shared/four-win-reversal.ts';
import { closedTestResult, prioritizeResultAssets } from '../_shared/test-candle-result.ts';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { sendCandleRequestBatches } from '../_shared/candle-request-batches.ts';
import { recentLearningAdjustment, type LearningOutcome } from '../_shared/recent-signal-learning.ts';
import { matchesTrendSequence, TREND_SEQUENCE_TEST } from '../_shared/trend-sequence-test.ts';
import { forceFirstObservation, FORCE_FIRST_TEST } from '../_shared/force-first-test.ts';
import { takashiKotegawa, takashiBaseScore, TAKASHI_BNF } from '../_shared/takashi-kotegawa.ts';
import { demoCohort, preferredDemoCohort, TAKASHI_STRATEGY, TAKASHI_DEMO_MIN_SCORE } from '../_shared/demo-226-policy.ts';
import { demoContinuation, demoCeiling, DEMO_CEILING, demoLearningAdjustment, demoAssetAdjustment, demoLearnedReject, demoScoreAllowed, demoFinalScore, combinedLearnedScore, chartFeatures, chartPatternAdjustment, demoPreferredPatternDistance, chooseDemoCandidate, DEMO_CONTINUATION, DEMO_REFERENCE_SIGNAL, similarToReference, similarToAnyReference, type DemoCandidate } from '../_shared/demo-continuation.ts';
import { DEMO_PRINCIPAL_ENABLED, isSuperSelected } from '../_shared/demo-validated.ts';
import { demoForcaPadrao, FORCA_PADRAO } from '../_shared/forca-padrao.ts';
import { forcaAntecipada, FORCA_ANTECIPADA } from '../_shared/forca-antecipada.ts';
import { extendDemoChart } from '../_shared/demo-chart-snapshot.ts';
import { selectedDemoPrincipal } from '../_shared/selected-demo-principal.ts';
import { demoTargetMinute, demoCandleRequestTime, demoBoundaryDelay } from '../_shared/demo-timing.ts';
import { quedaWinCall, quedaWinRetry, QUEDA_WIN_CALL, QUEDA_WIN_RETRY } from '../_shared/queda-win-call.ts';
import { demoHistoryOutcome } from '../_shared/demo-history.ts';
import { demoBalance } from '../_shared/demo-balance.ts';
import { readDemoScoreHistory } from '../_shared/demo-score-priority.ts';
import { demoRejectionReason, type RejectionReason } from '../_shared/demo-rejection.ts';
import { demoWinningPatternMatch, demoDisplayedTargetScore } from '../_shared/demo-continuation.ts';
import { demoEntryReason } from '../_shared/demo-entry-authorization.ts';
import { DEMO_MID_CANDLE } from '../_shared/demo-mid-candle.ts';
import { readDemoWinningReferences } from '../_shared/demo-winning-reference-history.ts';
import { preparedDemoOrder } from '../_shared/prepared-demo-order.ts';
import { DEMO_TEST_AMOUNT } from '../_shared/demo-test-policy.ts';
import { readTakashiRecentOrders, takashiRecentEvidence, takashiRecentAdjustment } from '../_shared/takashi-recent-learning.ts';
import { watchDemoSettlements } from '../_shared/demo-settlement-watch.ts';
import { loginBeforeBoundary } from '../_shared/demo-login-retry.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const AUTH_URLS = ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login'];
const WS_URL = 'wss://iqoption.com/echo/websocket';
const OPEN = 'test7_open';
const DEMO_OWN_WATCH_GRACE_MS = 22000;
type K = { t: number; o: number; c: number; h: number; l: number };

export const LABELS: Record<string, string> = {
  TENDENCIA: 'Tendência', REVERSAO_RSI: 'Reversão RSI', VELA_FORCA: 'Vela de força', ROMPIMENTO: 'Rompimento',
  RECUO_EMA21: 'Recuo na média 21', KDJ: 'KDJ', ICHIMOKU: 'Ichimoku',
  [FORCE_FIRST_TEST]: 'Força sem rompimento · primeira vela (TESTE)',
  [TAKASHI_BNF]: 'Takashi Kotegawa',
};

async function login(email: string, password: string, timeoutMs = 10000): Promise<string | null> {
  // The broker login sometimes answers in 3-8s; splitting the budget across hosts
  // aborted every slow-but-valid answer. Give the primary host the whole budget.
  const deadline = Date.now() + timeoutMs;
  for (const u of AUTH_URLS) {
    const left = deadline - Date.now();
    if (left < 1000) break;
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, body: new URLSearchParams({ identifier: email, password }), signal: AbortSignal.timeout(left) });
      const d = await r.json().catch(() => ({}));
      if (d.code === 'success' && d.ssid) return d.ssid;
      console.warn('Demo login refused:', { status: r.status, code: d?.code ?? null });
    } catch (e) { console.warn('Demo login error:', e instanceof Error ? e.name : 'unknown'); }
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
  if (!telegramTradingEnabled()) return;
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
  const scheduler = req.headers.get('x-scheduler-token');
  let authorized = req.headers.get('Authorization') === `Bearer ${serviceKey}`;
  if (!authorized && scheduler) {
    const { data } = await createClient(url,serviceKey).from('anticipation_scheduler_auth').select('token').eq('id',1).maybeSingle();
    authorized = !!data?.token && data.token === scheduler;
  }
  if (req.method !== 'POST' || !authorized) {
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
  // Moves to this run's own order expiry when it keeps watching after placement.
  let pendingCutoffMs = targetMs;
  const readPendingDemo = () => supabase.from('iq_demo_test_orders')
    .select('id,signal_id,entry_strategy,entry_minute,result,profit,asset,direction,status,account_type,iq_option_id,settled_at')
    .eq('status','confirmed').not('iq_option_id','is',null)
    .eq('account_type','PRACTICE').eq('result','pending')
    .lte('expiration_time',new Date(pendingCutoffMs).toISOString())
    .order('entry_minute').limit(1000).then(r=>r);
  const previousDemoRead = readPendingDemo();
  const amountRead = supabase.from('iq_demo_test_settings').select('amount').eq('id',1).maybeSingle().then(r=>r);
  // Own recent broker evidence loads during preparation, not after the :00 candle request.
  const takashiRecentRead = readTakashiRecentOrders(async(from,to)=>{
    const {data,error}=await supabase.from('iq_demo_test_orders')
      .select('signal_id,entry_strategy,asset,direction,entry_minute,settled_at,status,account_type,iq_option_id,result')
      .eq('entry_strategy',TAKASHI_BNF).eq('status','confirmed').eq('account_type','PRACTICE')
      .not('iq_option_id','is',null).in('result',['win','loss'])
      .gte('entry_minute',new Date(targetMs-14*86400000).toISOString())
      .lt('entry_minute',new Date(targetMs).toISOString())
      .order('entry_minute',{ascending:false}).order('id').range(from,to);
    if(error)throw error;return data||[];
  }).then(data=>({data,error:null})).catch(()=>({data:[],error:'unavailable'}));
  console.log('Demo timing prepare:', new Date().toISOString(), 'target:', new Date(targetMs).toISOString());
  // Fetch independent Demo learning inputs while broker login/candles are in flight.
  const demoSince = new Date(Date.now()-14*86400000).toISOString();
  const demoHistPromise = supabase.from('iq_demo_test_orders').select('entry_strategy,entry_minute,result,profit,asset,direction').neq('entry_strategy',DEMO_MID_CANDLE)
    .eq('status','confirmed').not('iq_option_id','is',null).in('result',['win','loss'])
    .gte('entry_minute',demoSince).order('entry_minute',{ascending:false}).limit(1000).then(r=>r);
  // Real principal IQ entries and their confirmed results also teach the scorer (heavier weight).
  const realHistPromise = supabase.from('operation_results')
    .select('entry_strategy,asset,direction,result,created_at')
    .not('timeframe','in','("TEST","MT5")').in('result',['win','loss'])
    .not('iq_option_id','is',null).not('iq_option_id','like','mt5-%').not('iq_option_id','ilike','test%')
    .gte('created_at',demoSince).order('created_at',{ascending:false}).limit(1000)
    .then(r=>({...r,data:(r.data||[]).map(x=>({entry_strategy:x.entry_strategy,entry_minute:x.created_at,result:x.result,profit:x.result==='win'?1:-1,asset:x.asset}))}));
  // Rejected Demo candidates whose live-price TEST outcome is known also teach the scorer (half weight).
  const rejectedHistPromise = (async()=>{
    const {data,error}=await supabase.from('operation_results').select('signal_id,entry_strategy,asset,result,profit,created_at')
      .eq('timeframe','TEST').in('result',['win','loss']).gte('created_at',demoSince)
      .order('created_at',{ascending:false}).limit(1000);
    if(error||!data?.length)return [];
    const ids=new Set<string>();
    for(let i=0;i<data.length;i+=200){
      const r=await supabase.from('demo_selection_rejections').select('signal_id').in('signal_id',data.slice(i,i+200).map(x=>x.signal_id));
      if(r.error)return [];
      for(const x of r.data||[])ids.add(x.signal_id);
    }
    return data.filter(x=>ids.has(x.signal_id)).map(x=>({entry_strategy:x.entry_strategy,entry_minute:x.created_at,result:x.result,profit:Number(x.profit)||0,asset:x.asset}));
  })().catch(()=>[]);
  const refPromise = supabase.from('iq_demo_test_candidates').select('entry_minute,direction,candles').eq('signal_id',DEMO_REFERENCE_SIGNAL).maybeSingle().then(r=>r);
  const scorePriorityPromise = readDemoScoreHistory(async(from,to)=>{
    const {data,error}=await supabase.from('iq_demo_test_orders')
      .select('signal_id,status,account_type,iq_option_id,result,profit').neq('entry_strategy',DEMO_MID_CANDLE)
      .eq('status','confirmed').eq('account_type','PRACTICE').not('iq_option_id','is',null)
      .order('entry_minute',{ascending:true}).order('id').range(from,to);
    if(error)throw error;return data||[];
  },async ids=>{
    const {data,error}=await supabase.from('iq_demo_test_candidates').select('signal_id,score').in('signal_id',ids);
    if(error)throw error;return data||[];
  }).then(data=>({data,error:null})).catch(error=>({data:null,error}));
  const chartPromise = (async()=>{
    const chartRead = await supabase.from('iq_demo_test_candidates').select('signal_id,asset,entry_minute,direction,candles,score')
      .neq('entry_strategy',DEMO_MID_CANDLE).not('candles','is',null).gte('entry_minute',demoSince)
      .lt('entry_minute',new Date(Math.floor(Date.now()/60000)*60000-60000).toISOString())
      .order('entry_minute',{ascending:false}).limit(1000);
    const ids=(chartRead.data||[]).map(r=>r.signal_id);
    const chartOut=ids.length ? await supabase.from('iq_demo_test_orders').select('signal_id,result').in('signal_id',ids).eq('status','confirmed').not('iq_option_id','is',null).in('result',['win','loss']) : {data:[]};
    const outcome=new Map((chartOut.data||[]).map(r=>[r.signal_id,r.result]));
    return (chartRead.data||[]).flatMap(r=>{const res=outcome.get(r.signal_id);
      const f=res&&chartFeatures(r.candles as any[],Date.parse(r.entry_minute)/1000,r.direction);return f?[{f,result:res,score:r.score,signal_id:r.signal_id,asset:r.asset,entry_minute:r.entry_minute}]:[];});
  })();
  const winningChartsPromise = readDemoWinningReferences(async (from,to) => {
    const {data,error}=await supabase.from('iq_demo_test_orders')
      .select('signal_id,status,account_type,iq_option_id,result').neq('entry_strategy',DEMO_MID_CANDLE).eq('status','confirmed')
      .eq('account_type','PRACTICE').eq('result','win').not('iq_option_id','is',null)
      .order('entry_minute',{ascending:false}).order('id').range(from,to);
    if(error)throw error;return data||[];
  },async ids=>{
    const {data,error}=await supabase.from('iq_demo_test_candidates')
      .select('signal_id,asset,entry_minute,direction,candles,score').in('signal_id',ids);
    if(error)throw error;return data||[];
  }).then(rows=>rows.flatMap(r=>{
    const f=Array.isArray(r.candles)?chartFeatures(r.candles as K[],Date.parse(r.entry_minute)/1000,r.direction):null;
    return f?[{f,result:'win',score:r.score,signal_id:r.signal_id,asset:r.asset,entry_minute:r.entry_minute}]:[];
  })).catch(()=>{console.error('Demo winning chart references unavailable');return [];});
  const historyPromise = supabase.from('operation_results')
    .select('asset, direction, entry_strategy, result, created_at')
    .eq('timeframe', 'TEST').in('result', ['win', 'loss'])
    .neq('entry_strategy', FORCE_FIRST_TEST).neq('entry_strategy', TAKASHI_BNF)
    .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
    .order('created_at', { ascending: false }).limit(500)
    .abortSignal(AbortSignal.timeout(1500)).then(result => result);
  const newlySettled: LearningOutcome[] = [];
  // Start login as soon as the master read finishes, while expired rows are still loading.
  const masterLogin = readMasterIQConfig(supabase).then(async ({ data: cfg }) => {
    // Short attempts repeated until shortly before :00; never logs in after the boundary.
    const ssid=cfg ? await loginBeforeBoundary(ms=>login(cfg.email,cfg.password,ms),targetMs) : null;
    return {cfg,ssid};
  });
  const [{ cfg, ssid }, { data: open }] = await Promise.all([
    masterLogin,
    supabase.from('operation_results').select('id, asset, direction, entry_strategy, created_at, telegram_sent')
      .eq('result', OPEN).lte('expiration_time', new Date(targetMs).toISOString()).limit(1000),
  ]);
  if (!cfg) return Response.json({ success: false, error: 'no config' }, { headers: cors });
  if (!ssid) {
    console.error('Demo scan unavailable: broker login failed; next scheduled minute retries');
    return Response.json({ success: false, error: 'login failed' }, { headers: cors });
  }
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
      if (o.entry_strategy !== FORCE_FIRST_TEST && o.entry_strategy !== TAKASHI_BNF) newlySettled.push({ asset: o.asset, direction: o.direction, entry_strategy: o.entry_strategy,
        result: outcome.result, created_at: o.created_at });
      if (o.telegram_sent && o.entry_strategy !== FORCE_FIRST_TEST && o.entry_strategy !== TAKASHI_BNF) {
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
  let preparedSocket: WebSocket | null = null;
  let preparedBalanceId = 0;
  let preparedActives: Record<string, any> = {};
  let closePrepared = () => {};
  let handleOrder: ((message: any) => void) | null = null;
  let settlementWatch: Promise<number> = Promise.resolve(0);
  let requestPending: () => Promise<boolean> = async () => false;
  let extendPrepared: (untilMs: number) => void = () => {};
  let ownExpiryMs = 0;
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(WS_URL);
    preparedSocket = ws;
    let pending = 0; const byReq = new Map<string, string>();
    let demoBalanceId = 0, candleDone = false;
    let historyAttempt=0;
    const historyResponses=new Set<string>();
    let demoHistoryTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { if(demoHistoryTimer)clearTimeout(demoHistoryTimer); resolve(); };
    closePrepared = () => { clearTimeout(timer); if(boundaryTimer)clearTimeout(boundaryTimer); if(demoHistoryTimer)clearTimeout(demoHistoryTimer); try{ws.close();}catch{} };
    const finishCandles = () => { candleDone=true; finish(); };
    let timer = setTimeout(() => { finish(); closePrepared(); }, Math.max(0, targetMs - Date.now()) + 30000);
    // Keep this authenticated socket alive past its own order expiry, so the result
    // does not depend on the next minute's broker login succeeding.
    extendPrepared = (untilMs: number) => { clearTimeout(timer); timer = setTimeout(() => { finish(); closePrepared(); }, Math.max(0, untilMs - Date.now())); };
    let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
    let initialized = false;
    const requestInitialization = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
    };
    const requestPendingHistory = async () => {
      if(ws.readyState!==WebSocket.OPEN || !demoBalanceId)return false;
      await Promise.all(demoSettlements);
      const fresh=await readPendingDemo();
      if(fresh.error){console.error('Demo pending refresh failed:',fresh.error.code);return true;}
      for(const row of fresh.data||[]) {
        const existing=previousPending.find(o=>o.id===row.id);
        if(existing)Object.assign(existing,row);else previousPending.push(row);
      }
      const unresolved=(fresh.data||[]).length;
      console.log('Demo settlement check:',JSON.stringify({attempt:++historyAttempt,pending:unresolved,at:new Date().toISOString()}));
      if(!unresolved)return false;
      for(const offset of [0,300,600])for(const [name,version] of [['portfolio.get-history-positions','2.0'],['get-history-positions','1.0']]) {
        if(ws.readyState!==WebSocket.OPEN)return false;
        ws.send(JSON.stringify({name:'sendMessage',request_id:`demo-trigger-${historyAttempt}-${name}-${offset}`,msg:{name,version,body:{user_balance_id:demoBalanceId,instrument_types:name.startsWith('portfolio')?['binary-option','turbo-option','digital-option']:['turbo'],limit:300,offset}}}));
      }
      return true;
    };
    requestPending = requestPendingHistory;
    ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    ws.onerror = () => { finish(); closePrepared(); };
    ws.onclose = () => { if (boundaryTimer) clearTimeout(boundaryTimer); };
    ws.onmessage = async (ev) => {
      const d = JSON.parse(ev.data);
      handleOrder?.(d);
      if (d.name === 'profile') {
        demoBalanceId = demoBalance(d.msg?.balances || [])?.id || 0;
        preparedBalanceId = demoBalanceId;
        // Re-read at :01 so this minute's confirmation is not missed by preflight.
        settlementWatch=watchDemoSettlements(targetMs,requestPendingHistory)
          .catch(error=>{console.error('Demo settlement watch failed:',String(error));return 0;});
        // Connection is already authenticated; only fresh closed candles are requested at :00.
        console.log('Demo timing broker ready:', new Date().toISOString());
        requestInitialization();
      }
      if (d.name === 'initialization-data' && !initialized) {
        initialized = true;
        preparedActives = d.msg?.turbo?.actives || {};
        const requestCandles = async () => {
        const requestTime = demoCandleRequestTime(Date.now(), targetMs);
        if (requestTime === null) { clearTimeout(timer); finish(); return; }
        nowSec = requestTime;
        console.log('Demo timing candles requested:', new Date().toISOString());
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
        };
        const delay = demoBoundaryDelay(Date.now(), targetMs);
        if (delay > 0) boundaryTimer = setTimeout(() => { void requestCandles(); }, delay);
        else await requestCandles();
      }
      if (d.name === 'candles' && byReq.has(d.request_id)) {
        const s = byReq.get(d.request_id); byReq.delete(d.request_id);
        if (!s) return;
        series.set(s, (d.msg?.candles || []).map((c: any) => ({ t: c.from, o: c.open, c: c.close, h: c.max, l: c.min }))
          .filter((k: K) => typeof k.c === 'number').sort((a: K, b: K) => a.t - b.t));
        confirmations.push(confirmAsset(s, series.get(s) || []));
        if (--pending <= 0) { finishCandles(); }
      }
      if(typeof d.request_id==='string' && d.request_id.startsWith('demo-trigger-')
        && ['history-positions','portfolio.get-history-positions','get-history-positions'].includes(d.name)) {
        if(historyResponses.has(d.request_id))return;
        historyResponses.add(d.request_id);
        const positions=d.msg?.positions || d.msg?.history || (Array.isArray(d.msg)?d.msg:[]);
        for(const pos of positions) {
          const outcome=demoHistoryOutcome(pos);if(!outcome)continue;
          const match=previousPending.find(o=>o.iq_option_id && outcome.ids.includes(o.iq_option_id));
          if(!match)continue;
          demoSettlements.push(supabase.from('iq_demo_test_orders')
            .update({result:outcome.result,profit:outcome.profit,settled_at:new Date().toISOString()})
            .eq('id',match.id).eq('result','pending').select('id').then(({data,error})=>{
              if(!error && data?.length){match.result=outcome.result;match.profit=outcome.profit;match.settled_at=new Date().toISOString();console.log('Demo result confirmed:',JSON.stringify({signal:match.signal_id,result:outcome.result,at:match.settled_at}));}
            }));
        }
      }
    };
  });

  // Await database confirmation, not Telegram, before the atomic four-win claim.
  await Promise.all(confirmations);
  await Promise.all(demoSettlements);
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
  const recentTakashi = await takashiRecentRead;
  if(recentTakashi.error)console.error('Takashi recent learning unavailable');
  const learningObservedMs=Date.now();
  const takashiHistory=[...previousPending,...recentTakashi.data];
  const ownEvidence=takashiRecentEvidence(takashiHistory,targetMs,learningObservedMs);
  console.log('Takashi recent learning:',JSON.stringify({samples:ownEvidence.length,wins:ownEvidence.filter(r=>r.result==='win').length,losses:ownEvidence.filter(r=>r.result==='loss').length}));
  for (const [asset, cs] of series) {
    const closed = cs.filter(k => k.t + 60 <= curMin);
    if (!closed.length || closed[closed.length - 1].t !== curMin - 60) continue;
    // Uma entrada por par por minuto: se várias estratégias dispararem, fica só uma (Tendência tem prioridade).
    // Keep legacy indicator warmup unchanged despite the larger Demo candle window.
    const fired = detect(cs.slice(-90).filter(k => k.t + 60 <= curMin));
    const takashi = takashiKotegawa(cs, curMin);
    if (takashi) demoPatterns.push({
      signal_id: `takashi-bnf-v1-${asset}-${curMin}`, asset, direction: takashi.direction,
      entry_strategy: TAKASHI_BNF, created_at: new Date(curMin * 1000).toISOString(),
      // Same confluence/body base as other indicators; never assign the target score.
      _score: takashiBaseScore(closed[closed.length - 1], fired.filter(([, direction]) => direction === takashi.direction).length)
        + takashiRecentAdjustment(takashiHistory, { asset, direction: takashi.direction }, targetMs, learningObservedMs),
    });
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
    const candles = extendDemoChart(row.candles as K[],series.get(row.asset) || [],Math.floor(Date.parse(row.entry_minute)/60000)*60,curMin);
    if (JSON.stringify(candles) === JSON.stringify(row.candles)) return;
    const {error}=await supabase.from('iq_demo_test_candidates').update({candles}).eq('entry_minute',row.entry_minute);
    if (error) console.error('Demo result candle write failed:',error.code);
  }));
  };
  const [demoHist,chartSamples,refRow,realHist,rejectedHist] = await Promise.all([demoHistPromise,chartPromise,refPromise,realHistPromise,rejectedHistPromise]);
  if (demoHist.error) console.error('Demo learning unavailable:',demoHist.error.code);
  if (realHist.error) console.error('Real IQ learning unavailable:',realHist.error.code);
  console.log('Rejected TEST outcomes in learning:',rejectedHist.length);
  const priorityRead = await scorePriorityPromise;
  if(priorityRead.error)console.error('Demo WIN score history unavailable: pattern authorization remains independent');
  const winScores=priorityRead.data?.winScores??new Set<number>();
  const winningCharts=await winningChartsPromise;
  console.log('Demo all-history winning chart references:',winningCharts.length);
  const priority=priorityRead.data?.priorities.map(row=>row.cents);
  if(priorityRead.data)console.log('Demo all-history WIN score references:',JSON.stringify({exact_scores:winScores.size,priorities:priorityRead.data.priorities}));
  // Learned gate: candidates whose strategy/hour/asset/chart history is strongly losing are dropped.
  const rejections: any[] = [];
  const reject = (c: DemoCandidate, reason: RejectionReason) => rejections.push({
    signal_id:c.signal_id,entry_minute:c.created_at,asset:c.asset,direction:c.direction,
    entry_strategy:c.entry_strategy,score:Number.isFinite(c._score)?c._score:null,
    reason_code:reason.code,reason_details:reason.details,rule_version:'displayed226-takashi-v10',
    candles:(series.get(c.asset)||[]).filter(k=>k.t<curMin).slice(-20),
  });
  const demoPool = [...rows,...demoPatterns].flatMap(c=>{
    const learn=combinedLearnedScore(demoHist.data||[],realHist.data||[],
      chartPatternAdjustment(chartSamples,chartFeatures(series.get(c.asset)||[],curMin,c.direction)),
      c.entry_strategy,c.asset,curMin*1000,rejectedHist);
    return[{...c,_score:demoFinalScore(c._score,learn,c.entry_strategy),_learned:learn}];});
  const demoEligible = demoPool.flatMap(c => {
    const cohort=demoCohort(c._score,c.entry_strategy);
    if(!cohort){
      if(c.entry_strategy===TAKASHI_STRATEGY){reject(c,{code:'takashi_demo_score',details:{score:Number.isFinite(c._score)?c._score:null,minimum:TAKASHI_DEMO_MIN_SCORE}});return[];}
      if(!demoDisplayedTargetScore(c._score)){reject(c,{code:'score_not_226',details:{score:c._score}});return[];}
      reject(c,{code:'strategy_not_226_allowed',details:{score:c._score,strategy:c.entry_strategy}});return[];
    }
    return [{...c,_cohort:cohort,_preferredPatternDistance:Infinity,_patternMatch:null}];
  });
  // User (Oct 25 2026 19:02 UTC): alternate Demo slots between Takashi and displayed-2.26 entries.
  const lastCandidate=await supabase.from('iq_demo_test_candidates').select('entry_strategy')
    .lt('entry_minute',new Date(curMin*1000).toISOString()).order('entry_minute',{ascending:false}).limit(1).maybeSingle();
  const preferred=preferredDemoCohort(lastCandidate.data?.entry_strategy);
  const demoWinner = demoEligible.sort((a,b)=>{
    const ranks=priority??[];
    const rank=(score:number)=>{const i=ranks.indexOf(Math.round(score*100));return i<0?ranks.length:i;};
    return Number(b._cohort===preferred)-Number(a._cohort===preferred)||rank(a._score)-rank(b._score)||b._score-a._score||a.signal_id.localeCompare(b.signal_id);
  })[0]??null;
  console.log('Demo alternation:',JSON.stringify({preferred,previous:lastCandidate.data?.entry_strategy??null}));
  console.log('Demo displayed 2.26 authorization:',JSON.stringify({eligible:demoEligible.filter(c=>demoDisplayedTargetScore(c._score)).length,selected:demoWinner?.signal_id??null}));
  for(const c of demoEligible){
    const reason:RejectionReason|null=demoWinner&&demoWinner.signal_id!==c.signal_id?{code:'minute_priority',details:{selected_signal:demoWinner.signal_id}}:null;
    if(reason)reject(c,reason);
  }
  // Audit is independent of execution: never delay an eligible entry for its rejected competitors.
  if(rejections.length){
    const auditTask=(async()=>{
      for(let i=0;i<rejections.length;i+=200){
        const {error}=await supabase.from('demo_selection_rejections').upsert(rejections.slice(i,i+200),{onConflict:'entry_minute,signal_id,rule_version',ignoreDuplicates:true});
        if(error){console.error('Demo rejection audit failed:',error.code);break;}
      }
    })().catch(()=>console.error('Demo rejection audit failed'));
    // @ts-ignore Hosted background runtime
    if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(auditTask);else await auditTask;
  }
  if (!demoWinner) console.log('Demo: no valid Takashi candidate this minute');
  if (demoWinner) {
    const {error} = await supabase.from('iq_demo_test_candidates').upsert({entry_minute:demoWinner.created_at,
      signal_id:demoWinner.signal_id,asset:demoWinner.asset,direction:demoWinner.direction,
      entry_strategy:demoWinner.entry_strategy,score:demoWinner._score,
      pattern_match:demoEligible.find(c=>c.signal_id===demoWinner.signal_id)?._patternMatch??null,
      candles:(series.get(demoWinner.asset)||[]).filter(k=>k.t<curMin).slice(-20)},{onConflict:'entry_minute',ignoreDuplicates:true});
    if (error) console.error('Demo candidate write failed:',error.code);
    else {
      console.log('Demo timing candidate persisted:', new Date().toISOString(), demoWinner.signal_id);
      console.log('Demo winning-score priority:', JSON.stringify({score:demoWinner._score,
        preferredPatternDistance:Number.isFinite(demoWinner._preferredPatternDistance)?demoWinner._preferredPatternDistance:null}));
      // Reserve exactly one minute before sending on the already authenticated PRACTICE socket.
      const setting = await amountRead;
      const amount = Number(setting.data?.amount ?? DEMO_TEST_AMOUNT);
      const found = Object.entries<any>(preparedActives).find(([,a])=>symbolOf(a.name || '')===demoWinner.asset);
      const order = !setting.error && found ? preparedDemoOrder(demoWinner,amount,preparedBalanceId,Number(found[0]),found[1],Date.now()) : null;
      const socket = preparedSocket as WebSocket | null;
      if(order && socket?.readyState===WebSocket.OPEN) {
        const reservation = await supabase.from('iq_demo_test_orders').insert({
          signal_id:demoWinner.signal_id,entry_minute:demoWinner.created_at,asset:demoWinner.asset,
          direction:demoWinner.direction,amount,entry_strategy:demoWinner.entry_strategy,
          expiration_time:new Date(order.expired*1000).toISOString(),account_type:'PRACTICE',
        }).select('id').single();
        const reserved = reservation.data?.id;
        if(reserved && !reservation.error) {
          const freshOrder = found ? preparedDemoOrder(demoWinner,amount,preparedBalanceId,Number(found[0]),found[1],Date.now()) : null;
          if(freshOrder && socket.readyState===WebSocket.OPEN) {
            let confirmed = false;
            let refused = false;
            await new Promise<void>(resolve=>{
              const timeout=setTimeout(resolve,5000);
              handleOrder = d=>{
                if(d.request_id!=='demo-prepared-order')return;
                if(d.name==='option' && /^\d+$/.test(String(d.msg?.id || ''))) {
                  confirmed=true;
                  ownExpiryMs=Number(freshOrder.expired)*1000;
                  console.log('Demo timing order confirmed:',new Date().toISOString(),demoWinner.signal_id);
                  demoSettlements.push(supabase.from('iq_demo_test_orders').update({status:'confirmed',iq_option_id:String(d.msg.id),created_at:new Date().toISOString()}).eq('id',reserved).then(({error})=>{if(error)console.error('Demo confirmation write failed:',error.code);}));
                  clearTimeout(timeout);resolve();
                } else if(['error','result'].includes(d.name)) {refused=true;clearTimeout(timeout);resolve();}
              };
              console.log('Demo timing order submitted:',new Date().toISOString(),demoWinner.signal_id);
              socket.send(JSON.stringify({name:'sendMessage',request_id:'demo-prepared-order',msg:{name:'binary-options.open-option',version:'1.0',body:freshOrder}}));
            });
            handleOrder=null;
            await Promise.all(demoSettlements);
            if(!confirmed)await supabase.from('iq_demo_test_orders').update({status:refused?'failed':'unknown',error:refused?'Broker refused demo order':'No broker confirmation; never retry ambiguous order'}).eq('id',reserved).eq('status','reserved');
          } else await supabase.from('iq_demo_test_orders').update({status:'failed',error:'Asset closed or candidate expired'}).eq('id',reserved).eq('status','reserved');
        }
      } else console.log('Demo prepared order skipped:',JSON.stringify({asset:demoWinner.asset,market:!!order,socketOpen:socket?.readyState===WebSocket.OPEN,settingError:!!setting.error}));
    }
  }
  // Keep checking expired outcomes after selection; never delay the next fresh order for history.
  await settlementWatch;
  await new Promise(resolve=>setTimeout(resolve,500));
  const ownSocket = preparedSocket as WebSocket | null;
  if(ownExpiryMs>Date.now() && ownSocket?.readyState===WebSocket.OPEN) {
    // Settle this run's own order on the same session right after it closes.
    pendingCutoffMs=ownExpiryMs;
    extendPrepared(ownExpiryMs+DEMO_OWN_WATCH_GRACE_MS);
    const ownWatch=watchDemoSettlements(ownExpiryMs,requestPending)
      .catch(error=>{console.error('Demo own settlement watch failed:',String(error));return 0;})
      .then(async()=>{await Promise.all(demoSettlements);closePrepared();});
    // @ts-ignore Hosted background runtime keeps the socket alive until the own result is read.
    if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(ownWatch);else await ownWatch;
  } else closePrepared();
  await Promise.all(demoSettlements);
  const chartTask=enrichCharts().catch(error=>console.error('Demo chart enrichment failed:',String(error)));
  // @ts-ignore Hosted background runtime: chart writes must not delay a fresh entry.
  if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(chartTask);else await chartTask;
  return Response.json({ success: true, assets: series.size, resolved, strategy: TAKASHI_BNF, selected: demoWinner?.signal_id ?? null, score: demoWinner?._score ?? null }, { headers: cors });
});
