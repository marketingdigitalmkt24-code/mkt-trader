// Modo TESTE com 7 estratégias (pedido 16/10/2026): roda a cada minuto em TODOS os ativos abertos da IQ Option.
// Nada abre na corretora. Cada entrada é registrada como TESTE na vela :00 com expiração de 1 minuto
// e resolvida pelas velas reais da IQ Option. Telegram: só o resultado WIN da Tendência (mesmo em teste).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { IQ_TELEGRAM_CHANNEL } from '../_shared/telegram-iq-alert.ts';
import { telegramTradingEnabled } from '../_shared/principal-pause.ts';
import { masterAutoTradingEnabled } from '../_shared/auto-trading-gate.ts';
import { nextReversalMinute } from '../_shared/four-win-reversal.ts';
import { closedTestResult, prioritizeResultAssets } from '../_shared/test-candle-result.ts';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { sendCandleRequestBatches } from '../_shared/candle-request-batches.ts';
import { matchesTrendSequence, TREND_SEQUENCE_TEST } from '../_shared/trend-sequence-test.ts';
import { forceFirstObservation, FORCE_FIRST_TEST } from '../_shared/force-first-test.ts';
import { TAKASHI_BNF } from '../_shared/takashi-kotegawa.ts';
import type { DemoCandidate } from '../_shared/demo-continuation.ts';
import { demoCohort, DEMO_ENTRY_STRATEGIES, TENDENCIA_ALINHADA_STRATEGY } from '../_shared/demo-226-policy.ts';
import { tendenciaForcaRecuoDirection, TENDENCIA_FORCA_RECUO_STRATEGY } from '../_shared/tendencia-forca-recuo.ts';
import { DEMO_PRINCIPAL_ENABLED, isSuperSelected } from '../_shared/demo-validated.ts';
import { demoForcaPadrao, FORCA_PADRAO } from '../_shared/forca-padrao.ts';
import { forcaAntecipada, FORCA_ANTECIPADA } from '../_shared/forca-antecipada.ts';
import { extendDemoChart } from '../_shared/demo-chart-snapshot.ts';
import { selectedDemoPrincipal } from '../_shared/selected-demo-principal.ts';
import { demoTargetMinute, demoCandleRequestTime, demoBoundaryDelay, DEMO_CANDLE_SEC, DEMO_ANALYSIS_SEC, isDemoEntryBoundary } from '../_shared/demo-timing.ts';
import { quedaWinCall, quedaWinRetry, QUEDA_WIN_CALL, QUEDA_WIN_RETRY } from '../_shared/queda-win-call.ts';
import { demoHistoryOutcome } from '../_shared/demo-history.ts';
import { demoBalance } from '../_shared/demo-balance.ts';
import { demoRejectionReason, type RejectionReason } from '../_shared/demo-rejection.ts';
import { DEMO_MID_CANDLE } from '../_shared/demo-mid-candle.ts';
import { preparedDemoOrder } from '../_shared/prepared-demo-order.ts';
import { DEMO_TEST_AMOUNT } from '../_shared/demo-test-policy.ts';
import { watchDemoSettlements } from '../_shared/demo-settlement-watch.ts';
import { readBrokerSession, saveBrokerSession, clearBrokerSession } from '../_shared/broker-session-cache.ts';
import { prepareDemoAuthentication, demoSocketAuthMessage, demoSocketAuthenticationRejected, demoHttpRefreshBudget } from '../_shared/demo-broker-auth.ts';
import { prepareDemoConnection } from '../_shared/demo-connection-retry.ts';
import { selectDemoByRotation } from '../_shared/demo-profit-selection.ts';
import { demoExtraConfirmations } from '../_shared/demo-extra-confirmations.ts';
import { demoRecovery, demoRecoveryPredecessor } from '../_shared/demo-recovery.ts';
import { DEMO_SCAN_BUCKET, DEMO_LAST_ANALYSIS, demoScanSlot, type DemoScanStatus, type DemoAssetAnalysis } from '../_shared/demo-scan-status.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const AUTH_URLS = ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login', 'https://iqoption.com/api/v2/login'];
const LOGIN_HOST_MS = 8000;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const OPEN = 'test7_open';
const DEMO_OWN_WATCH_GRACE_MS = 22000;
type K = { t: number; o: number; c: number; h: number; l: number; v?: number };

