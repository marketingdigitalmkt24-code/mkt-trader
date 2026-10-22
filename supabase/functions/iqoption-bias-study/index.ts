// Admin-only research. No writes, placements or notifications.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { marketBias, exactAssetKey, RULE, type Candle } from './bias.ts';
import { previousCandles, PREVIOUS_RULE } from './previous-candles.ts';
import { evaluateAnticipation, ANTICIPATE_RULE } from './anticipate.ts';
import { evaluateMidCandle, MID_RULE } from './midcandle.ts';
import { forcePattern } from './force-pattern.ts';
import { forceEarly } from './force-early.ts';
const schema = z.object({ start: z.string().datetime(), end: z.string().datetime(), split: z.string().datetime(), offset: z.number().int().min(0).max(1000).default(0), count: z.number().int().min(1).max(10).default(8), listOnly: z.boolean().default(false), mode: z.enum(['M15', 'TENDENCIA_M1', 'ANTECIPA_M1', 'MEIO_VELA', 'FORCA_PADRAO', 'FORCA_ANTES']).default('M15') });
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply({});
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply({ error: 'Service unavailable' }, 503);
    const db = createClient(url, key);
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!token) return reply({ error: 'Unauthorized' }, 401);
    const { data: auth, error } = await db.auth.getClaims(token);
    if (error || !auth?.claims?.sub) return reply({ error: 'Unauthorized' }, 401);
    const { data: role, error: roleError } = await db.from('user_roles').select('role').eq('user_id', auth.claims.sub).eq('role', 'admin').maybeSingle();
    if (roleError || !role) return reply({ error: 'Admin required' }, 403);
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return reply({ error: 'Invalid parameters' }, 400);
    const args = parsed.data;
    const mid = args.mode === 'MEIO_VELA';
    const earlyForce = args.mode === 'FORCA_ANTES';
    const force = args.mode === 'FORCA_PADRAO' || earlyForce;
    const ant = args.mode === 'ANTECIPA_M1' || mid;
    const m1 = args.mode === 'TENDENCIA_M1' || ant || force;
    const seconds = mid ? 30 : m1 ? 60 : 900;
    const studyRule = mid ? MID_RULE : ant ? ANTICIPATE_RULE : m1 ? PREVIOUS_RULE : RULE;
    const start = Date.parse(args.start) / 1000, end = Date.parse(args.end) / 1000, split = Date.parse(args.split) / 1000;
    if (!(start < split && split < end) || end > Date.now() / 1000 || end - start > 7 * 86400) return reply({ error: 'Historical range must be at most 7 days with an internal split' }, 400);
    type Op = { signal_id: string; asset: string; direction: string; result: string; profit: number; created_at: string; timeframe: string; entry_strategy: string | null; iq_option_id: string | null };
    const ops: Op[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error: readError } = await db.from('operation_results').select('signal_id,asset,direction,result,profit,created_at,timeframe,entry_strategy,iq_option_id').gte('created_at', args.start).lt('created_at', args.end).in('result', ['win', 'loss', 'tie']).order('created_at').order('id').range(offset, offset + 999);
      if (readError) return reply({ error: 'History read failed' }, 502);
      ops.push(...(data || []).filter(o => m1
        ? (force ? o.entry_strategy === 'VELA_FORCA' && (o.timeframe === 'TEST' && o.signal_id.startsWith('t7-') || o.timeframe === 'M1' && /^\d+$/.test(o.iq_option_id || '') && !o.signal_id.startsWith('copy-')) : o.timeframe === 'TEST' && o.signal_id.startsWith('t7-') && o.entry_strategy === (ant ? 'VELA_FORCA' : 'TENDENCIA'))
        : o.timeframe === 'TEST' && o.signal_id.startsWith('t7-')
          || o.timeframe === 'M1' && /^\d+$/.test(o.iq_option_id || '') && ['FORCA_INVERTIDA', 'RETOMADA', 'REVERSAO_RSI'].includes(o.entry_strategy || '')));
      if (!data || data.length < 1000) break;
    }
    const universe = [...new Set(ops.map(o => o.asset))].sort();
    if (args.listOnly) return reply({ universe, totalOps: ops.length, rule: studyRule, start, end, split });
    const symbols = universe.slice(args.offset, args.offset + args.count);
    if (!symbols.length) return reply({ rows: [], coverage: [], totalAssets: universe.length });
    const master = await readMasterIQConfig(db);
    if (!master.data) return reply({ error: 'Principal account unavailable' }, 409);
    let ssid: string | null = null;
    for (const endpoint of ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login']) {
      try {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, body: new URLSearchParams({ identifier: master.data.email, password: master.data.password }), signal: AbortSignal.timeout(10000) });
        const d = await r.json(); if (d.code === 'success' && typeof d.ssid === 'string') { ssid = d.ssid; break; }
      } catch { /* bounded alternate broker endpoint */ }
    }
    if (!ssid) return reply({ error: 'Broker login failed' }, 502);
    const candles = new Map<string, Candle[]>(), ids = new Map<string, number>();
    let initialized = false;
    await new Promise<void>(resolve => {
      const ws = new WebSocket('wss://iqoption.com/echo/websocket');
      const pending = new Map<string, string>();
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); ws.close(); resolve(); };
      const timer = setTimeout(finish, 65000);
      ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
      ws.onerror = finish;
      ws.onmessage = async ev => {
        let d; try { d = JSON.parse(ev.data); } catch { return; }
        if (d.name === 'profile') ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
        if (d.name === 'initialization-data' && !initialized) {
          initialized = true;
          const all = { ...(d.msg?.binary?.actives || {}), ...(d.msg?.turbo?.actives || {}), ...(d.msg?.digital?.actives || {}) };
          const mapped = new Map<string, number>();
          for (const [id, value] of Object.entries(all)) {
            const a = value as { name?: string };
            if (a.name && Number.isFinite(Number(id))) mapped.set(exactAssetKey(a.name), Number(id));
          }
          const pages = Math.ceil(((end - start) / seconds + studyRule.warmup + 2) / 500);
          for (const symbol of symbols) {
            const id = mapped.get(exactAssetKey(symbol));
            if (id === undefined) continue;
            ids.set(symbol, id); candles.set(symbol, []);
            for (let k = 0; k < pages; k++) pending.set(`${id}_${k}`, symbol);
          }
          if (!pending.size) { finish(); return; }
          for (const [request_id, symbol] of [...pending]) {
            if (done) return;
            const page = Number(request_id.split('_')[1]);
            ws.send(JSON.stringify({ name: 'sendMessage', request_id, msg: { name: 'get-candles', version: '2.0', body: { active_id: ids.get(symbol), size: seconds, to: end - 1 - page * 500 * seconds, count: 500 } } }));
            await new Promise(r => setTimeout(r, 100));
          }
        }
        if (d.name === 'candles') {
          const symbol = pending.get(d.request_id); if (!symbol) return;
          const collection = candles.get(symbol);
          for (const k of d.msg?.candles || []) {
            // Native M15 must be confirmed by duration, never assumed.
            if (k.to - k.from !== seconds || ![k.from,k.open,k.close,k.max,k.min].every(Number.isFinite)) continue;
            collection?.push({ t: k.from, o: k.open, c: k.close, h: k.max, l: k.min });
          }
          pending.delete(d.request_id); if (!pending.size) finish();
        }
      };
    });
    if (ant) {
      // Vela de Força TEST at minute T was triggered by the force candle at T-60; predict that candle.
      const results = symbols.filter(s => candles.has(s)).map(symbol => {
        const force = new Map<number, string>();
        for (const o of ops) if (o.asset === symbol) force.set(Math.floor(Date.parse(o.created_at) / 60000) * 60 - 60, o.direction);
        return mid ? { symbol, market: exactAssetKey(symbol).includes('OTC') ? 'OTC' : 'Regular', ...evaluateMidCandle(candles.get(symbol)!, start, end, split, force) } : { symbol, ...evaluateAnticipation(candles.get(symbol)!, start, end, split, exactAssetKey(symbol).includes('OTC'), force) };
      });
      return reply({ start, end, split, rule: studyRule, totalAssets: universe.length, initialized, results });
    }
    const rows = ops.filter(o => symbols.includes(o.asset)).map(o => {
      // Conservative minute proxy; broker recording time is not a fill timestamp.
      const recorded = Date.parse(o.created_at) / 1000, entry = Math.floor(recorded / 60) * 60;
      if (earlyForce) return { ...o, entry, timestampBasis: o.timeframe === 'TEST' ? 'test_entry_minute' : 'recorded_minute_proxy_not_fill', period: entry < split ? 'discovery' : 'validation', market: exactAssetKey(o.asset).includes('OTC') ? 'OTC' : 'Regular', ...forceEarly(candles.get(o.asset) || [], entry, o.direction) };
      if (force) return { ...o, entry, timestampBasis: o.timeframe === 'TEST' ? 'test_entry_minute' : 'recorded_minute_proxy_not_fill', period: entry < split ? 'discovery' : 'validation', market: exactAssetKey(o.asset).includes('OTC') ? 'OTC' : 'Regular', ...forcePattern(candles.get(o.asset) || [], entry, o.direction) };
      if (m1) return { ...o, entry, timestampBasis: 'test_entry_minute', period: entry < split ? 'discovery' : 'validation', market: exactAssetKey(o.asset).includes('OTC') ? 'OTC' : 'Regular', ...previousCandles(candles.get(o.asset) || [], entry, o.direction) };
      const b = marketBias(candles.get(o.asset) || [], entry);
      return { ...o, entry, timestampBasis: o.timeframe === 'TEST' ? 'test_entry_minute' : 'recorded_minute_proxy_not_fill', period: entry < split ? 'discovery' : 'validation', market: exactAssetKey(o.asset).includes('OTC') ? 'OTC' : 'Regular', ...b,
        alignment: b.bias === 'MISSING' || b.bias === 'NEUTRAL' ? b.bias : b.bias === o.direction ? 'ALIGNED' : 'OPPOSED' };
    });
    const coverage = symbols.map(symbol => { const cs = [...new Map((candles.get(symbol) || []).map(k => [k.t,k])).values()].sort((a,b) => a.t-b.t); return { symbol, activeId: ids.get(symbol) ?? null, candles: cs.length, first: cs[0]?.t ?? null, last: cs.at(-1)?.t ?? null, entries: rows.filter(r => r.asset === symbol).length, analyzed: rows.filter(r => r.asset === symbol && ('coverage' in r ? r.coverage === 'OK' : r.bias !== 'MISSING')).length }; });
    return reply({ start, end, split, rule: studyRule, totalAssets: universe.length, initialized, coverage, rows });
  } catch { return reply({ error: 'Historical study failed' }, 502); }
});