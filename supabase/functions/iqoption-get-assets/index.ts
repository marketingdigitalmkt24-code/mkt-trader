import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AvailableAsset {
  id: number;
  name: string;
  type: string;
  isOTC: boolean;
  enabled: boolean;
  payout?: number;
  isBlitz?: boolean;
  isBinary?: boolean;
  schedule?: {
    open: boolean;
    openTime?: string;
    closeTime?: string;
    tradingDays?: number[];
  };
}

// Multiple IQ Option API endpoints to try
const IQ_OPTION_AUTH_URLS = [
  'https://auth.iqoption.com/api/v2/login',
  'https://api.iqoption.com/api/v2/login',
  'https://iqoption.com/api/v2/login',
];

const IQ_OPTION_WS_URLS = [
  'wss://iqoption.com/echo/websocket',
  'wss://ws.iqoption.com/echo/websocket',
];

// Try to login using multiple endpoints with timeout
async function tryHttpLogin(email: string, password: string): Promise<string | null> {
  for (const authUrl of IQ_OPTION_AUTH_URLS) {
    try {
      console.log(`🔄 Trying HTTP login at: ${authUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          identifier: email,
          password: password,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const data = await response.json();
      
      if (data.code === 'success' && data.ssid) {
        console.log(`✅ Login successful via ${authUrl}`);
        return data.ssid;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed with ${authUrl}:`, errMsg);
      continue;
    }
  }
  return null;
}

// Teste da entrada nas velas de 1 min das últimas 24h do ativo:
// tendência (EMA9 vs EMA21) + vela fechada a favor → a vela SEGUINTE fechou a favor?
function backtest24(cs: { o: number; h: number; l: number; c: number }[]) {
  const out = { CALL: { w: 0, l: 0 }, PUT: { w: 0, l: 0 }, n: cs.length };
  const v = cs.slice(0, -1).filter(k => [k.o, k.h, k.l, k.c].every(x => typeof x === 'number'));
  if (v.length < 30) return out;
  const ema = (p: number) => { const a = 2 / (p + 1); const r: number[] = []; v.forEach((k, i) => r.push(i ? k.c * a + r[i - 1] * (1 - a) : k.c)); return r; };
  const e9 = ema(9), e21 = ema(21);
  for (let i = 21; i < v.length - 1; i++) {
    const k = v[i], n = v[i + 1];
    if (n.c === n.o || k.c === k.o) continue;
    const dir = e9[i] > e21[i] && k.c > k.o && k.c > e9[i] ? 'CALL' : e9[i] < e21[i] && k.c < k.o && k.c < e9[i] ? 'PUT' : null;
    if (!dir) continue;
    const win = dir === 'CALL' ? n.c > n.o : n.c < n.o;
    if (win) out[dir].w++; else out[dir].l++;
  }
  return out;
}

