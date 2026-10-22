import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { iqMarketOpen } from '../_shared/iq-market-open.ts';
import { sendIQAlert, IQ_TELEGRAM_CHANNEL } from '../_shared/telegram-iq-alert.ts';
import { threeTrendLosses, freshTrendPut, notifyTrendPut, TREND_THREE_LOSS_LABEL, TREND_THREE_LOSS_PUT } from '../_shared/trend-three-loss-put.ts';

const schema = z.object({ candidate: z.string().startsWith('t7-').max(255) }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
const symbolOf = (raw: string) => {
  let name = raw.toUpperCase().replace(/^FRONT\./, '');
  const otc = name.endsWith('-OTC');
  name = name.replace(/-OTC$/, '').replace(/-OP$/, '');
  if (/^[A-Z]{6}$/.test(name)) name = `${name.slice(0, 3)}/${name.slice(3)}`;
  return otc ? `${name}-OTC` : name;
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply({});
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Service unavailable' }, 503);
  const db = createClient(url, key);
  let claimed: { signalId: string; asset: string; amount: number; entryAt: number; configId: string } | null = null;
  let submitted = false;
  const leaseScope = 'master:tendencia_3_loss_put';
  try {
    if (req.headers.get('Authorization') !== `Bearer ${key}`) {
      const supplied = req.headers.get('x-scheduler-token');
      if (!supplied) return reply({ error: 'Unauthorized' }, 401);
      const { data } = await db.from('anticipation_scheduler_auth').select('token').eq('id', 1).maybeSingle();
      if (!data?.token || supplied !== data.token) return reply({ error: 'Unauthorized' }, 401);
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: 'Invalid candidate' }, 400);
    const { data: candidate, error: candidateError } = await db.from('operation_results')
      .select('signal_id,asset,created_at,result').eq('signal_id', parsed.data.candidate).eq('timeframe', 'TEST').maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidate || candidate.result !== 'test7_open') return reply({ skipped: 'No fresh selected signal' });
    const entryAt = Date.parse(candidate.created_at);
    if (!freshTrendPut(entryAt, Date.now())) return reply({ skipped: 'Entry window closed' });
    const { data: history, error: historyError } = await db.from('operation_results')
      .select('signal_id,entry_strategy,result,created_at').eq('timeframe', 'TEST').like('signal_id', 't7-%')
      .gte('created_at', new Date(entryAt - 180000).toISOString()).lt('created_at', candidate.created_at).limit(10);
    if (historyError) throw historyError;
    if (!threeTrendLosses(history || [], entryAt)) return reply({ skipped: 'Three closed consecutive Trend losses required' });
    const { data: cfg } = await readMasterIQConfig(db);
    if (!cfg || !cfg.last_connected_at || !['PRACTICE', 'REAL'].includes(cfg.account_type)) return reply({ skipped: 'Principal connection unavailable' });
    let ssid: string | null = null;
    for (const endpoint of ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login']) {
      if (!freshTrendPut(entryAt, Date.now())) break;
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
          body: new URLSearchParams({ identifier: cfg.email, password: cfg.password }), signal: AbortSignal.timeout(6000) });
        const data = await response.json();
        if (data.code === 'success' && typeof data.ssid === 'string') { ssid = data.ssid; break; }
      } catch { /* bounded alternate login; never expose credentials */ }
    }
    if (!ssid || !freshTrendPut(entryAt, Date.now())) return reply({ skipped: 'Broker session or entry window unavailable' });
    // Resolve account + exact open M1 instrument before the atomic claim. No digital/forex fallback.
    const outcome = await new Promise<{ success: boolean; tradeId?: string; error?: string }>(resolve => {
      const ws = new WebSocket('wss://iqoption.com/echo/websocket');
      let balanceId: number | null = null, initialized = false, done = false;
      const finish = (result: { success: boolean; tradeId?: string; error?: string }) => {
        if (done) return;
        done = true; clearTimeout(timer); ws.close(); resolve(result);
      };
      const timer = setTimeout(() => finish({ success: false, error: submitted ? 'Broker confirmation unknown' : 'Entry window unavailable; no order sent' }),
        Math.max(1, Math.min(20000, entryAt + 30000 - Date.now())));
      ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
      ws.onerror = () => finish({ success: false, error: submitted ? 'Broker confirmation unknown' : 'Broker connection unavailable; no order sent' });
      ws.onmessage = async event => {
        try {
          const data = JSON.parse(event.data);
          if (data.name === 'profile') {
            const type = cfg.account_type === 'REAL' ? 1 : 4;
            const balance = (data.msg?.balances || []).find((b: { type: number; id: number }) => b.type === type);
            if (!Number.isSafeInteger(balance?.id)) { finish({ success: false, error: 'Configured account unavailable; no order sent' }); return; }
            balanceId = balance.id;
            ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
          }
          if (data.name === 'initialization-data' && !initialized) {
            initialized = true;
            const instrument = Object.entries(data.msg?.turbo?.actives || {}).find(([, value]) => {
              const market = value as Parameters<typeof iqMarketOpen>[0];
              return market.name && symbolOf(market.name) === candidate.asset
                && iqMarketOpen(market, Math.floor(Date.now() / 1000), entryAt / 1000 + 60);
            });
            if (!instrument || balanceId === null || !freshTrendPut(entryAt, Date.now())) {
              finish({ success: false, error: 'Open M1 asset or entry window unavailable; no order sent' }); return;
            }
            const activeId = Number(instrument[0]);
            if (!Number.isSafeInteger(activeId) || activeId <= 0) { finish({ success: false, error: 'Invalid instrument; no order sent' }); return; }
            const { data: order, error } = await db.rpc('claim_trend_three_loss_put', { p_candidate: candidate.signal_id });
            if (error) throw error;
            if (!order) { finish({ success: false, error: 'Sequence, limits or reservation rejected; no order sent' }); return; }
            claimed = order;
            if (order.configId !== cfg.id || !freshTrendPut(order.entryAt, Date.now()) || done) {
              finish({ success: false, error: 'Configuration changed or entry window closed; no order sent' }); return;
            }
            const { data: lease, error: leaseError } = await db.from('trade_queue').update({ error: 'placement_claimed' })
              .eq('signal_id', order.signalId).eq('entry_strategy', TREND_THREE_LOSS_PUT).eq('status', 'executing').is('error', null).select('id');
            if (leaseError) throw leaseError;
            if (!lease?.length || done || !freshTrendPut(order.entryAt, Date.now())) {
              finish({ success: false, error: 'Placement lease rejected; no order sent' }); return;
            }
            const { error: reserveError } = await db.from('iq_entry_leases').update({ reserved_until: 'infinity' })
              .eq('scope', leaseScope).eq('signal_id', order.signalId);
            if (reserveError) throw reserveError;
            if (done || !freshTrendPut(entryAt, Date.now())) { finish({ success: false, error: 'Entry window closed; no order sent' }); return; }
            submitted = true;
            ws.send(JSON.stringify({ name: 'sendMessage', request_id: 'trend-put', msg: { name: 'binary-options.open-option', version: '1.0', body: {
              user_balance_id: balanceId, active_id: activeId, option_type_id: 3, direction: 'put',
              expired: entryAt / 1000 + 60, price: order.amount, profit_percent: 0,
            } } }));
          }
          if (submitted && ['binary-options.option-opened', 'option'].includes(data.name)) {
            const id = String(data.msg?.id || data.msg?.option_id || '');
            if (/^\d+$/.test(id)) finish({ success: true, tradeId: id });
          }
          if (submitted && (data.name === 'error' || (data.name === 'binary-options.open-option' && (data.msg?.result === 'error' || data.msg?.message)))) {
            finish({ success: false, error: `Broker refusal: ${JSON.stringify(data.msg)}` });
          }
        } catch (error) { finish({ success: false, error: submitted ? 'Broker confirmation unknown' : `Preparation failed; no order sent: ${String(error)}` }); }
      };
    });
    // The async websocket handler sets this; read persisted queue by candidate-derived ID after completion.
    const signalId = `tendencia_3_loss_put-`;
    const { data: queued } = await db.from('trade_queue').select('signal_id,amount')
      .eq('entry_strategy', TREND_THREE_LOSS_PUT).eq('asset', candidate.asset)
      .gte('created_at', candidate.created_at).like('signal_id', `${signalId}%`).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!queued) return reply({ skipped: outcome.error || 'No authorized order' });
    if (!outcome.success || !outcome.tradeId) {
      console.error('Trend PUT failed:', outcome.error);
      await db.from('trade_queue').update({ status: 'failed', error: outcome.error || 'Broker confirmation unknown' }).eq('signal_id', queued.signal_id);
      if (!submitted || outcome.error?.startsWith('Broker refusal:')) await db.from('iq_entry_leases')
        .update({ reserved_until: new Date().toISOString() }).eq('scope', leaseScope).eq('signal_id', queued.signal_id);
      return reply({ success: false, error: outcome.error });
    }
    const { error: saveError } = await db.from('operation_results').insert({
      signal_id: queued.signal_id, asset: candidate.asset, direction: 'PUT', entry_price: Number(queued.amount), result: 'pending', profit: 0,
      iq_option_id: outcome.tradeId, is_auto_trade: true, is_ai_analyzed: false, entry_strategy: TREND_THREE_LOSS_PUT,
      timeframe: 'M1', created_at: new Date().toISOString(), expiration_time: new Date(entryAt + 60000).toISOString(),
    });
    if (saveError) throw saveError;
    await db.from('trade_queue').update({ status: 'executed', iq_option_id: outcome.tradeId, executed_at: new Date().toISOString(), error: null }).eq('signal_id', queued.signal_id);
    await db.from('iq_entry_leases').update({ reserved_until: new Date().toISOString() }).eq('scope', leaseScope).eq('signal_id', queued.signal_id);
    const background = async () => {
      if (notifyTrendPut(outcome, entryAt, Date.now())) {
        try {
          const messageId = await sendIQAlert({ asset: candidate.asset, direction: 'put', expiration: 1, entryAt,
            signalId: queued.signal_id, timeframe: 'M1', strategy: TREND_THREE_LOSS_LABEL, brokerOrderId: outcome.tradeId, accountType: cfg.account_type,
          }, { lovableKey: Deno.env.get('LOVABLE_API_KEY') || '', telegramKey: Deno.env.get('TELEGRAM_API_KEY') || '' });
          if (messageId !== undefined) {
            const { error } = await db.from('telegram_iq_deliveries').upsert({ signal_id: queued.signal_id, chat_id: IQ_TELEGRAM_CHANNEL,
              signal_message_id: messageId, strategy: TREND_THREE_LOSS_LABEL }, { onConflict: 'signal_id', ignoreDuplicates: true });
            if (error) throw error;
            await db.from('operation_results').update({ telegram_sent: true }).eq('signal_id', queued.signal_id);
          }
        } catch (error) { console.error('Trend PUT Telegram:', String(error)); }
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(0, entryAt + 61500 - Date.now())));
      try { await fetch(`${url}/functions/v1/iqoption-check-results`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) }); }
      catch { /* minute runner reconciles and dispatches linked results too */ }
    };
    // @ts-ignore Hosted background runtime
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(background());
    else await background();
    console.log('Trend PUT confirmed:', queued.signal_id, outcome.tradeId);
    return reply({ success: true, signalId: queued.signal_id, tradeId: outcome.tradeId });
  } catch (error) {
    console.error('Trend PUT:', String(error));
    return reply({ error: 'Strategy processing failed; inspect service logs' }, 500);
  }
});