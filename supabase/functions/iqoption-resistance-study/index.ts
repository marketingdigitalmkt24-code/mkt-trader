// Research only: no trades, notifications or writes. Fixed criteria, 20d search / 10d validation.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { resistanceStudy, type Candle } from '../_shared/resistance-study.ts';
const schema = z.object({ offset: z.number().int().min(0).max(500).default(0), count: z.number().int().min(1).max(6).default(4), end: z.number().int().positive().optional(), listOnly: z.boolean().default(false) });
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply({});
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply({ error: 'Service unavailable' }, 503);
    const db = createClient(url, key);
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!token) return reply({ error: 'Unauthorized' }, 401);
    const { data: auth, error: authError } = await db.auth.getClaims(token);
    if (authError || !auth?.claims?.sub) return reply({ error: 'Unauthorized' }, 401);
    const uid = auth.claims.sub;
    const { data: role } = await db.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
    if (!role) return reply({ error: 'Admin required' }, 403);
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return reply({ error: 'Invalid study parameters' }, 400);
    const args = parsed.data, end = args.end ?? Math.floor(Date.now() / 60000) * 60;
    if (end > Date.now() / 1000) return reply({ error: 'Future end not allowed' }, 400);
    const { data: cfg } = await db.from('iqoption_config').select('email,password').eq('user_id', uid).eq('is_active', true).maybeSingle();
    if (!cfg) return reply({ error: 'Connect the admin IQ Option account first' }, 409);
    let ssid: string | null = null;
    for (const endpoint of ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login']) {
      try {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: new URLSearchParams({ identifier: cfg.email, password: cfg.password }), signal: AbortSignal.timeout(10000) });
        const d = await r.json(); if (d.code === 'success' && d.ssid) { ssid = d.ssid; break; }
      } catch { /* try alternate broker endpoint */ }
    }
    if (!ssid) return reply({ error: 'Broker login failed' }, 502);
    const collection = await new Promise<{ universe: string[]; assets: { symbol: string; candles: Candle[]; responses: number }[] }>(resolve => {
      const ws = new WebSocket('wss://iqoption.com/echo/websocket');
      let universe: string[] = [], initialized = false, finished = false;
      const assets: { symbol: string; candles: Candle[]; responses: number }[] = [];
      const pending = new Map<string, number>();
      const finish = () => { if (finished) return; finished = true; clearTimeout(timer); ws.close(); resolve({ universe, assets }); };
      const timer = setTimeout(finish, 110000);
      ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
      ws.onerror = finish;
      ws.onmessage = async ev => {
        let d; try { d = JSON.parse(ev.data); } catch { return; }
        if (d.name === 'profile') ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
        if (d.name === 'initialization-data' && !initialized) {
          initialized = true;
          const all = { ...(d.msg?.binary?.actives || {}), ...(d.msg?.turbo?.actives || {}) };
          const map = new Map<string, number>();
          for (const [id, a] of Object.entries<any>(all)) if (a.enabled && !a.is_suspended) map.set(String(a.name).replace(/^front\./i, '').toUpperCase(), Number(id));
          const entries = [...map].sort((a, b) => a[0].localeCompare(b[0]));
          universe = entries.map(x => x[0]);
          if (args.listOnly) { finish(); return; }
          const selected = entries.slice(args.offset, args.offset + args.count);
          for (const [symbol] of selected) assets.push({ symbol, candles: [], responses: 0 });
          // Register requests before sending so early responses cannot end the collection prematurely.
          selected.forEach(([, id], idx) => { for (let k = 0; k < 44; k++) pending.set(`${id}_${k}`, idx); });
          if (!pending.size) { finish(); return; }
          for (let idx = 0; idx < selected.length; idx++) for (let k = 0; k < 44; k++) {
            if (finished) return;
            const id = selected[idx][1];
            ws.send(JSON.stringify({ name: 'sendMessage', request_id: `${id}_${k}`, msg: { name: 'get-candles', version: '2.0', body: { active_id: id, size: 60, to: end - 1 - k * 60000, count: 1000 } } }));
            await new Promise(r => setTimeout(r, 30));
          }
        }
        if (d.name === 'candles') {
          const idx = pending.get(d.request_id); if (idx === undefined) return;
          const asset = assets[idx]; asset.responses++;
          for (const k of d.msg?.candles || []) if ([k.from,k.open,k.close,k.max,k.min].every(Number.isFinite)) asset.candles.push({ t:k.from, o:k.open, c:k.close, h:k.max, l:k.min });
          pending.delete(d.request_id); if (!pending.size) finish();
        }
      };
    });
    return reply({ end, begin: end - 30 * 86400, split: end - 10 * 86400, totalAssets: collection.universe.length, universe: args.listOnly ? collection.universe : undefined, assets: collection.assets.map(a => {
      const cs = [...new Map(a.candles.filter(k => k.t >= end - 30 * 86400 && k.t + 60 <= end).map(k => [k.t,k])).values()].sort((a,b) => a.t-b.t);
      return { symbol:a.symbol, candles:cs.length, responses:a.responses, first:cs[0]?.t, last:cs.at(-1)?.t, days:new Set(cs.map(k => Math.floor((k.t-10800)/86400))).size, result:resistanceStudy(cs,end) };
    }) });
  } catch { return reply({ error: 'Study collection failed' }, 502); }
});