import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.118.0/cors';
import { isPracticeAccount, verifiedDemoBalance } from '../_shared/demo-refill.ts';

const reply = (data: object, status = 200) => Response.json(data, { status, headers: corsHeaders });

async function login(email: string, password: string): Promise<string | null> {
  for (const endpoint of ['https://auth.iqoption.com/api/v2/login', 'https://api.iqoption.com/api/v2/login']) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
        body: new URLSearchParams({ identifier: email, password }), signal: AbortSignal.timeout(8000),
      });
      const data = await response.json();
      if (data.code === 'success' && typeof data.ssid === 'string') return data.ssid;
    } catch { /* Try alternate broker login endpoint, without exposing credentials. */ }
  }
  return null;
}

async function refill(ssid: string): Promise<{ success: boolean; error?: string; balance?: number }> {
  return await new Promise(resolve => {
    const ws = new WebSocket('wss://iqoption.com/echo/websocket');
    let done = false;
    let resetSent = false;
    let acknowledged = false;
    let demoId: number | undefined;
    let profilePoll: ReturnType<typeof setInterval> | undefined;
    const finish = (result: { success: boolean; error?: string; balance?: number }) => {
      if (done) return;
      done = true; clearTimeout(timeout);
      if (profilePoll) clearInterval(profilePoll);
      ws.close(); resolve(result);
    };
    const timeout = setTimeout(() => finish({ success: false, error: 'A IQ Option não confirmou o saldo demo de 10.000 a tempo.' }), 15000);
    const getProfile = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-profile', version: '1.0' } }));
    };
    ws.onopen = () => ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.name === 'profile') {
          const balances = Array.isArray(data.msg?.balances) ? data.msg.balances : [];
          const demo = balances.find((b: { type: number; id: number }) => b.type === 4 && (demoId === undefined || b.id === demoId));
          if (!demo) { finish({ success: false, error: 'Conta demo não encontrada na IQ Option.' }); return; }
          if (!resetSent) {
            demoId = demo.id; resetSent = true;
            // Documented practice-only command; no amount, REAL balance ID or account switch.
            ws.send(JSON.stringify({ name: 'sendMessage', request_id: 'demo-refill', msg: { name: 'reset-training-balance', version: '2.0' } }));
          } else if (acknowledged && verifiedDemoBalance(demo)) {
            finish({ success: true, balance: Number(demo.amount) });
          }
        }
        if (data.name === 'training-balance-reset') {
          if (data.msg?.isSuccessful !== true) { finish({ success: false, error: 'A IQ Option recusou a recarga demo.' }); return; }
          acknowledged = true; getProfile();
          if (!profilePoll) profilePoll = setInterval(getProfile, 1000);
        }
        if (data.name === 'error') finish({ success: false, error: 'A IQ Option recusou a solicitação demo.' });
      } catch { finish({ success: false, error: 'Resposta demo inválida da IQ Option.' }); }
    };
    ws.onerror = () => finish({ success: false, error: 'Falha de conexão com a IQ Option.' });
    ws.onclose = () => { if (!done) finish({ success: false, error: 'Conexão encerrada antes da confirmação demo.' }); };
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Configuração indisponível.' }, 500);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Entre na sua conta.' }, 401);
  const db = createClient(url, key);
  const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return reply({ error: 'Sessão inválida.' }, 401);
  try {
    const body = await req.json();
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length) return reply({ error: 'Solicitação inválida.' }, 400);
    const { data: cfg, error } = await db.from('iqoption_config').select('email, password, account_type')
      .eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
    if (error || !cfg) return reply({ error: 'Configure sua própria conta IQ Option.' }, 400);
    if (!isPracticeAccount(cfg.account_type)) return reply({ error: 'Recarga permitida somente na conta DEMO.' }, 403);
    const ssid = await login(cfg.email, cfg.password);
    if (!ssid) return reply({ error: 'Não foi possível conectar à IQ Option.' }, 502);
    const result = await refill(ssid);
    return reply(result, result.success ? 200 : 502);
  } catch { return reply({ error: 'Não foi possível confirmar a recarga demo.' }, 400); }
});