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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { data: cfg } = await supabase.from('iqoption_config').select('email,password,account_type').eq('is_active', true).limit(1).maybeSingle();
    if (!cfg) return json({ success: false, error: 'IQ Option não configurada', positions: [] });
    const ssid = await login(cfg.email, cfg.password);
    if (!ssid) return json({ success: false, error: 'Falha no login', positions: [] });

    const assetNames: Record<number, string> = {};
    const positions: OpenPos[] = [];
    const closedForex: { id: string; pnl: number }[] = [];
    const toClose: string[] = [];

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
              const pos: OpenPos = {
                id: String(p.id ?? p.external_id),
                type,
                asset: fmtAsset(assetNames[activeId] || p.instrument_id || p.raw_event?.instrument_id || ''),
                direction: dir.includes('buy') || dir.includes('call') ? 'CALL' : 'PUT',
                invest, pnl,
                openedAt: p.open_time ?? p.create_at ?? null,
                expiresAt: p.expiration_time ?? p.raw_event?.instrument_expiration ?? null,
              };
              positions.push(pos);
              // Forex: fecha se lucro >= 100% da margem (backup do take profit)
              if (type === 'forex' && invest > 0 && pnl >= invest) toClose.push(pos.id);
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

    return json({ success: true, positions: positions.filter(p => !toClose.includes(p.id)), closed: toClose.length, timestamp: new Date().toISOString() });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'erro', positions: [] });
  }
});
