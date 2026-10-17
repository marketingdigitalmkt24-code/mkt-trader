// Estudo (16/10/2026): aplica 3 filtros às entradas reais de Tendência dos últimos 30 dias,
// usando velas 1m da IQ Option anteriores à entrada. Só leitura: não grava nada e não opera.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const AUTH_URLS = ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login'];
const WS_URL = 'wss://iqoption.com/echo/websocket';
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
const norm = (s: string) => String(s || '').toUpperCase().replace('FRONT.', '').replace(/[^A-Z0-9]/g, '').replace(/OP$/, '');
const ema = (p: number, src: number[]) => { const a = 2 / (p + 1); const r: number[] = []; src.forEach((x, i) => r.push(i ? x * a + r[i - 1] * (1 - a) : x)); return r; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const since = new Date(Date.now() - 1 * 86400000).toISOString();
  const { data: ops } = await supabase.from('operation_results').select('asset, direction, result, profit, created_at, entry_strategy')
    .eq('timeframe','TEST').in('entry_strategy', ['TENDENCIA']).in('result', ['win', 'loss']).gte('created_at', since).order('created_at');
  const trades = (ops || []) as any[];
  const { data: cfg } = await supabase.from('iqoption_config').select('email, password').eq('is_active', true).limit(1).maybeSingle();
  if (!cfg) return Response.json({ success: false, error: 'no config' }, { headers: cors });
  const ssid = await login(cfg.email, cfg.password);
  if (!ssid) return Response.json({ success: false, error: 'login failed' }, { headers: cors });

  const candles = new Map<number, K[]>();
  const tradeIds: (number | null)[] = [];
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(WS_URL);
    let pending = 0;
    const finish = () => { try { ws.close(); } catch (_) { /* */ } resolve(); };
    const timer = setTimeout(finish, 40000);
    ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    ws.onerror = () => { clearTimeout(timer); finish(); };
    ws.onmessage = async (ev) => {
      const d = JSON.parse(ev.data);
      if (d.name === 'profile') ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
      if (d.name === 'initialization-data') {
        const all = { ...(d.msg?.binary?.actives || {}), ...(d.msg?.turbo?.actives || {}), ...(d.msg?.digital?.actives || {}) };
        const byName = new Map<string, number>();
        for (const [id, a] of Object.entries<any>(all)) { const n = norm(a.name); if (!byName.has(n)) byName.set(n, Number(id)); }
        trades.forEach((t, i) => {
          const n = norm(t.asset);
          tradeIds[i] = byName.get(n) ?? byName.get(n.replace('OTC', '')) ?? null;
        });
        const reqs = trades.map((t, i) => ({ i, id: tradeIds[i] })).filter(x => x.id);
        pending = reqs.length;
        if (!pending) { clearTimeout(timer); finish(); return; }
        for (const { i, id } of reqs) {
          const to = Math.floor(new Date(trades[i].created_at).getTime() / 60000) * 60 - 1;
          ws.send(JSON.stringify({ name: 'sendMessage', request_id: `t${i}`, msg: { name: 'get-candles', version: '2.0', body: { active_id: id, size: 60, to, count: 400 } } }));
          await new Promise(r => setTimeout(r, 15));
        }
      }
      if (d.name === 'candles' && String(d.request_id || '').startsWith('t')) {
        const i = Number(d.request_id.slice(1));
        candles.set(i, (d.msg?.candles || []).map((c: any) => ({ t: c.from, o: c.open, c: c.close, h: c.max, l: c.min })).filter((k: K) => typeof k.c === 'number').sort((a: K, b: K) => a.t - b.t));
        if (--pending <= 0) { clearTimeout(timer); finish(); }
      }
    };
  });

  const trend: any = { a_favor: { w: 0, l: 0, p: 0 }, contra: { w: 0, l: 0, p: 0 }, sem_dados: { w: 0, l: 0, p: 0 } };
  trades.forEach((t, i) => { const cs = candles.get(i) || []; let k = 'sem_dados';
    if (cs.length >= 60) { const c = cs.map(x => x.c); const n = c.length - 1; const e9 = ema(9, c)[n], e21 = ema(21, c)[n]; const sma = c.slice(n - 49).reduce((a, b) => a + b, 0) / 50;
      const up = e9 > e21 && e21 > sma && c[n] > e21, dn = e9 < e21 && e21 < sma && c[n] < e21; k = (t.direction === 'CALL' ? up : dn) ? 'a_favor' : 'contra'; }
    const b = trend[k]; if (t.result === 'win') b.w++; else b.l++; b.p += Number(t.profit); });
  type S = { cutW: number; cutL: number; cutP: number };
  const mk = (): S => ({ cutW: 0, cutL: 0, cutP: 0 });
  const st: Record<string, S> = { maior: mk(), esticado: mk(), ultimas: mk(), qualquer: mk() };
  let analyzed = 0, missing = 0;
  const examples: any[] = [];
  trades.forEach((t, i) => {
    const cs = candles.get(i) || [];
    const entry = new Date(t.created_at).getTime();
    const call = t.direction === 'CALL';
    const win = t.result === 'win';
    const flags: Record<string, boolean> = { maior: false, esticado: false, ultimas: false };
    // 3) Últimas entradas: entrada real anterior no mesmo ativo/direção, até 30 min, perdeu.
    for (let j = i - 1; j >= 0; j--) {
      const p = trades[j]; const dt = entry - new Date(p.created_at).getTime();
      if (dt > 30 * 60000) break;
      if (p.asset === t.asset && p.direction === t.direction) { flags.ultimas = p.result === 'loss'; break; }
    }
    if (cs.length >= 330) {
      analyzed++;
      const c = cs.map(k => k.c);
      // 1) Tendência maior: M5 e M15 (EMA9 x EMA21) na mesma direção.
      const agg = (m: number) => { const out: number[] = []; for (const k of cs) { const b = Math.floor(k.t / (m * 60)); if (!out.length || (out as any).lb !== b) { out.push(k.c); (out as any).lb = b; } else out[out.length - 1] = k.c; } return out; };
      const m5 = agg(5), m15 = agg(15);
      const ok = (s: number[]) => { const a = ema(9, s), b = ema(21, s); const n = s.length - 1; return call ? a[n] > b[n] : a[n] < b[n]; };
      flags.maior = !(ok(m5) && ok(m15));
      // 2) Preço esticado: distância da EMA21 > 1,5×ATR14 ou 4+ velas seguidas na direção.
      const e21 = ema(21, c); const n = c.length - 1;
      let atr = 0; for (let j = n - 13; j <= n; j++) atr += cs[j].h - cs[j].l; atr /= 14;
      let seq = 0; for (let j = n; j >= 0; j--) { const up = cs[j].c > cs[j].o, dn = cs[j].c < cs[j].o; if ((call && up) || (!call && dn)) seq++; else break; }
      const dist = call ? c[n] - e21[n] : e21[n] - c[n];
      flags.esticado = (atr > 0 && dist > 1.5 * atr) || seq >= 4;
    } else { missing++; }
    const any = flags.maior || flags.esticado || flags.ultimas;
    for (const [k, v] of Object.entries({ ...flags, qualquer: any })) if (v) { const s = st[k]; if (win) s.cutW++; else s.cutL++; s.cutP += Number(t.profit); }
    if (t.asset === 'BTC/USD' && t.created_at.startsWith('2026-10-16T05:4')) examples.push({ t: t.created_at, r: t.result, ...flags });
  });
  const w = trades.filter(t => t.result === 'win').length;
  return Response.json({ success: true, trend, total: trades.length, wins: w, losses: trades.length - w, profit: trades.reduce((s, t) => s + Number(t.profit), 0), analyzed, missing, st, examples }, { headers: cors });
});
