// Estudo de 30 dias nos gráficos de 1 min da IQ Option (pedido 15/10/2026).
// Em cada vela onde o padrão de tendência aparece (EMA9/21/SMA50 alinhadas, MACD e RSI a favor),
// simula a entrada na abertura da vela seguinte com expiração de 1 min e guarda o acerto por
// ativo + direção + hora BRT em chart_study. O Histórico bom lê essa tabela.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const AUTH_URLS = ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login'];
const WS_URL = 'wss://iqoption.com/echo/websocket';
const ASSETS_PER_RUN = 3;
const DAYS = 30;
type K = { t: number; o: number; c: number };

async function login(email: string, password: string): Promise<string | null> {
  for (const u of AUTH_URLS) {
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, body: new URLSearchParams({ identifier: email, password }), signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (d.code === 'success' && d.ssid) return d.ssid;
    } catch (_) { /* tenta próxima */ }
  }
  return null;
}

function symbolOf(rawName: string): { symbol: string; otc: boolean; crypto: boolean } {
  let n = String(rawName || '').toUpperCase().replace('FRONT.', '');
  const otc = n.includes('-OTC') || /otc/i.test(rawName);
  n = n.replace('-OTC', '').replace('-OP', '');
  if (/^[A-Z]{6}$/.test(n)) n = `${n.slice(0, 3)}/${n.slice(3)}`;
  const base = n.replace(/[-\s]*BLITZ/i, '').replace(/[-\s]*OTC$/i, '').trim();
  const crypto = /BTC|ETH|LTC|XRP|SOL|DOGE|TRX|TRON|ADA|BNB/.test(base);
  return { symbol: otc ? `${base}-OTC` : base, otc, crypto };
}

function study(cs: K[]) {
  const out = new Map<string, { n: number; w: number }>();
  if (cs.length < 100) return out;
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
  for (let i = 60; i < cs.length - 1; i++) {
    const nx = cs[i + 1];
    if (nx.t - cs[i].t !== 60 || nx.c === nx.o) continue; // vela seguinte contígua, empate ignorado
    const h = macd[i] - sig[i];
    let dir: 'CALL' | 'PUT' | null = null;
    if (e9[i] > e21[i] && e21[i] > s50[i] && c[i] > e21[i] && h > 0 && rsi[i] >= 50 && rsi[i] <= 60) dir = 'CALL';
    else if (e9[i] < e21[i] && e21[i] < s50[i] && c[i] < e21[i] && h < 0 && rsi[i] >= 30 && rsi[i] <= 50) dir = 'PUT';
    if (!dir) continue;
    const win = dir === 'CALL' ? nx.c > nx.o : nx.c < nx.o;
    const hour = new Date((nx.t - 3 * 3600) * 1000).getUTCHours();
    const key = `${dir}|${hour}`;
    const s = out.get(key) || { n: 0, w: 0 };
    s.n++; if (win) s.w++; out.set(key, s);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await supabase.from('iqoption_config').select('email, password').eq('is_active', true).limit(1).maybeSingle();
  if (!cfg) return Response.json({ success: false, error: 'no config' }, { headers: cors });
  const ssid = await login(cfg.email, cfg.password);
  if (!ssid) return Response.json({ success: false, error: 'login failed' }, { headers: cors });

  const { data: done } = await supabase.from('chart_study').select('symbol, updated_at');
  const last = new Map<string, number>();
  (done || []).forEach((r: any) => last.set(r.symbol, Math.max(last.get(r.symbol) || 0, new Date(r.updated_at).getTime())));

  const results: any[] = await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const picked: { id: number; symbol: string; candles: K[]; pending: number }[] = [];
    const byReq = new Map<string, number>();
    let pending = 0;
    const finish = () => { try { ws.close(); } catch (_) { /* */ } resolve(picked); };
    const timer = setTimeout(finish, 110000);
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
        const now = Date.now();
        const list = [...cand.entries()].filter(([s]) => now - (last.get(s) || 0) > 20 * 3600 * 1000)
          .sort((a, b) => (last.get(a[0]) || 0) - (last.get(b[0]) || 0)).slice(0, ASSETS_PER_RUN);
        if (!list.length) { clearTimeout(timer); finish(); return; }
        const nowSec = Math.floor(now / 1000);
        const chunks = Math.ceil(DAYS * 1440 / 1000);
        for (const [symbol, id] of list) {
          const idx = picked.push({ id, symbol, candles: [], pending: chunks }) - 1;
          for (let k = 0; k < chunks; k++) {
            const rid = `s${id}_${k}`; byReq.set(rid, idx); pending++;
            ws.send(JSON.stringify({ name: 'sendMessage', request_id: rid, msg: { name: 'get-candles', version: '2.0', body: { active_id: id, size: 60, to: nowSec - k * 60000, count: 1000 } } }));
            await new Promise(r => setTimeout(r, 60));
          }
        }
      }
      if (d.name === 'candles' && byReq.has(d.request_id)) {
        const p = picked[byReq.get(d.request_id)!];
        (d.msg?.candles || []).forEach((c: any) => p.candles.push({ t: c.from, o: c.open, c: c.close }));
        byReq.delete(d.request_id);
        if (--pending <= 0) { clearTimeout(timer); finish(); }
      }
    };
  });

  const summary: any[] = [];
  for (const p of results) {
    const cs = p.candles.filter((k: K) => typeof k.o === 'number' && typeof k.c === 'number')
      .sort((a: K, b: K) => a.t - b.t).filter((k: K, i: number, arr: K[]) => i === 0 || k.t !== arr[i - 1].t);
    const st = study(cs);
    const rows: any[] = [];
    for (const dir of ['CALL', 'PUT']) for (let h = 0; h < 24; h++) {
      const s = st.get(`${dir}|${h}`) || { n: 0, w: 0 };
      rows.push({ symbol: p.symbol, direction: dir, hour_brt: h, n: s.n, wins: s.w, candles: cs.length, updated_at: new Date().toISOString() });
    }
    await supabase.from('chart_study').upsert(rows, { onConflict: 'symbol,direction,hour_brt' });
    const tot = rows.reduce((a, r) => ({ n: a.n + r.n, w: a.w + r.wins }), { n: 0, w: 0 });
    console.log(`📈 Estudo 30d ${p.symbol}: ${cs.length} velas, ${tot.n} entradas simuladas, ${tot.n ? (tot.w / tot.n * 100).toFixed(1) : 0}%`);
    summary.push({ symbol: p.symbol, candles: cs.length, n: tot.n, wins: tot.w });
  }
  return Response.json({ success: true, studied: summary }, { headers: cors });
});
