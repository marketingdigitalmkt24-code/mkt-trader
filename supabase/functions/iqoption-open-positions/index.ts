import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function login(email: string, password: string): Promise<string | null> {
  for (const url of ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login']) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        body: new URLSearchParams({ identifier: email, password }),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      if (d.code === 'success' && d.ssid) return d.ssid;
    } catch (_) { /* next */ }
  }
  return null;
}

interface OpenPos { id: string; type: string; asset: string; direction: string; invest: number; pnl: number; openedAt: number | null; expiresAt: number | null; }

const fmtAsset = (raw: string) => {
  const s = String(raw || '').toUpperCase().replace('FRONT.', '').replace('-OP', '');
  const otc = s.includes('-OTC');
  const c = s.replace('-OTC', '');
  const p = /^[A-Z]{6}$/.test(c) ? `${c.slice(0, 3)}/${c.slice(3)}` : c;
  return otc ? `${p} OTC` : p;
};

/** Ordens abertas por este app na IQ Option: id da corretora + dados próprios do registro. */
interface AppOrder { id: string; asset: string; direction: string; invest: number; cohort: 'demo' | 'principal'; }

async function loadAppOrders(supabase: ReturnType<typeof createClient>): Promise<Map<string, AppOrder>> {
  const out = new Map<string, AppOrder>();
  const add = (id: unknown, asset: unknown, direction: unknown, invest: unknown, cohort: AppOrder['cohort']) => {
    if (id === null || id === undefined || id === '') return;
    const key = String(id).trim();
    if (!key) return;
    const dir = String(direction || '').toUpperCase();
    if (!out.has(key)) {
      out.set(key, {
        id: key,
        asset: fmtAsset(String(asset ?? '')),
        direction: dir === 'PUT' || dir === 'SELL' || dir === 'DOWN' ? 'PUT' : 'CALL',
        invest: Number(invest ?? 0) || 0,
        cohort,
      });
    }
  };

  const demo = await supabase.from('iq_demo_test_orders')
    .select('iq_option_id, asset, direction, amount')
    .eq('status', 'confirmed').not('iq_option_id', 'is', null)
    .order('created_at', { ascending: false }).limit(400);
  for (const r of demo.data || []) add(r.iq_option_id, r.asset, r.direction, r.amount, 'demo');

  const res = await supabase.from('operation_results')
    .select('iq_option_id, asset, direction, signal_id, timeframe')
    .not('iq_option_id', 'is', null).neq('timeframe', 'TEST').neq('timeframe', 'MT5')
    .order('created_at', { ascending: false }).limit(400);
  for (const r of res.data || []) {
    const sig = String(r.signal_id || '');
    if (sig.startsWith('copy-') || sig.startsWith('sim-') || sig.startsWith('mt5-')) continue;
    add(r.iq_option_id, r.asset, r.direction, 0, 'principal');
  }

  const queue = await supabase.from('trade_queue')
    .select('iq_option_id, asset, direction, amount')
    .not('iq_option_id', 'is', null)
    .order('created_at', { ascending: false }).limit(400);
  for (const r of queue.data || []) add(r.iq_option_id, r.asset, r.direction, r.amount, 'principal');

  const stp = await supabase.from('stop_target_positions')
    .select('iq_order_id, iq_position_id, symbol, direction, iq_amount')
    .order('opened_at', { ascending: false }).limit(200);
  for (const r of stp.data || []) {
    add(r.iq_order_id, r.symbol, r.direction, r.iq_amount, 'principal');
    add(r.iq_position_id, r.symbol, r.direction, r.iq_amount, 'principal');
  }

  return out;
}