// Get assets via WebSocket using SSID
async function getAssetsViaWs(ssid: string, withCandles = false): Promise<{ assets: AvailableAsset[]; error: string | null }> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      console.log(`📡 Connecting to ${wsUrl} for assets...`);
      
      const result = await new Promise<{ assets: AvailableAsset[]; error: string | null }>((resolve) => {
        const ws = new WebSocket(wsUrl);
        const assets: AvailableAsset[] = [];
        let resolved = false;
        const reqMap = new Map<string, AvailableAsset>();
        let pendingCandles = 0;
        let candleTimer: number | null = null;
        let pendingAssets: AvailableAsset[] = [];
        let finishFn: (() => void) | null = null;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ assets: [], error: 'Timeout' });
          }
        }, 28000);

        ws.onopen = () => {
          console.log('✅ WebSocket connected, authenticating...');
          ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.name === 'profile') {
              console.log('✅ Authenticated! Requesting assets...');
              ws.send(JSON.stringify({
                name: 'sendMessage',
                msg: { name: 'get-initialization-data', version: '3.0', body: {} }
              }));
            }
            
            if (data.name === 'initialization-data') {
              console.log('📊 Received initialization data');
              resolved = true;
              
              const binary = data.msg?.binary?.actives || {};
              const turbo = data.msg?.turbo?.actives || {};
              const turboIds = new Set(Object.keys(turbo));
              const binaryIds = new Set(Object.keys(binary));
              const allActives = { ...binary, ...turbo };
              
              for (const [id, info] of Object.entries(allActives)) {
                const assetInfo = info as any;
                const isOpen = assetInfo.enabled && !assetInfo.is_suspended;
                const rawName = assetInfo.name || '';
                
                // Normalizar nome do ativo para formato padrão (ex: FRONT.GBPJPY-OP -> GBP/JPY)
                let name = rawName.toUpperCase();
                
                // Remover prefixo FRONT.
                if (name.startsWith('FRONT.')) {
                  name = name.replace('FRONT.', '');
                }
                
                // Detectar tipo OTC
                const isOTC = name.includes('-OTC') || rawName.toLowerCase().includes('otc');
                
                // Remover sufixos -OTC e -OP
                let cleanName = name.replace('-OTC', '').replace('-OP', '');
                
                // Converter para formato com slash se for par de moedas (6 caracteres)
                if (cleanName.length === 6 && /^[A-Z]{6}$/.test(cleanName)) {
                  cleanName = `${cleanName.slice(0, 3)}/${cleanName.slice(3)}`;
                }
                
                // Adicionar sufixo OTC se necessário
                if (isOTC) {
                  cleanName = `${cleanName} OTC`;
                }
                
                const isBlitz = turboIds.has(id);
                const isBinaryAsset = binaryIds.has(id);
                
                let type = 'forex';
                if (isOTC) type = 'otc';
                else if (cleanName.includes('BTC') || cleanName.includes('ETH') || cleanName.includes('LTC') || cleanName.includes('XRP')) type = 'crypto';
                else if (isBlitz) type = 'blitz';
                
                const payout = assetInfo.option?.profit?.commission || assetInfo.profit_percent || 0;
                
                let tradingSchedule: AvailableAsset['schedule'] = { open: isOpen };
                if (isOTC || type === 'crypto') {
                  tradingSchedule = { open: isOpen, tradingDays: [0, 1, 2, 3, 4, 5, 6] };
                } else {
                  tradingSchedule = { open: isOpen, tradingDays: [1, 2, 3, 4, 5] };
                }
                
                if (assetInfo.enabled !== false) {
                  assets.push({
                    id: parseInt(id), 
                    name: cleanName,  // Nome normalizado
                    type, 
                    isOTC, 
                    enabled: isOpen,
                    payout, 
                    isBlitz, 
                    isBinary: isBinaryAsset, 
                    schedule: tradingSchedule,
                  });
                }
              }
              
              assets.sort((a, b) => (b.payout || 0) - (a.payout || 0));
              console.log(`✅ Found ${assets.length} assets`);

              if (!withCandles) {
                clearTimeout(timeout);
                ws.close();
                resolve({ assets, error: null });
              } else {
                // Velas REAIS da própria IQ Option (essencial p/ OTC, cujo preço é sintético)
                const open = assets.filter(a => a.enabled && a.schedule?.open !== false).sort((x, y) => Number(x.isOTC) - Number(y.isOTC)).slice(0, 120);
                const uniq = new Map<number, AvailableAsset>();
                open.forEach(a => uniq.set(a.id, a));
                pendingCandles = uniq.size * 2;
                const nowSec = Math.floor(Date.now() / 1000);
                // 24h de velas de 1 min = 1440; a IQ entrega no máx. 1000 por pedido → 2 pedidos
                for (const a of uniq.values()) {
                  reqMap.set(`c${a.id}`, a);
                  reqMap.set(`d${a.id}`, a);
                  ws.send(JSON.stringify({ name: 'sendMessage', request_id: `c${a.id}`, msg: { name: 'get-candles', version: '2.0', body: { active_id: a.id, size: 60, to: nowSec, count: 1000 } } }));
                  ws.send(JSON.stringify({ name: 'sendMessage', request_id: `d${a.id}`, msg: { name: 'get-candles', version: '2.0', body: { active_id: a.id, size: 60, to: nowSec - 60000, count: 440 } } }));
                }
                const finish = () => {
                  for (const a of uniq.values()) {
                    const x = a as any;
                    const merged = [...(x._old || []), ...(x._new || [])].sort((p: any, q: any) => p.t - q.t)
                      .filter((k: any, i: number, arr: any[]) => i === 0 || k.t !== arr[i - 1].t);
                    if (x._new) x.candles = x._new.slice(-120);
                    if (merged.length) x.bt24 = backtest24(merged);
                    delete x._old; delete x._new;
                  }
                };
                finishFn = finish;
                candleTimer = setTimeout(() => { clearTimeout(timeout); ws.close(); finish(); resolve({ assets, error: null }); }, 18000);
                pendingAssets = assets;
              }
            }

            if (data.name === 'candles' && withCandles && data.request_id && reqMap.has(data.request_id)) {
              const a = reqMap.get(data.request_id)! as any;
              const cs = data.msg?.candles || [];
              const all = cs.map((c: any) => ({ t: c.from, o: c.open, h: c.max, l: c.min, c: c.close }));
              if (String(data.request_id).startsWith('c')) a._new = all; else a._old = all;
              pendingCandles--;
              if (pendingCandles <= 0 && candleTimer) {
                clearTimeout(candleTimer); clearTimeout(timeout); ws.close();
                finishFn?.();
                console.log(`🕯️ Velas IQ (24h) recebidas para ${reqMap.size / 2} ativos`);
                resolve({ assets: pendingAssets, error: null });
              }
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };

        ws.onerror = () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve({ assets: [], error: 'WebSocket error' });
          }
        };

        ws.onclose = () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve({ assets: [], error: 'Connection closed' });
          }
        };
      });
      
      if (result.assets.length > 0) {
        return result;
      }
    } catch (error) {
      console.log(`❌ WebSocket failed with ${wsUrl}`);
      continue;
    }
  }
  
  return { assets: [], error: 'Could not connect to IQ Option' };
}

