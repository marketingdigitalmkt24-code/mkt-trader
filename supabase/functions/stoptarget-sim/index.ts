// Teste Stop/Alvo (plano 15/10/2026): simulação ao vivo, SEM dinheiro real.
// A cada minuto: 1) confere posições simuladas abertas contra velas 5m da IQ Option
// (stop 1x ATR14, alvo 2x, saída por tempo 2h); 2) se nenhuma posição aberta, avalia
// o sinal da última vela fechada (tendência 9>21>50 + recuo na média 21) e abre
// nova posição simulada. Spread embutido no preço de entrada (pior preço).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const AUTH_URLS = ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login'];
const WS_URL = 'wss://iqoption.com/echo/websocket';
const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
const SPREAD: Record<string, number> = { EURUSD: 0.0001, GBPUSD: 0.00015, USDJPY: 0.015, AUDUSD: 0.00012, USDCAD: 0.00015 };
const STOP_ATR = 1, RR = 2, MAX_MINUTES = 120; // alvo 2x stop, saída por tempo 2h
type K = { t: number; o: number; c: number; h: number; l: number };

async function login(email: string, password: string) {
  for (const u of AUTH_URLS) {
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: new URLSearchParams({ identifier: email, password }), signal: AbortSignal.timeout(10000) });
      const d = await r.json(); if (d.code === 'success' && d.ssid) return d.ssid as string;
    } catch (_) { /* tenta próximo */ }
  }
  return null;
}

const ema = (p: number, s: number[]) => { const a = 2 / (p + 1); const r: number[] = []; s.forEach((x, i) => r.push(i ? x * a + r[i - 1] * (1 - a) : x)); return r; };

function indicators(cs: K[]) {
  const c = cs.map(k => k.c);
  const e9 = ema(9, c), e21 = ema(21, c), e50 = ema(50, c);
  const atr: number[] = []; cs.forEach((k, i) => { const tr = i ? Math.max(k.h - k.l, Math.abs(k.h - c[i - 1]), Math.abs(k.l - c[i - 1])) : k.h - k.l; atr.push(i ? (atr[i - 1] * 13 + tr) / 14 : tr); });
  return { e9, e21, e50, atr };
}

