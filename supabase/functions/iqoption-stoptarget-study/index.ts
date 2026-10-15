// Estudo stop/alvo (plano 15/10/2026): 30 dias de velas 5m da IQ Option, forex principais
// (sem OTC). Tendência 9>21>50 + recuo na média 21; stop 1x ATR14, alvo 2x, saída por tempo 2h.
// 20 dias de busca + 10 de validação. Só leitura.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const AUTH_URLS = ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login'];
const WS_URL = 'wss://iqoption.com/echo/websocket';
const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
const SPREAD: Record<string, number> = { EURUSD: 0.0001, GBPUSD: 0.00015, USDJPY: 0.015, AUDUSD: 0.00012, USDCAD: 0.00015 };
type K = { t: number; o: number; c: number; h: number; l: number };

async function login(email: string, password: string) {
  for (const u of AUTH_URLS) {
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: new URLSearchParams({ identifier: email, password }), signal: AbortSignal.timeout(10000) });
      const d = await r.json(); if (d.code === 'success' && d.ssid) return d.ssid as string;
    } catch (_) { /* */ }
  }
  return null;
}

type Stat = { n: number; w: number; l: number; t: number; r: number };
const blank = (): Stat => ({ n: 0, w: 0, l: 0, t: 0, r: 0 });

function sim(cs: K[], spread: number, splitT: number, rr: number, out: Record<string, Stat>, st = 1) {
  const ema = (p: number, s: number[]) => { const a = 2 / (p + 1); const r: number[] = []; s.forEach((x, i) => r.push(i ? x * a + r[i - 1] * (1 - a) : x)); return r; };
  const c = cs.map(k => k.c); const e9 = ema(9, c), e21 = ema(21, c), e50 = ema(50, c);
  const atr: number[] = []; cs.forEach((k, i) => { const tr = i ? Math.max(k.h - k.l, Math.abs(k.h - c[i - 1]), Math.abs(k.l - c[i - 1])) : k.h - k.l; atr.push(i ? (atr[i - 1] * 13 + tr) / 14 : tr); });
  let busyUntil = 0;
  for (let i = 60; i < cs.length - 25; i++) {
    if (cs[i].t < busyUntil) continue;
    const up = e9[i] > e21[i] && e21[i] > e50[i] && cs[i].l <= e21[i] && c[i] > e21[i];
    const dn = e9[i] < e21[i] && e21[i] < e50[i] && cs[i].h >= e21[i] && c[i] < e21[i];
    if (!up && !dn) continue;
    const entry = cs[i + 1].o + (up ? spread : -spread), risk = atr[i] * st;
    if (!(risk > 0)) continue;
    const stop = up ? entry - risk : entry + risk, tgt = up ? entry + rr * risk : entry - rr * risk;
    let res = 0, kind = 't', j = i + 1;
    for (; j <= i + 24; j++) {
      const k = cs[j];
      const hitS = up ? k.l <= stop : k.h >= stop, hitT = up ? k.h >= tgt : k.l <= tgt;
      if (hitS) { res = -1; kind = 'l'; break; }
      if (hitT) { res = rr; kind = 'w'; break; }
    }
    if (kind === 't') { j = Math.min(j, cs.length - 1); res = ((up ? cs[j].c - entry : entry - cs[j].c)) / risk; }
    busyUntil = cs[j].t;
    const key = `${cs[i].t < splitT ? 'busca' : 'valida'}|${up ? 'CALL' : 'PUT'}`;
    for (const kk of [key, key.split('|')[0]]) { const s = out[kk] || (out[kk] = blank()); s.n++; s.r += res; if (kind === 'w') s.w++; else if (kind === 'l') s.l++; else s.t++; }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  const rr = Math.min(4, Math.max(1, Number(body.rr) || 2)); const sm = body.spreadMult ?? 1; const st = Math.max(0.5, Number(body.stopAtr) || 1);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await supabase.from('iqoption_config').select('email, password').eq('is_active', true).limit(1).maybeSingle();
  if (!cfg) return Response.json({ success: false, error: 'no config' }, { headers: cors });
  const ssid = await login(cfg.email, cfg.password);
  if (!ssid) return Response.json({ success: false, error: 'login failed' }, { headers: cors });
  const nowSec = Math.floor(Date.now() / 1000), splitT = nowSec - 10 * 86400;

  const data: Record<string, K[]> = await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL); const out: Record<string, K[]> = {}; const byReq = new Map<string, string>(); let pending = 0;
    const finish = () => { try { ws.close(); } catch (_) { /* */ } resolve(out); };
    const timer = setTimeout(finish, 90000);
    ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    ws.onerror = () => { clearTimeout(timer); finish(); };
    ws.onmessage = async (ev) => {
      const d = JSON.parse(ev.data);
      if (d.name === 'profile') ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
      if (d.name === 'initialization-data') {
        const all = { ...(d.msg?.binary?.actives || {}), ...(d.msg?.turbo?.actives || {}) };
        const ids = new Map<string, number>();
        for (const [id, a] of Object.entries<any>(all)) { const n = String(a.name || '').toUpperCase().replace('FRONT.', '').replace('/', '').replace(/-OP$/, ''); (globalThis as any).__names = [...((globalThis as any).__names || []), n].slice(0, 400); if (PAIRS.includes(n) && !ids.has(n)) ids.set(n, Number(id)); }
        pending = ids.size * 9;
        if (!pending) { clearTimeout(timer); finish(); return; }
        for (const [n, id] of ids) { out[n] = []; for (let k = 0; k < 9; k++) { const rid = `s${id}_${k}`; byReq.set(rid, n);
          ws.send(JSON.stringify({ name: 'sendMessage', request_id: rid, msg: { name: 'get-candles', version: '2.0', body: { active_id: id, size: 300, to: nowSec - k * 300000, count: 1000 } } }));
          await new Promise(r => setTimeout(r, 50)); } }
      }
      if (d.name === 'candles' && byReq.has(d.request_id)) {
        const n = byReq.get(d.request_id)!; (d.msg?.candles || []).forEach((c: any) => out[n].push({ t: c.from, o: c.open, c: c.close, h: c.max, l: c.min }));
        byReq.delete(d.request_id); if (--pending <= 0) { clearTimeout(timer); finish(); }
      }
    };
  });

  const total: Record<string, Stat> = {}; const per: Record<string, Record<string, Stat>> = {};
  for (const [n, raw] of Object.entries(data)) {
    const cs = raw.filter(k => typeof k.c === 'number' && k.h > k.l).sort((a, b) => a.t - b.t).filter((k, i, a) => !i || k.t !== a[i - 1].t);
    per[n] = {}; sim(cs, SPREAD[n]*sm, splitT, rr, per[n], st); sim(cs, SPREAD[n]*sm, splitT, rr, total, st);
    (per[n] as any).candles = cs.length;
  }
  return Response.json({ success: true, rr, total, per, names: Object.keys(data).length ? undefined : (globalThis as any).__names }, { headers: cors });
});
