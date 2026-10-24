import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { iqMarketOpen } from '../_shared/iq-market-open.ts';
import { sendIQAlert, IQ_TELEGRAM_CHANNEL } from '../_shared/telegram-iq-alert.ts';
import { freshSelectedTrend, notifySelectedTrend } from '../_shared/selected-demo-trend.ts';
import { reusableDemoSession } from '../_shared/demo-session.ts';
import { TREND_WIN_INVERTED } from '../_shared/trend-win-inverted.ts';
import { selectedDemoPrincipal } from '../_shared/selected-demo-principal.ts';
import { QUEDA_WIN_RETRY } from '../_shared/queda-win-call.ts';
const freshTrendPut = freshSelectedTrend;
const notifyTrendPut = notifySelectedTrend;

const schema = z.object({ candidate: z.string().min(1).max(255), brokerSession: z.object({ ssid: z.string().min(1).max(4096), configId: z.string().uuid() }).optional() }).strict();
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
  const state: { claimed?: { signalId: string; asset: string; amount: number; entryAt: number; configId: string; direction: string; entryStrategy: string } } = {};
  let submitted = false;
  let leaseScope = 'master:tendencia';
  try {
    if (req.headers.get('Authorization') !== `Bearer ${key}`) return reply({ error: 'Unauthorized' }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: 'Invalid candidate' }, 400);
    const { data: candidate, error: candidateError } = await db.from('iq_demo_test_candidates')
      .select('signal_id,asset,entry_minute,entry_strategy,direction').eq('signal_id', parsed.data.candidate).maybeSingle();
    if (candidateError) throw candidateError;
    if (!selectedDemoPrincipal(candidate, Date.now())) return reply({ skipped: 'No fresh authorized selected signal' });
    if (!candidate) return reply({ skipped: 'No candidate' });
    const entryAt = Date.parse(candidate.entry_minute);
    const { data: cfg } = await readMasterIQConfig(db);
    if (!cfg || !cfg.last_connected_at || !['PRACTICE', 'REAL'].includes(cfg.account_type)) return reply({ skipped: 'Principal connection unavailable' });
    let ssid: string | null = reusableDemoSession(true, cfg.id, parsed.data.brokerSession);
    for (const endpoint of ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login']) {
      if (ssid || !freshTrendPut(entryAt, Date.now())) break;
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
      let balanceId: number | null = null, balanceAmount: number | null = null, initialized = false, done = false;
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
            balanceAmount = Number(balance.amount);
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
            const { data: order, error } = await db.rpc('claim_selected_demo_trend', { p_candidate: candidate.signal_id, p_config: cfg.id, p_balance: balanceAmount });
            if (error) throw error;
            if (!order) { finish({ success: false, error: 'Sequence, limits or reservation rejected; no order sent' }); return; }
            state.claimed = order;
            leaseScope = `master:${String(order.entryStrategy).toLowerCase()}`;
            if (order.configId !== cfg.id || !['call','put'].includes(order.direction)
              || !['TENDENCIA',TREND_WIN_INVERTED,QUEDA_WIN_RETRY].includes(order.entryStrategy)
              || !freshTrendPut(order.entryAt, Date.now()) || done) {
              finish({ success: false, error: 'Configuration changed or entry window closed; no order sent' }); return;
            }
            const { data: lease, error: leaseError } = await db.from('trade_queue').update({ error: 'placement_claimed' })
              .eq('signal_id', order.signalId).eq('entry_strategy', order.entryStrategy).eq('status', 'executing').is('error', null).select('id');
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
              user_balance_id: balanceId, active_id: activeId, option_type_id: 3, direction: order.direction,
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
    // Never adopt another invocation's order: only the successful atomic claimant owns this result.
    const owned = state.claimed;
    if (!owned) return reply({ skipped: outcome.error || 'No authorized order' });
    const queued = { signal_id: owned.signalId, amount: owned.amount };
    const direction = owned.direction.toUpperCase();
    const strategyLabel = owned.entryStrategy === QUEDA_WIN_RETRY ? 'Queda win +1' : owned.entryStrategy === TREND_WIN_INVERTED ? 'Tendência invertida' : 'Tendência';
    if (!outcome.success || !outcome.tradeId) {
      console.error('Selected Trend failed:', outcome.error);
      await db.from('trade_queue').update({ status: 'failed', error: outcome.error || 'Broker confirmation unknown' }).eq('signal_id', queued.signal_id);
      if (!submitted || outcome.error?.startsWith('Broker refusal:')) await db.from('iq_entry_leases')
        .update({ reserved_until: new Date().toISOString() }).eq('scope', leaseScope).eq('signal_id', queued.signal_id);
      return reply({ success: false, error: outcome.error });
    }
    const { error: saveError } = await db.from('operation_results').insert({
      signal_id: queued.signal_id, asset: candidate.asset, direction, entry_price: Number(queued.amount), result: 'pending', profit: 0,
      iq_option_id: outcome.tradeId, is_auto_trade: true, is_ai_analyzed: false, entry_strategy: owned.entryStrategy,
      timeframe: 'M1', created_at: new Date().toISOString(), expiration_time: new Date(entryAt + 60000).toISOString(),
    });
    if (saveError) throw saveError;
    await db.from('trade_queue').update({ status: 'executed', iq_option_id: outcome.tradeId, executed_at: new Date().toISOString(), error: null }).eq('signal_id', queued.signal_id);
    await db.from('iq_entry_leases').update({ reserved_until: new Date().toISOString() }).eq('scope', leaseScope).eq('signal_id', queued.signal_id);
    // Only the additional confirmed principal order is copied, never the Demo TEST ledger.
    const copyTask = fetch(`${url}/functions/v1/iqoption-place-trade`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyPrincipalSignalId: queued.signal_id }), signal: AbortSignal.timeout(90000),
    }).then(async response => {
      if (!response.ok) console.error('Selected Trend copy dispatch:', response.status);
      else console.log('Selected Trend copy dispatch:', await response.text());
    }).catch(error => console.error('Selected Trend copy dispatch failed:', String(error)));
    // @ts-ignore Hosted background runtime
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(copyTask);
    else await copyTask;
    const background = async () => {
      if (notifyTrendPut(outcome, entryAt, Date.now())) {
        try {
          const messageId = await sendIQAlert({ asset: candidate.asset, direction: direction === 'CALL' ? 'call' : 'put', expiration: 1, entryAt,
            signalId: queued.signal_id, timeframe: 'M1', strategy: strategyLabel, brokerOrderId: outcome.tradeId, accountType: cfg.account_type,
          }, { lovableKey: Deno.env.get('LOVABLE_API_KEY') || '', telegramKey: Deno.env.get('TELEGRAM_API_KEY') || '' });
          if (messageId !== undefined) {
            const { error } = await db.from('telegram_iq_deliveries').upsert({ signal_id: queued.signal_id, chat_id: IQ_TELEGRAM_CHANNEL,
              signal_message_id: messageId, strategy: strategyLabel }, { onConflict: 'signal_id', ignoreDuplicates: true });
            if (error) throw error;
            await db.from('operation_results').update({ telegram_sent: true }).eq('signal_id', queued.signal_id);
          }
        } catch (error) { console.error('Selected Trend Telegram:', String(error)); }
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(0, entryAt + 61500 - Date.now())));
      try { await fetch(`${url}/functions/v1/iqoption-check-results`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) }); }
      catch { /* minute runner reconciles and dispatches linked results too */ }
    };
    // @ts-ignore Hosted background runtime
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(background());
    else await background();
    console.log('Selected Trend confirmed:', queued.signal_id, outcome.tradeId);
    return reply({ success: true, signalId: queued.signal_id, tradeId: outcome.tradeId });
  } catch (error) {
    console.error('Selected Trend:', String(error));
    if (state.claimed) {
      await db.from('trade_queue').update({ status: 'failed', error: submitted ? 'Broker confirmation or persistence unknown' : 'Preparation failed; no order sent' }).eq('signal_id', state.claimed.signalId);
      if (!submitted) await db.from('iq_entry_leases').update({ reserved_until: new Date().toISOString() }).eq('scope', leaseScope).eq('signal_id', state.claimed.signalId);
    }
    return reply({ error: 'Strategy processing failed; inspect service logs' }, 500);
  }
});