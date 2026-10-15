// Estudo comparativo de padrões (pedido 15/10/2026): 30 dias de velas 1m da IQ Option,
// expiração de 1 e 5 minutos, separado em 20 dias de busca + 10 dias de validação.
// Só leitura: não grava nada e não opera.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const AUTH_URLS = ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login'];
const WS_URL = 'wss://iqoption.com/echo/websocket';
const DAYS = 30;
type K = { t: number; o: number; c: number; h: number; l: number };

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
  const crypto = /BTC|ETH|LTC|XRP|SOL|DOGE|TRX|TRON|ADA|BNB/.test(base);
  return { symbol: otc ? `${base}-OTC` : base, otc, crypto };
}

type Acc = Record<string, { n: number; w: number }>;
const add = (a: Acc, k: string, win: boolean) => { const s = a[k] || (a[k] = { n: 0, w: 0 }); s.n++; if (win) s.w++; };

function analyze(cs: K[], splitT: number, acc: Acc) {
  if (cs.length < 200) return;
  const ema = (p: number, src: number[]) => { const a = 2 / (p + 1); const r: number[] = []; src.forEach((x, i) => r.push(i ? x * a + r[i - 1] * (1 - a) : x)); return r; };
  const c = cs.map(k => k.c);
  const e9 = ema(9, c), e21 = ema(21, c), e12 = ema(12, c), e26 = ema(26, c);
  const macd = c.map((_, i) => e12[i] - e26[i]); const sig = ema(9, macd);
  const s50: number[] = []; let sum = 0;
  c.forEach((x, i) => { sum += x; if (i >= 50) sum -= c[i - 50]; s50.push(i >= 49 ? sum / 50 : NaN); });
  const rsi: number[] = []; let ag = 0, al = 0;
  for (let i = 0; i < c.length; i++) {
    if (i === 0) { rsi.push(50); continue; }
    const d = c[i] - c[i - 1], g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= 14) { ag += g / 14; al += l / 14; } else { ag = (ag * 13 + g) / 14; al = (al * 13 + l) / 14; }
    rsi.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  const stoch = cs.map((_, i) => {
    if (i < 14) return 50;
    let hi = -Infinity, lo = Infinity;
    for (let j = i - 13; j <= i; j++) { hi = Math.max(hi, cs[j].h); lo = Math.min(lo, cs[j].l); }
    return hi === lo ? 50 : (c[i] - lo) / (hi - lo) * 100;
  });
  const body = cs.map(k => Math.abs(k.c - k.o));
  for (let i = 60; i < cs.length - 5; i++) {
    const nx = cs[i + 1];
    if (nx.t - cs[i].t !== 60) continue;
    const pats: [string, 'CALL' | 'PUT'][] = [];
    const h = macd[i] - sig[i];
    const upT = e9[i] > e21[i] && e21[i] > s50[i] && c[i] > e21[i];
    const dnT = e9[i] < e21[i] && e21[i] < s50[i] && c[i] < e21[i];
    if (upT && h > 0 && rsi[i] >= 50 && rsi[i] <= 60) pats.push(['Tendência alinhada', 'CALL']);
    if (dnT && h < 0 && rsi[i] >= 30 && rsi[i] <= 50) pats.push(['Tendência alinhada', 'PUT']);
    if (rsi[i] > 70 && stoch[i] > 80) pats.push(['Reversão RSI (esticado)', 'PUT']);
    if (rsi[i] < 30 && stoch[i] < 20) pats.push(['Reversão RSI (esticado)', 'CALL']);
    let avgB = 0; for (let j = i - 20; j < i; j++) avgB += body[j]; avgB /= 20;
    if (avgB > 0 && body[i] > 2 * avgB) pats.push(['Vela de força (continuação)', cs[i].c > cs[i].o ? 'CALL' : 'PUT']);
    if (avgB > 0 && body[i] > 2 * avgB) pats.push(['Vela de força (reversão)', cs[i].c > cs[i].o ? 'PUT' : 'CALL']);
    let hi = -Infinity, lo = Infinity; for (let j = i - 20; j < i; j++) { hi = Math.max(hi, cs[j].h); lo = Math.min(lo, cs[j].l); }
    if (c[i] > hi) pats.push(['Rompimento 20 velas', 'CALL']);
    if (c[i] < lo) pats.push(['Rompimento 20 velas', 'PUT']);
    if (upT && cs[i].l <= e21[i] && c[i] > e21[i]) pats.push(['Recuo na média 21', 'CALL']);
    if (dnT && cs[i].h >= e21[i] && c[i] < e21[i]) pats.push(['Recuo na média 21', 'PUT']);
    if (!pats.length) continue;
    const part = nx.t < splitT ? 'busca' : 'valida';
    const ok5 = cs[i + 5].t - nx.t === 240;
    for (const [p, dir] of pats) {
      if (nx.c !== nx.o) add(acc, `${p}|1m|${part}`, dir === 'CALL' ? nx.c > nx.o : nx.c < nx.o);
      if (ok5) { const ex = cs[i + 5].c; if (ex !== nx.o) add(acc, `${p}|5m|${part}`, dir === 'CALL' ? ex > nx.o : ex < nx.o); }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));
  const offset = Math.max(0, Number(body.offset) || 0);
  const count = Math.min(6, Math.max(1, Number(body.count) || 4));
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await supabase.from('iqoption_config').select('email, password').eq('is_active', true).limit(1).maybeSingle();
  if (!cfg) return Response.json({ success: false, error: 'no config' }, { headers: cors });
  const ssid = await login(cfg.email, cfg.password);
  if (!ssid) return Response.json({ success: false, error: 'login failed' }, { headers: cors });
  const nowSec = Math.floor(Date.now() / 1000);
  const splitT = nowSec - 10 * 86400;

  const picked: { symbol: string; candles: K[] }[] = await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const out: { symbol: string; candles: K[] }[] = [];
    const byReq = new Map<string, number>(); let pending = 0;
    const finish = () => { try { ws.close(); } catch (_) { /* */ } resolve(out); };
    const timer = setTimeout(finish, 120000);
    ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    ws.onerror = () => { clearTimeout(timer); finish(); };
    ws.onmessage = async (ev) => {
      const d = JSON.parse(ev.data);
      if (d.name === 'profile') ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
      if (d.name === 'initialization-data') {
        const all = { ...(d.msg?.binary?.actives || {}), ...(d.msg?.turbo?.actives || {}) };
        const cand = new Map<string, number>();
        for (const [id, a] of Object.entries<any>(all)) {
          if (!a.enabled || a.is_suspended) continue;
          const s = symbolOf(a.name);
          if (s.otc && s.crypto) continue;
          if (!cand.has(s.symbol)) cand.set(s.symbol, Number(id));
        }
        const list = [...cand.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(offset, offset + count);
        if (!list.length) { clearTimeout(timer); finish(); return; }
        const chunks = Math.ceil(DAYS * 1440 / 1000);
        pending = list.length * chunks;
        for (const [symbol, id] of list) {
          const idx = out.push({ symbol, candles: [] }) - 1;
          for (let k = 0; k < chunks; k++) {
            const rid = `p${id}_${k}`; byReq.set(rid, idx);
            ws.send(JSON.stringify({ name: 'sendMessage', request_id: rid, msg: { name: 'get-candles', version: '2.0', body: { active_id: id, size: 60, to: nowSec - k * 60000, count: 1000 } } }));
            await new Promise(r => setTimeout(r, 50));
          }
        }
      }
      if (d.name === 'candles' && byReq.has(d.request_id)) {
        const p = out[byReq.get(d.request_id)!];
        (d.msg?.candles || []).forEach((c: any) => p.candles.push({ t: c.from, o: c.open, c: c.close, h: c.max, l: c.min }));
        byReq.delete(d.request_id);
        if (--pending <= 0) { clearTimeout(timer); finish(); }
      }
    };
  });

  const acc: Acc = {};
  const syms: string[] = [];
  for (const p of picked) {
    const cs = p.candles.filter(k => typeof k.o === 'number' && typeof k.c === 'number')
      .sort((a, b) => a.t - b.t).filter((k, i, arr) => i === 0 || k.t !== arr[i - 1].t);
    analyze(cs, splitT, acc);
    syms.push(`${p.symbol}:${cs.length}`);
  }
  return Response.json({ success: true, symbols: syms, acc }, { headers: cors });
});