/** Coleta ids primitivos de um objeto da corretora para comparar com os ids deste app. */
function collectPrimitives(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || out.size > 400 || value === null || value === undefined) return;
  if (typeof value === 'number') { if (Number.isFinite(value)) out.add(String(value)); return; }
  if (typeof value === 'string') { if (value.length <= 64) out.add(value); return; }
  if (Array.isArray(value)) { for (const v of value) collectPrimitives(v, out, depth + 1); return; }
  if (typeof value === 'object') { for (const v of Object.values(value as Record<string, unknown>)) collectPrimitives(v, out, depth + 1); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    // Conta principal (admin) — nunca a conexão de um cliente.
    const { data: cfg } = await supabase.rpc('get_master_iq_config').maybeSingle<{ email: string; password: string; account_type: string }>();
    if (!cfg) return json({ success: false, error: 'IQ Option não configurada', positions: [] });
    const ssid = await login(cfg.email, cfg.password);
    if (!ssid) return json({ success: false, error: 'Falha no login', positions: [] });

    // Somente ordens abertas por este app são exibidas; o id da corretora é o vínculo exato.
    const appOrders = await loadAppOrders(supabase);

    const assetNames: Record<number, string> = {};
    const positions: OpenPos[] = [];
    const closedForex: { id: string; pnl: number }[] = [];
    const toClose: string[] = [];
    const foreignIds: string[] = [];
    const debugInfo: { brokerId: string; matched: boolean; ids: string[] }[] = [];


    await new Promise<void>((resolve) => {
      const ws = new WebSocket('wss://iqoption.com/echo/websocket');
      let balanceId = 0;
      const done = () => { try { ws.close(); } catch (_) { /**/ } resolve(); };
      const t = setTimeout(done, 12000);
      const send = (rid: string, name: string, version: string, body: unknown) =>
        ws.send(JSON.stringify({ name: 'sendMessage', request_id: rid, msg: { name, version, body } }));

      ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (d.name === 'profile') {
            const bals = d.msg?.balances || [];
            const want = cfg.account_type === 'REAL' ? 1 : 4;
            balanceId = (bals.find((b: any) => b.type === want) || bals[0])?.id || 0;
            send('init', 'get-initialization-data', '3.0', {});
          }
          if (d.name === 'initialization-data') {
            for (const grp of [d.msg?.binary?.actives || {}, d.msg?.turbo?.actives || {}]) {
              for (const [id, a] of Object.entries(grp)) assetNames[Number(id)] = (a as any).name;
            }
            send('open', 'portfolio.get-positions', '4.0', {
              user_balance_id: balanceId,
              instrument_types: ['forex', 'digital-option', 'turbo-option', 'binary-option'],
              limit: 100, offset: 0,
            });
            send('hist', 'portfolio.get-history-positions', '2.0', {
              user_balance_id: balanceId, instrument_types: ['forex'], limit: 50, offset: 0,
            });
          }
          if (d.request_id === 'open' && d.msg) {
            for (const p of d.msg.positions || []) {
              const type = p.instrument_type || p.type;
              const invest = Number(p.invest ?? p.margin ?? p.raw_event?.margin ?? 0);
              const pnl = Number(p.pnl ?? p.pnl_net ?? 0);
              const activeId = Number(p.active_id ?? p.instrument_active_id ?? p.raw_event?.instrument_active_id ?? 0);
              const dir = String(p.direction || p.side || p.raw_event?.side || p.raw_event?.instrument_dir || '').toLowerCase();
              const brokerId = String(p.id ?? p.external_id);

              // Vínculo exato: a posição só aparece se este app abriu aquela ordem na corretora.
              const posIds = new Set<string>();
              collectPrimitives(p, posIds);
              const app = appOrders.get(brokerId) || [...appOrders.values()].find((o) => posIds.has(o.id));

              if (!app) {
                foreignIds.push(brokerId);
                continue;
              }

              const pos: OpenPos = {
                id: brokerId,
                type,
                asset: app.asset || fmtAsset(assetNames[activeId] || p.instrument_id || p.raw_event?.instrument_id || ''),
                direction: app.direction || (dir.includes('buy') || dir.includes('call') ? 'CALL' : 'PUT'),
                invest: app.invest || invest,
                pnl,
                openedAt: p.open_time ?? p.create_at ?? null,
                expiresAt: p.expiration_time ?? p.raw_event?.instrument_expiration ?? null,
              };
              positions.push(pos);
              // Forex: fecha se lucro >= 1000% da margem (x10, backup do take profit)
              if (type === 'forex' && invest > 0 && pnl >= invest * 10) toClose.push(pos.id);
            }
            for (const id of toClose) send(`close-${id}`, 'close-position', '1.0', { position_id: Number(id) });
            if (toClose.length === 0) setTimeout(done, 1500);
            else setTimeout(done, 3000);
          }
          if (d.request_id === 'hist' && d.msg) {
            for (const p of d.msg.positions || []) {
              const ids = [p.id, p.external_id, p.raw_event?.order_ids?.[0]].filter(Boolean).map(String);
              const pnl = Number(p.pnl_net ?? p.pnl_realized ?? p.pnl ?? p.close_profit ?? 0);
              for (const id of ids) closedForex.push({ id, pnl });
            }
          }
        } catch (_) { /**/ }
      };
      ws.onerror = () => { clearTimeout(t); done(); };
    });

    // Atualiza registros FOREX fechados no banco
    const { data: openRows } = await supabase.from('operation_results').select('id, iq_option_id').eq('timeframe', 'FOREX').eq('result', 'open');
    const openIds = new Set(positions.filter(p => p.type === 'forex').map(p => p.id));
    for (const row of openRows || []) {
      const closed = closedForex.find(c => c.id === row.iq_option_id);
      const justClosed = positions.find(p => toClose.includes(p.id) && p.id === row.iq_option_id);
      const pnl = justClosed ? justClosed.pnl : closed?.pnl;
      if (pnl !== undefined && !openIds.has(String(row.iq_option_id)) || justClosed) {
        const v = Math.round(Number(pnl) * 100) / 100;
        await supabase.from('operation_results').update({ result: v > 0 ? 'win' : v < 0 ? 'loss' : 'tie', profit: v }).eq('id', row.id);
      }
    }

    return json({
      success: true,
      positions: positions.filter(p => !toClose.includes(p.id)),
      closed: toClose.length,
      skipped: foreignIds.length,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'erro', positions: [] });
  }
});