export const LABELS: Record<string, string> = {
  TENDENCIA: 'Tendência', REVERSAO_RSI: 'Reversão RSI', VELA_FORCA: 'Vela de força', ROMPIMENTO: 'Rompimento',
  RECUO_EMA21: 'Recuo na média 21', KDJ: 'KDJ', ICHIMOKU: 'Ichimoku',
  [FORCE_FIRST_TEST]: 'Força sem rompimento · primeira vela (TESTE)',
  [TAKASHI_BNF]: 'Takashi Kotegawa',
};

async function login(email: string, password: string, timeoutMs = 10000, attemptNumber = 1): Promise<string | null> {
  // Slow-but-valid answers take 3-8s; cap each host so one hung host cannot eat the budget,
  // and rotate the starting host per attempt (the balance function succeeds this way).
  const deadline = Date.now() + timeoutMs;
  const shift = (attemptNumber - 1) % AUTH_URLS.length;
  const hosts = [...AUTH_URLS.slice(shift), ...AUTH_URLS.slice(0, shift)];
  for (const u of hosts) {
    const left = Math.min(LOGIN_HOST_MS, deadline - Date.now());
    if (left < 1000) break;
    // Fresh connection per attempt: a warm worker can keep a wedged pooled (HTTP/2, coalesced
    // across the three hosts) connection that hangs every login while other functions succeed.
    // @ts-ignore Deno runtime API; plain fetch when unavailable.
    const client = typeof Deno !== 'undefined' && typeof Deno.createHttpClient === 'function'
      // @ts-ignore Deno runtime API
      ? (() => { try { return Deno.createHttpClient({ http2: false, poolMaxIdlePerHost: 0 }); } catch { return null; } })() : null;
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': BROWSER_UA, Accept: 'application/json', Connection: 'close' }, body: new URLSearchParams({ identifier: email, password }), signal: AbortSignal.timeout(left), ...(client ? { client } : {}) } as RequestInit);
      const d = await r.json().catch(() => ({}));
      if (d.code === 'success' && d.ssid) return d.ssid;
      console.warn('Demo login refused:', { host: new URL(u).host, status: r.status, code: d?.code ?? null });
    } catch (e) { console.warn('Demo login error:', new URL(u).host, e instanceof Error ? e.name : 'unknown', client ? 'fresh-client' : 'pooled'); }
    finally { try { client?.close(); } catch { /* already closed */ } }
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
  // Avisos de Telegram seguem o seletor Auto Trading do admin.
  const supaUrl = Deno.env.get('SUPABASE_URL'), supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const autoTradingOn = supaUrl && supaKey ? await masterAutoTradingEnabled(createClient(supaUrl, supaKey)) : false;
  if (!telegramTradingEnabled(undefined, autoTradingOn)) return;
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
  // Bounded private telemetry, not candidates or trade history. Never blocks execution.
  let statusWrites: Promise<void> = Promise.resolve();
  const reportScan = (phase: DemoScanStatus['phase'], assets = 0, selected_signal: string | null = null, error_code: string | null = null, asset_analyses?: DemoAssetAnalysis[]) => {
    const snapshot: DemoScanStatus = {target_minute:new Date(targetMs).toISOString(),observed_at:new Date().toISOString(),phase,assets,selected_signal,error_code,asset_analyses};
    statusWrites=statusWrites.then(async()=>{
      const {error}=await supabase.storage.from(DEMO_SCAN_BUCKET).upload(demoScanSlot(targetMs),JSON.stringify(snapshot),{upsert:true,contentType:'application/json'});
      if(error)console.warn('Demo scan status write unavailable');
      if(phase==='completed' && asset_analyses){
        const saved=await supabase.storage.from(DEMO_SCAN_BUCKET).upload(DEMO_LAST_ANALYSIS,JSON.stringify(snapshot),{upsert:true,contentType:'application/json'});
        if(saved.error)console.warn('Demo last analysis write unavailable');
      }
    }).catch(()=>{console.warn('Demo scan status write unavailable');});
    // @ts-ignore Hosted background runtime
    if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(statusWrites);
  };
  reportScan('preparing');
  // Moves to this run's own order expiry when it keeps watching after placement.
  let pendingCutoffMs = targetMs;
  const readPendingDemo = () => supabase.from('iq_demo_test_orders')
    .select('id,signal_id,entry_strategy,entry_minute,result,profit,asset,direction,status,account_type,iq_option_id,settled_at')
    .eq('status','confirmed').not('iq_option_id','is',null)
    .in('account_type',['PRACTICE','REAL']).eq('result','pending')
    .lte('expiration_time',new Date(pendingCutoffMs).toISOString())
    .order('entry_minute').limit(1000).then(r=>r);
  const previousDemoRead = readPendingDemo();
  const amountRead = supabase.from('iq_demo_test_settings').select('amount,account_type,pattern_min_movement_pct').eq('id',1).maybeSingle().then(r=>r);
  console.log('Demo timing prepare:', new Date().toISOString(), 'target:', new Date(targetMs).toISOString());
  // Start login as soon as the master read finishes, while expired rows are still loading.
  const masterLogin = readMasterIQConfig(supabase).then(async ({ data: cfg }) => {
    // Do not spend the entire minute retrying an unavailable HTTP gateway.
    // Direct WebSocket auth uses this same resolved master and invocation only.
    if(!cfg)return {cfg,auth:null,cached:false};
    // Reuse the last valid master session: the broker throttles per-minute HTTP logins.
    const cachedSsid=await readBrokerSession(supabase,cfg.id);
    if(cachedSsid)return {cfg,auth:{mode:'ssid' as const,ssid:cachedSsid},cached:true};
    const auth=await prepareDemoAuthentication(cfg,async(ms,n)=>{
      const ssid=await login(cfg.email,cfg.password,ms,n);
      if(ssid)await saveBrokerSession(supabase,cfg.id,ssid);
      return ssid;
    },targetMs);
    return {cfg,auth,cached:false};
  });
  const [{ cfg, auth, cached: authFromCache }, { data: open }] = await Promise.all([
    masterLogin,
    supabase.from('operation_results').select('id, asset, direction, entry_strategy, created_at, telegram_sent')
      .eq('result', OPEN).lte('expiration_time', new Date(targetMs).toISOString()).limit(1000),
  ]);
  if (!cfg) { reportScan('unavailable',0,null,'no_config'); return Response.json({ success: false, error: 'no config' }, { headers: cors }); }
  if (!auth) {
    reportScan('unavailable',0,null,'login_failed');
    console.error('Demo scan unavailable: broker login failed; next scheduled minute retries');
    return Response.json({ success: false, error: 'login failed' }, { headers: cors });
  }
  let nowSec = Math.floor(Date.now() / 1000);
  const curMin = targetMs / 1000;
  console.log('Demo timing authentication prepared:',new Date().toISOString(),'method:',auth.mode,authFromCache?'cached':'fresh');

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
  let selectedDemoAccount: 'PRACTICE'|'REAL' = 'PRACTICE';
  let preparedBalanceId = 0;
  let preparedBalanceAmount = 0;
  let preparedActives: Record<string, any> = {};
  let closePrepared = () => {};
  let handleOrder: ((message: any) => void) | null = null;
  let settlementWatch: Promise<number> = Promise.resolve(0);
  let requestPending: () => Promise<boolean> = async () => false;
  let extendPrepared: (untilMs: number) => void = () => {};
  let ownExpiryMs = 0;
  let socketAuth = auth;
  let cachedRefused = false;
  let socketAttempts = 0;
  const connectionReady = await prepareDemoConnection(async (endpoint, handshakeMs) => {
    // A refused cached session gets one immediate HTTP login instead of waiting for the refresh slot.
    const staleBudget=cachedRefused?Math.min(10000,targetMs-3000-8000-Date.now()):0;
    const refreshBudget=staleBudget>=1000?staleBudget:demoHttpRefreshBudget(socketAttempts,targetMs,Date.now());
    cachedRefused=false;
    if(refreshBudget>=1000){
      const refreshed=await login(cfg.email,cfg.password,refreshBudget,2+Math.floor(socketAttempts/2));
      if(refreshed){socketAuth={mode:'ssid',ssid:refreshed};await saveBrokerSession(supabase,cfg.id,refreshed);console.log('Demo authentication recovered by HTTP refresh');}
    }
    socketAttempts++;
    const remaining=targetMs-3000-Date.now();
    if(remaining<1000)return false;
    return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(endpoint);
    preparedSocket = ws;
    let pending = 0; const byReq = new Map<string, string>();
    let demoBalanceId = 0, candleDone = false;
    let historyAttempt=0;
    const historyResponses=new Set<string>();
    let demoHistoryTimer: ReturnType<typeof setTimeout> | undefined;
    let completed = false;
    const finish = () => {
      if(demoHistoryTimer)clearTimeout(demoHistoryTimer);
      if (!completed) { completed = true; resolve(candleDone); }
    };
    closePrepared = () => { clearTimeout(timer); clearTimeout(handshakeTimer); if(boundaryTimer)clearTimeout(boundaryTimer); if(demoHistoryTimer)clearTimeout(demoHistoryTimer); try{ws.close();}catch{} };
    const finishCandles = () => { candleDone=true; finish(); };
    let timer = setTimeout(() => { finish(); closePrepared(); }, Math.max(0, targetMs - Date.now()) + 30000);
    // Keep this authenticated socket alive past its own order expiry, so the result
    // does not depend on the next minute's broker login succeeding.
    extendPrepared = (untilMs: number) => { clearTimeout(timer); timer = setTimeout(() => { finish(); closePrepared(); }, Math.max(0, untilMs - Date.now())); };
    let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
    let initialized = false;
    const handshakeTimer = setTimeout(() => {
      console.warn('Demo socket preparation timeout; trying alternate endpoint');
      finish(); closePrepared();
    }, Math.min(handshakeMs,remaining));
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
    ws.onopen = () => ws.send(JSON.stringify(demoSocketAuthMessage(socketAuth)));
    ws.onerror = () => { finish(); closePrepared(); };
    ws.onclose = () => { finish(); closePrepared(); };
    ws.onmessage = async (ev) => {
      let d;
      try { d = JSON.parse(ev.data); } catch { return; }
      if(demoSocketAuthenticationRejected(d)) {
        console.warn('Demo socket authentication refused; trying alternate endpoint');
        if(socketAuth.mode==='ssid'){cachedRefused=true;void clearBrokerSession(supabase,cfg.id,socketAuth.ssid);}
        finish();closePrepared();return;
      }
      if(d.name==='authenticated') {
        if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({name:'sendMessage',msg:{name:'get-profile',version:'1.0',body:{}}}));
        return;
      }
      handleOrder?.(d);
      if (d.name === 'heartbeat' && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ name: 'heartbeat', msg: { userTime: Date.now(), heartbeatTime: d.msg } }));
      }
      if (d.name === 'profile') {
        {const demoAcct=(await amountRead).data?.account_type==='REAL'?'REAL':'PRACTICE';selectedDemoAccount=demoAcct;demoBalanceId = demoBalance(d.msg?.balances || [], demoAcct)?.id || 0;}
        if(!demoBalanceId){console.warn('Demo profile has no verified PRACTICE USD balance');finish();closePrepared();return;}
        preparedBalanceId = demoBalanceId;
        preparedBalanceAmount = Number((d.msg?.balances || []).find((b: any) => b.id === demoBalanceId)?.amount) || 0;
        // Re-read at :01 so this minute's confirmation is not missed by preflight.
        // Connection is already authenticated; only fresh closed candles are requested at :00.
        console.log('Demo timing broker ready:', new Date().toISOString());
        requestInitialization();
      }
      if (d.name === 'initialization-data' && !initialized) {
        initialized = true;
        clearTimeout(handshakeTimer);
        settlementWatch=watchDemoSettlements(targetMs,requestPendingHistory)
          .catch(error=>{console.error('Demo settlement watch failed:',String(error));return 0;});
        preparedActives = d.msg?.turbo?.actives || {};
        const requestCandles = async () => {
        const requestTime = demoCandleRequestTime(Date.now(), targetMs);
        if (requestTime === null) { clearTimeout(timer); finish(); return; }
        nowSec = requestTime;
        console.log('Demo timing candles requested:', new Date().toISOString());
        reportScan('scanning');
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
          ws.send(JSON.stringify({ name: 'sendMessage', request_id: rid, msg: { name: 'get-candles', version: '2.0', body: { active_id: id, size: DEMO_ANALYSIS_SEC, to: nowSec, count: 101 } } }));
        });
        };
        const delay = demoBoundaryDelay(Date.now(), targetMs);
        if (delay > 0) boundaryTimer = setTimeout(() => { void requestCandles(); }, delay);
        else await requestCandles();
      }
      if (d.name === 'candles' && byReq.has(d.request_id)) {
        const s = byReq.get(d.request_id); byReq.delete(d.request_id);
        if (!s) return;
        series.set(s, (d.msg?.candles || []).map((c: any) => ({ t: c.from, o: c.open, c: c.close, h: c.max, l: c.min, v: Number.isFinite(c.volume) ? c.volume : undefined }))
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
  }, targetMs);
  if (!connectionReady) {
    reportScan('unavailable',0,null,'connection_failed');
    closePrepared();
    console.error('Demo scan unavailable: socket preparation failed; no stale entry submitted');
    return Response.json({ success: false, error: 'broker connection unavailable' }, { headers: cors });
  }

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
  const demoPatterns: DemoCandidate[] = [];
  const assetAnalyses = new Map<string, DemoAssetAnalysis>();
  const confluenceGates: Record<string, number> = {};
  for (const [asset, cs] of series) {
    const prior=cs.filter(k=>k.t<curMin).slice(-60);
    const complete=prior.length===60 && prior.every((k,i)=>k.t===curMin-(60-i)*DEMO_ANALYSIS_SEC
      && [k.t,k.o,k.c,k.h,k.l].every(Number.isFinite) && k.o>0 && k.c>0
      && k.h>=Math.max(k.o,k.c) && k.l<=Math.min(k.o,k.c));
    assetAnalyses.set(asset,{asset,direction:null,score:null,state:complete?'no_signal':'incomplete_candles'});
    // Each minute slot analyzes the latest closed 5-second bars; settlement stays independent.
    if (!isDemoEntryBoundary(targetMs)) continue;
    const closed = cs.filter(k => k.t + DEMO_ANALYSIS_SEC <= curMin);
    if (!closed.length || closed[closed.length - 1].t !== curMin - DEMO_ANALYSIS_SEC) continue;
    // Reuse the established aligned trend: EMA9/21 + SMA50, MACD and RSI on closed analysis bars.
    const fired = detect(cs.slice(-90).filter(k => k.t + DEMO_ANALYSIS_SEC <= curMin));
    const options: [string, string, 'CALL' | 'PUT' | null][] = [
      [TENDENCIA_ALINHADA_STRATEGY, 'demo-tendencia-alinhada-v1', (fired.find(([strategy]) => strategy === 'TENDENCIA')?.[1] as any) ?? null],
      [TENDENCIA_FORCA_RECUO_STRATEGY, 'demo-tendencia-forca-recuo-v1', tendenciaForcaRecuoDirection(fired)],
    ];
    for (const [strategy, prefix, direction] of options) {
      if (!direction) continue;
      const why = demoExtraConfirmations(closed, direction);
      if (why) {
        confluenceGates[`${strategy}_extra_${why}`] = (confluenceGates[`${strategy}_extra_${why}`] || 0) + 1;
        continue;
      }
      demoPatterns.push({
        signal_id: `${prefix}-${asset}-${curMin}`, asset, direction,
        entry_strategy: strategy,
        created_at: new Date(curMin * 1000).toISOString(), _score: Number.NaN,
      });
    }
  }
  console.log('Aligned trend confirmation gates:', JSON.stringify(confluenceGates));
  let inserted = 0;
  // Separate service ledger: new Demo patterns never enter principal TEST history/claims.
  // Display-only enrichment: retain the result and following closed candle.
  // Retry recent snapshots so a missed runner minute cannot strand the chart.
  const enrichCharts = async () => {
  const recentDemo = await supabase.from('iq_demo_test_candidates').select('entry_minute,signal_id,asset,candles')
    .gte('entry_minute',new Date((curMin-90*60)*1000).toISOString())
    .lt('entry_minute',new Date(curMin*1000).toISOString());
  await Promise.all((recentDemo.data || []).map(async row => {
    if (!Array.isArray(row.candles)) return;
    const candles = extendDemoChart(row.candles as K[],series.get(row.asset) || [],Math.floor(Date.parse(row.entry_minute)/60000)*60,curMin);
    if (JSON.stringify(candles) === JSON.stringify(row.candles)) return;
    const {error}=await supabase.from('iq_demo_test_candidates').update({candles}).eq('signal_id',row.signal_id);
    if (error) console.error('Demo result candle write failed:',error.code);
  }));
  };
  // No historical note analysis participates in candidate selection.
  const rejections: any[] = [];
  const reject = (c: DemoCandidate, reason: RejectionReason) => rejections.push({
    signal_id:c.signal_id,entry_minute:c.created_at,asset:c.asset,direction:c.direction,
    entry_strategy:c.entry_strategy,score:null,
    reason_code:reason.code,reason_details:reason.details,rule_version:'demo-s5-aligned-tfr-v28',
    candles:(series.get(c.asset)||[]).filter(k=>k.t<curMin).slice(-20),
  });
  const demoPool = demoPatterns;
  const demoEligible = demoPool.flatMap(c => {
    assetAnalyses.set(c.asset,{asset:c.asset,direction:c.direction,score:null,state:'eligible'});
    const cohort=demoCohort(undefined,c.entry_strategy);
    if(!cohort){
      reject(c,{code:'strategy_not_enabled',details:{strategy:c.entry_strategy}});
      return [];
    }
    const market = Object.entries<any>(preparedActives).find(([, a]) => symbolOf(a.name || '') === c.asset);
    if (!market || !preparedDemoOrder(c, DEMO_TEST_AMOUNT, preparedBalanceId, Number(market[0]), market[1], Date.now())) {
      const analysis=assetAnalyses.get(c.asset);
      if(analysis)analysis.state='market_unavailable';
      reject(c,{code:'market_unavailable',details:{asset:c.asset}});
      return [];
    }
    // Preserve market availability and strategy rules; no note eligibility gate.
    const commission = market[1]?.option?.profit?.commission;
    const _payout = typeof commission === 'number' ? (100-commission)/100 : null;
    return [{...c,_cohort:cohort,_preferredPatternDistance:Infinity,_patternMatch:null,_payout}];
  });
  // Single active strategy; stable IDs break asset ties without notes or historical ranking.
  // Each real-time card competes for its own minute slot: one winner per strategy.
  const demoWinners = [TENDENCIA_ALINHADA_STRATEGY, TENDENCIA_FORCA_RECUO_STRATEGY]
    .map(s => selectDemoByRotation(demoEligible.filter(c => c.entry_strategy === s), null))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const demoWinner = demoWinners[0] ?? null;
  reportScan(series.size ? 'completed' : 'unavailable',series.size,demoWinner?.signal_id??null,series.size ? null : 'no_candles',[...assetAnalyses.values()]);
  console.log('Demo rotation selection:',JSON.stringify({eligible:demoEligible.length,selected:demoWinners.map(w=>w.signal_id),scoreAnalysis:false}));
  for(const c of demoEligible){
    const own=demoWinners.find(w=>w.entry_strategy===c.entry_strategy);
    const reason:RejectionReason|null=own&&own.signal_id!==c.signal_id?{code:'minute_priority',details:{selected_signal:own.signal_id}}:null;
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
  if (!demoWinner) console.log('Demo: no valid candidate in this minute with 5-second analysis');
  let principalTriggered = false;
  for (const demoWinner of demoWinners) {
    const {error} = await supabase.from('iq_demo_test_candidates').upsert({entry_minute:demoWinner.created_at,
      signal_id:demoWinner.signal_id,asset:demoWinner.asset,direction:demoWinner.direction,
      // Required legacy column: neutral placeholder, never calculated or used for selection.
      entry_strategy:demoWinner.entry_strategy,score:0,
      pattern_match:demoEligible.find(c=>c.signal_id===demoWinner.signal_id)?._patternMatch??null,
      candles:(series.get(demoWinner.asset)||[]).filter(k=>k.t<curMin).slice(-20)},{onConflict:'entry_minute,entry_strategy',ignoreDuplicates:true});
    if (error) console.error('Demo candidate write failed:',error.code);
    else {
      console.log('Demo timing candidate persisted:', new Date().toISOString(), demoWinner.signal_id);
      console.log('Demo current-analysis selection:', JSON.stringify({scoreAnalysis:false}));
      // Reserve exactly one minute before sending on the already authenticated PRACTICE socket.
      const setting = await amountRead;
      const base = Number(setting.data?.amount ?? DEMO_TEST_AMOUNT);
      const found = Object.entries<any>(preparedActives).find(([,a])=>symbolOf(a.name || '')===demoWinner.asset);
      const commission = found?.[1]?.option?.profit?.commission;
      const payout = typeof commission === 'number' ? (100-commission)/100 : null;
      const last = await supabase.from('iq_demo_test_orders')
        .select('status,result,entry_strategy,account_type,iq_option_id,amount,profit,recovery_level,recovery_loss,recovery_base,expiration_time,entry_minute')
        .eq('entry_strategy',demoWinner.entry_strategy).in('account_type',['PRACTICE','REAL'])
        .in('status',['confirmed','unknown','reserved'])
        .or(`status.eq.confirmed,iq_option_id.not.is.null,expiration_time.gt.${new Date().toISOString()}`)
        .order('entry_minute',{ascending:false}).limit(1);
      const recovery = !last.error ? demoRecovery(demoRecoveryPredecessor(last.data || [], Date.now()),base,payout) : null;
      const amount = recovery?.amount ?? 0;
      console.log('Demo gale:',JSON.stringify({recovery,lastError:!!last.error}));
      // Principal "Após 5 LOSS" (user, Nov 3 2026): the previous confirmed Demo order lost at gale level 4,
      // i.e. 5 consecutive LOSS. The executor re-reads the streak and the claim revalidates it, Auto Trading and limits.
      const prevOrder=(last.data||[])[0];
      // Also "Sequência de 3 sinais": the executor re-reads the 3 latest confirmed orders and the claim revalidates the user sets.
      if(!principalTriggered&&prevOrder?.status==='confirmed'&&((prevOrder?.result==='loss'&&Number(prevOrder?.recovery_level)===4)||['RECUO_EMA21','ICHIMOKU_RECUO21'].includes(prevOrder?.entry_strategy))){
        principalTriggered = true;
        const followTask = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/selected-demo-trend`, {
          method:'POST', headers:{Authorization:`Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,'Content-Type':'application/json'},
          body:JSON.stringify({candidate:demoWinner.signal_id}), signal:AbortSignal.timeout(100000),
        }).then(async r=>console.log('After 4 LOSS principal:',r.status,(await r.text()).slice(0,200)))
          .catch(e=>console.error('After 4 LOSS principal failed:',String(e)));
        // @ts-ignore Hosted background runtime
        if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(followTask);
      }
      const order = !setting.error && recovery && amount <= preparedBalanceAmount && found ? preparedDemoOrder(demoWinner,amount,preparedBalanceId,Number(found[0]),found[1],Date.now()) : null;
      const socket = preparedSocket as WebSocket | null;
      if(order && socket?.readyState===WebSocket.OPEN) {
        const reservation = await supabase.from('iq_demo_test_orders').insert({
          signal_id:demoWinner.signal_id,entry_minute:demoWinner.created_at,asset:demoWinner.asset,
          direction:demoWinner.direction,amount,entry_strategy:demoWinner.entry_strategy,
          recovery_level:recovery?.recovery_level,recovery_loss:recovery?.recovery_loss,
          recovery_base:recovery?.recovery_base,recovery_payout:recovery?.recovery_payout,
          expiration_time:new Date(order.expired*1000).toISOString(),account_type:selectedDemoAccount,
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
                if(d.request_id!==`demo-prepared-order-${demoWinner.entry_strategy}`)return;
                if(d.name==='option' && /^\d+$/.test(String(d.msg?.id || ''))) {
                  confirmed=true;
                  ownExpiryMs=Number(freshOrder.expired)*1000;
                  console.log('Demo timing order confirmed:',new Date().toISOString(),demoWinner.signal_id);
                  demoSettlements.push(supabase.from('iq_demo_test_orders').update({status:'confirmed',iq_option_id:String(d.msg.id),created_at:new Date().toISOString()}).eq('id',reserved).then(({error})=>{if(error)console.error('Demo confirmation write failed:',error.code);}));
                  clearTimeout(timeout);resolve();
                } else if(['error','result'].includes(d.name)) {refused=true;clearTimeout(timeout);resolve();}
              };
              console.log('Demo timing order submitted:',new Date().toISOString(),demoWinner.signal_id);
              socket.send(JSON.stringify({name:'sendMessage',request_id:`demo-prepared-order-${demoWinner.entry_strategy}`,msg:{name:'binary-options.open-option',version:'1.0',body:freshOrder}}));
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
  // 5-minute orders settle in the later minute runs; keep the socket only for short remaining expiries.
  if(ownExpiryMs>Date.now() && ownExpiryMs-Date.now()<=70000 && ownSocket?.readyState===WebSocket.OPEN) {
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
  return Response.json({ success: true, assets: series.size, resolved, strategy: TENDENCIA_ALINHADA_STRATEGY, selected: demoWinner?.signal_id ?? null, score: null }, { headers: cors });
});