function placePractice(ws: WebSocket, listeners: ((d: any) => void)[], balanceId: number, sym: string, dir: string, amount: number, leverage: number, stop: number, target: number): Promise<{ id?: string; error?: string }> {
  return new Promise((resolve) => {
    if (!balanceId) return resolve({ error: 'conta de treino não encontrada' });
    if (ws.readyState !== WebSocket.OPEN) return resolve({ error: 'conexão fechada' });
    let done = false; const end = (r: { id?: string; error?: string }) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    const t = setTimeout(() => end({ error: 'sem resposta da IQ Option' }), 15000);
    listeners.push((d) => {
      if (d.request_id === 'fxp') { if (d.msg?.id) end({ id: String(d.msg.id) }); else if (d.msg?.message || d.status >= 400) end({ error: String(d.msg?.message || d.status) }); }
      if ((d.name === 'order-changed' || d.name === 'position-changed') && d.msg?.id && d.msg?.instrument_id === sym) end({ id: String(d.msg.id) });
    });
    ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'set-active-balance', version: '1.0', body: { balance_id: balanceId } } }));
    ws.send(JSON.stringify({ name: 'sendMessage', request_id: 'fxp', msg: { name: 'place-order-temp', version: '4.0', body: {
      user_balance_id: balanceId, client_platform_id: 9, instrument_type: 'forex', instrument_id: sym,
      side: dir === 'CALL' ? 'buy' : 'sell', type: 'market', amount, leverage, limit_price: null, stop_price: null,
      use_token_for_commission: false, auto_margin_call: false, use_trail_stop: false,
      take_profit_kind: 'price', take_profit_value: target, stop_lose_kind: 'price', stop_lose_value: stop,
    } } }));
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await supabase.from('iqoption_config').select('email, password').eq('is_active', true).limit(1).maybeSingle();
  if (!cfg) return Response.json({ success: false, error: 'no config' }, { headers: cors });
  const ssid = await login(cfg.email, cfg.password);
  if (!ssid) return Response.json({ success: false, error: 'login failed' }, { headers: cors });
  const nowSec = Math.floor(Date.now() / 1000);

  // Baixa as últimas ~70 velas 5m de cada par (1 requisição por par)
  const ws = new WebSocket(WS_URL); let practiceId = 0; let practiceBal: { amount: number; currency: string } | null = null;
  const listeners: ((d: any) => void)[] = [];
  const data: Record<string, K[]> = await new Promise((resolve) => {
    const out: Record<string, K[]> = {}; const byReq = new Map<string, string>(); let pending = 0;
    const finish = () => resolve(out);
    const timer = setTimeout(finish, 45000);
    ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    ws.onerror = () => { clearTimeout(timer); finish(); };
    ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      listeners.forEach(f => f(d));
      if (d.name === 'profile' && Array.isArray(d.msg?.balances)) { const b = d.msg.balances.find((x: any) => x.type === 4); if (b) { practiceId = b.id; practiceBal = { amount: Number(b.amount), currency: String(b.currency || 'USD') }; } }
      if (d.name === 'profile') ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
      if (d.name === 'initialization-data') {
        const all = { ...(d.msg?.binary?.actives || {}), ...(d.msg?.turbo?.actives || {}) };
        const ids = new Map<string, number>();
        for (const [id, a] of Object.entries<any>(all)) {
          const n = String(a.name || '').toUpperCase().replace('FRONT.', '').replace(' ', '').replace('/', '').replace(/-OP$/, '');
          if (PAIRS.includes(n) && !ids.has(n)) ids.set(n, Number(id));
        }
        pending = ids.size;
        if (!pending) { clearTimeout(timer); finish(); return; }
        for (const [n, id] of ids) { out[n] = []; const rid = `c${id}`;
          ws.send(JSON.stringify({ name: 'sendMessage', request_id: rid, msg: { name: 'get-candles', version: '2.0', body: { active_id: id, size: 300, to: nowSec, count: 70 } } }));
          byReq.set(rid, n); }
      }
      if (d.name === 'candles' && byReq.has(d.request_id)) {
        const n = byReq.get(d.request_id)!; (d.msg?.candles || []).forEach((c: any) => out[n].push({ t: c.from, o: c.open, c: c.close, h: c.max, l: c.min }));
        byReq.delete(d.request_id); if (--pending <= 0) { clearTimeout(timer); finish(); }
      }
    };
  });

  const cleaned: Record<string, K[]> = {};
  for (const [n, raw] of Object.entries(data)) {
    cleaned[n] = raw.filter(k => typeof k.c === 'number' && k.h >= k.l).sort((a, b) => a.t - b.t).filter((k, i, a) => !i || k.t !== a[i - 1].t);
  }

  const nowIso = new Date().toISOString();
  // 1) Posições abertas: checa stop/alvo/tempo
  const { data: openPos } = await supabase.from('stop_target_positions').select('*').eq('status', 'open');
  const closed: any[] = []; const stillOpen = (openPos || []).length;
  for (const p of openPos || []) {
    const cs = cleaned[p.symbol] || [];
    const dir = p.direction === 'CALL' ? 1 : -1;
    const openedSec = Math.floor(new Date(p.opened_at).getTime() / 1000);
    let done: { kind: string; price: number } | null = null;
    for (const k of cs) {
      if (k.t < openedSec) continue;
      const hitStop = dir === 1 ? k.l <= Number(p.stop_price) : k.h >= Number(p.stop_price);
      const hitTgt = dir === 1 ? k.h >= Number(p.target_price) : k.l <= Number(p.target_price);
      if (hitStop) { done = { kind: 'loss', price: Number(p.stop_price) }; break; } // se cair na mesma vela, conta stop
      if (hitTgt) { done = { kind: 'win', price: Number(p.target_price) }; break; }
    }
    if (!done && nowSec - openedSec >= MAX_MINUTES * 60) {
      const last = cs[cs.length - 1];
      if (last) done = { kind: 'time', price: last.c };
    }
    if (done) {
      const r = (done.kind === 'win' ? RR * dir : done.kind === 'loss' ? -dir : dir * (done.price - Number(p.entry_price)) / Number(p.risk_distance));
      const resR = done.kind === 'win' ? RR : done.kind === 'loss' ? -1 : Number(r.toFixed(3));
      await supabase.from('stop_target_positions').update({ status: 'closed', result_kind: done.kind, result_r: resR, close_price: done.price, closed_at: nowIso }).eq('id', p.id);
      closed.push({ symbol: p.symbol, kind: done.kind, r: resR });
    }
  }

  // 2) Se nenhuma posição aberta, avalia sinal da última vela FECHADA
  let opened: any = null;
  if (!(openPos || []).length) {
    outer: for (const [n, cs] of Object.entries(cleaned)) {
      if (cs.length < 60) continue;
      const { e9, e21, e50, atr } = indicators(cs);
      const i = cs.length - 2; // última vela fechada
      const k = cs[i];
      const up = e9[i] > e21[i] && e21[i] > e50[i] && k.l <= e21[i] && k.c > e21[i];
      const dn = e9[i] < e21[i] && e21[i] < e50[i] && k.h >= e21[i] && k.c < e21[i];
      if (!up && !dn) continue;
      const direction = up ? 'CALL' : 'PUT';
      const sp = SPREAD[n] || 0.00015;
      const entry = k.c + (up ? sp : -sp);
      const risk = atr[i] * STOP_ATR;
      if (!(risk > 0)) continue;
      const stop = up ? entry - risk : entry + risk;
      const target = up ? entry + RR * risk : entry - RR * risk;
      const { data: ins, error } = await supabase.from('stop_target_positions').insert({
        symbol: n, direction, entry_price: entry, stop_price: stop, target_price: target,
        risk_distance: risk, risk_usd: 10, status: 'open', opened_at: nowIso,
      }).select().single();
      if (!error && ins) {
        opened = { symbol: n, direction, entry, stop, target };
        // Ordem forex de verdade na conta de TREINO (PRACTICE) com stop e alvo no preço
        const lev = 100; const amount = Math.max(1, Math.min(5000, Math.round(10 * entry / (lev * risk))));
        const iq = await placePractice(ws, listeners, practiceId, n, direction, amount, lev, stop, target);
        await supabase.from('stop_target_positions').update({ iq_account: 'PRACTICE', iq_amount: amount, iq_leverage: lev, iq_order_id: iq.id || null, iq_status: iq.id ? 'open' : 'failed', iq_error: iq.error || null }).eq('id', ins.id);
        opened.iq = iq;
        break outer;
      }
    }
  }

  // Saldo real da conta de treino (relido após possíveis ordens)
  if (practiceId && ws.readyState === WebSocket.OPEN) {
    await new Promise<void>((res) => {
      const t = setTimeout(res, 6000);
      listeners.push((d) => { if (d.request_id === 'bal' && Array.isArray(d.msg)) { const b = d.msg.find((x: any) => x.id === practiceId); if (b) practiceBal = { amount: Number(b.amount), currency: String(b.currency || 'USD') }; clearTimeout(t); res(); } });
      ws.send(JSON.stringify({ name: 'sendMessage', request_id: 'bal', msg: { name: 'get-balances', version: '1.0', body: {} } }));
    });
  }
  if (practiceBal) await supabase.from('forex_practice_balance').upsert({ id: 1, amount: practiceBal.amount, currency: practiceBal.currency, updated_at: new Date().toISOString() });
  try { ws.close(); } catch (_) { /* */ }
  return Response.json({ success: true, practiceId, practiceBal, opened, closed, openPositions: stillOpen - closed.length, pairs: Object.fromEntries(Object.entries(cleaned).map(([n, cs]) => [n, cs.length])) }, { headers: cors });
});
