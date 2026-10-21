import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { sendCandleRequestBatches } from '../_shared/candle-request-batches.ts';
import { anticipationObservation, anticipationResult, type AnticipationCandle } from '../_shared/force-anticipation-test.ts';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: corsHeaders });
const bodySchema = z.object({}).strict();
const symbolOf = (raw: string) => {
  let s = raw.toUpperCase().replace('FRONT.', '');
  const otc = s.includes('-OTC');
  s = s.replace('-OTC', '').replace('-OP', '').replace(/[-\s]*BLITZ/i, '').trim();
  if (/^[A-Z]{6}$/.test(s)) s = `${s.slice(0, 3)}/${s.slice(3)}`;
  return otc ? `${s}-OTC` : s;
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply({});
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply({ error: 'Service unavailable' }, 503);
    const db = createClient(url, key);
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (!token) return reply({ error: 'Unauthorized' }, 401);
    if (token !== key) {
      const { data, error } = await db.auth.getClaims(token);
      if (error || !data?.claims?.sub) return reply({ error: 'Unauthorized' }, 401);
      const { data: role } = await db.from('user_roles').select('role').eq('user_id', data.claims.sub).eq('role', 'admin').maybeSingle();
      if (!role) return reply({ error: 'Admin required' }, 403);
    }
    if (!bodySchema.safeParse(await req.json().catch(() => null)).success) return reply({ error: 'Invalid parameters' }, 400);
    const { data: cfg } = await readMasterIQConfig(db);
    if (!cfg) return reply({ error: 'Principal connection unavailable' }, 409);
    let ssid: string | null = null;
    for (const endpoint of ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login']) {
      try {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
          body: new URLSearchParams({ identifier: cfg.email, password: cfg.password }), signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        if (d.code === 'success' && typeof d.ssid === 'string') { ssid = d.ssid; break; }
      } catch { /* bounded alternate endpoint */ }
    }
    if (!ssid) return reply({ error: 'Broker connection failed' }, 502);
    const { data: open, error: openError } = await db.from('force_anticipation_tests').select('signal_id,asset,entry_minute,entry_price,expiration_time')
      .eq('result', 'open').order('created_at').limit(1000);
    if (openError) return reply({ error: 'Test history unavailable' }, 502);
    let scanned = 0, withVolume = 0, inserted = 0, resolved = 0;
    const writes: Promise<unknown>[] = [];
    const process = async (asset: string, cs: AnticipationCandle[], isOpen: boolean) => {
      const now = Math.floor(Date.now() / 1000);
      scanned++;
      if (cs.some(k => typeof k.v === 'number' && k.v > 0)) withVolume++;
      for (const pending of (open || []).filter(o => o.asset === asset)) {
        const outcome = anticipationResult(pending, cs, now);
        if (outcome) {
          const { data } = await db.from('force_anticipation_tests').update(outcome).eq('signal_id', pending.signal_id).eq('result', 'open').select('id');
          resolved += data?.length || 0;
        } else if (now - Date.parse(pending.expiration_time) / 1000 > 600) {
          await db.from('force_anticipation_tests').update({ result: 'expired' }).eq('signal_id', pending.signal_id).eq('result', 'open');
        }
      }
      if (!isOpen) return;
      const observation = anticipationObservation(asset, cs, now);
      if (!observation) return;
      const { data, error } = await db.from('force_anticipation_tests').upsert(observation, { onConflict: 'signal_id', ignoreDuplicates: true }).select('id');
      if (error) console.error('Anticipation TEST write failed:', error.code);
      inserted += data?.length || 0;
    };
    await new Promise<void>(resolve => {
      const ws = new WebSocket('wss://iqoption.com/echo/websocket');
      const pending = new Map<string, { asset: string; isOpen: boolean }>();
      let done = false, initialized = false;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); ws.close(); resolve(); };
      const timer = setTimeout(finish, 45000);
      ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
      ws.onerror = finish;
      ws.onmessage = async ev => {
        let d; try { d = JSON.parse(ev.data); } catch { return; }
        if (d.name === 'profile') ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
        if (d.name === 'initialization-data' && !initialized) {
          initialized = true;
          const all = { ...(d.msg?.binary?.actives || {}), ...(d.msg?.turbo?.actives || {}) };
          const assets = new Map<string, { id: number; isOpen: boolean }>();
          for (const [id, value] of Object.entries(all)) {
            const a = value as { name?: string; enabled?: boolean; is_suspended?: boolean };
            if (!a.name || !Number.isFinite(Number(id))) continue;
            const asset = symbolOf(a.name), isOpen = !!a.enabled && !a.is_suspended;
            if (isOpen || (open || []).some(o => o.asset === asset)) {
              if (!assets.has(asset) || isOpen) assets.set(asset, { id: Number(id), isOpen });
            }
          }
          if (!assets.size) { finish(); return; }
          for (const [asset, info] of assets) pending.set(`a${info.id}`, { asset, isOpen: info.isOpen });
          await sendCandleRequestBatches([...assets], ([, info]) => {
            if (done || ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({ name: 'sendMessage', request_id: `a${info.id}`, msg: { name: 'get-candles', version: '2.0',
              body: { active_id: info.id, size: 60, to: Math.floor(Date.now() / 1000), count: 102 } } }));
          });
        }
        if (d.name === 'candles') {
          const info = pending.get(d.request_id); if (!info) return;
          pending.delete(d.request_id);
          const cs: AnticipationCandle[] = (d.msg?.candles || []).filter((k: any) => k.to - k.from === 60)
            .map((k: any) => ({ t: k.from, o: k.open, c: k.close, h: k.max, l: k.min,
              v: typeof k.volume === 'number' && Number.isFinite(k.volume) ? k.volume : undefined }));
          writes.push(process(info.asset, cs, info.isOpen));
          if (!pending.size) finish();
        }
      };
    });
    await Promise.all(writes);
    const summary = { success: true, scanned, withVolume, inserted, resolved, mode: 'TEST_ONLY' };
    console.log('Force anticipation TEST:', JSON.stringify(summary));
    return reply(summary);
  } catch { return reply({ error: 'Anticipation test unavailable' }, 502); }
});