// Try WebSocket-only authentication (when HTTP is blocked)
async function tryWsOnlyAuth(email: string, password: string): Promise<{ assets: AvailableAsset[]; error: string | null }> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      console.log(`🔄 Trying WS-only auth at: ${wsUrl}`);
      
      const result = await new Promise<{ assets: AvailableAsset[]; error: string | null }>((resolve) => {
        const ws = new WebSocket(wsUrl);
        const assets: AvailableAsset[] = [];
        let resolved = false;
        let authenticated = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ assets: [], error: 'Timeout' });
          }
        }, 20000);

        ws.onopen = () => {
          console.log('📡 WS connected, sending credentials...');
          ws.send(JSON.stringify({
            name: 'authenticate',
            msg: { email, password }
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.name === 'authenticated' || data.name === 'profile') {
              if (!authenticated) {
                authenticated = true;
                console.log('✅ Authenticated via WS, getting assets...');
                ws.send(JSON.stringify({
                  name: 'sendMessage',
                  msg: { name: 'get-initialization-data', version: '3.0', body: {} }
                }));
              }
            }
            
            if (data.name === 'initialization-data' && authenticated) {
              resolved = true;
              
              const binary = data.msg?.binary?.actives || {};
              const turbo = data.msg?.turbo?.actives || {};
              const turboIds = new Set(Object.keys(turbo));
              const binaryIds = new Set(Object.keys(binary));
              const allActives = { ...binary, ...turbo };
              
              for (const [id, info] of Object.entries(allActives)) {
                const assetInfo = info as any;
                const isOpen = assetInfo.enabled && !assetInfo.is_suspended;
                const rawName = assetInfo.name || '';
                
                // Normalizar nome do ativo para formato padrão
                let name = rawName.toUpperCase();
                if (name.startsWith('FRONT.')) {
                  name = name.replace('FRONT.', '');
                }
                
                const isOTC = name.includes('-OTC') || rawName.toLowerCase().includes('otc');
                let cleanName = name.replace('-OTC', '').replace('-OP', '');
                
                // Converter para formato com slash se for par de moedas
                if (cleanName.length === 6 && /^[A-Z]{6}$/.test(cleanName)) {
                  cleanName = `${cleanName.slice(0, 3)}/${cleanName.slice(3)}`;
                }
                
                if (isOTC) {
                  cleanName = `${cleanName} OTC`;
                }
                
                const isBlitz = turboIds.has(id);
                const isBinaryAsset = binaryIds.has(id);
                
                let type = 'forex';
                if (isOTC) type = 'otc';
                else if (cleanName.includes('BTC') || cleanName.includes('ETH') || cleanName.includes('LTC') || cleanName.includes('XRP')) type = 'crypto';
                else if (isBlitz) type = 'blitz';
                
                const payout = assetInfo.option?.profit?.commission || assetInfo.profit_percent || 0;
                
                if (assetInfo.enabled !== false) {
                  assets.push({
                    id: parseInt(id), 
                    name: cleanName, 
                    type, 
                    isOTC, 
                    enabled: isOpen,
                    payout, 
                    isBlitz, 
                    isBinary: isBinaryAsset,
                    schedule: { open: isOpen, tradingDays: isOTC || type === 'crypto' ? [0,1,2,3,4,5,6] : [1,2,3,4,5] },
                  });
                }
              }
              
              assets.sort((a, b) => (b.payout || 0) - (a.payout || 0));
              console.log(`✅ Found ${assets.length} assets via WS-only`);
              
              clearTimeout(timeout);
              ws.close();
              resolve({ assets, error: null });
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };

        ws.onerror = () => {
          if (!resolved) { clearTimeout(timeout); resolved = true; resolve({ assets: [], error: 'WS error' }); }
        };
        ws.onclose = () => {
          if (!resolved) { clearTimeout(timeout); resolved = true; resolve({ assets: [], error: 'Closed' }); }
        };
      });
      
      if (result.assets.length > 0) return result;
    } catch (error) {
      continue;
    }
  }
  return { assets: [], error: 'All connection methods failed' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    let withCandles = false;
    try { const b = await req.json(); withCandles = !!b?.withCandles; } catch { /* sem body */ }

    const { data: configData, error: configError } = await supabase
      .from('iqoption_config')
      .select('email, password, account_type')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ success: false, error: 'No IQ Option credentials configured', assets: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Strategy 1: Try HTTP login first
    const ssid = await tryHttpLogin(configData.email, configData.password);
    
    if (ssid) {
      const { assets, error } = await getAssetsViaWs(ssid, withCandles);
      if (assets.length > 0) {
        const grouped = {
          blitz: assets.filter(a => a.isBlitz && !a.isOTC),
          binary: assets.filter(a => a.isBinary && !a.isOTC && !a.isBlitz),
          otc: assets.filter(a => a.isOTC),
          forex: assets.filter(a => a.type === 'forex' && !a.isOTC),
          crypto: assets.filter(a => a.type === 'crypto'),
        };
        
        return new Response(
          JSON.stringify({ success: true, assets, grouped, timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Strategy 2: Try WebSocket-only authentication
    console.log('🔄 HTTP failed, trying WS-only auth...');
    const wsResult = await tryWsOnlyAuth(configData.email, configData.password);
    
    if (wsResult.assets.length > 0) {
      const grouped = {
        blitz: wsResult.assets.filter(a => a.isBlitz && !a.isOTC),
        binary: wsResult.assets.filter(a => a.isBinary && !a.isOTC && !a.isBlitz),
        otc: wsResult.assets.filter(a => a.isOTC),
        forex: wsResult.assets.filter(a => a.type === 'forex' && !a.isOTC),
        crypto: wsResult.assets.filter(a => a.type === 'crypto'),
      };
      
      return new Response(
        JSON.stringify({ success: true, assets: wsResult.assets, grouped, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: wsResult.error || 'Connection failed', assets: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, assets: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
