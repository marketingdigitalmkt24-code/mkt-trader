import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const ENTRY_LATENCY_LEAD_MS = 120;
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { sendIQAlert, IQ_TELEGRAM_CHANNEL } from '../_shared/telegram-iq-alert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface TradeRequest {
  asset: string;
  direction: 'call' | 'put';
  amount: number;
  expiration: number;
  signalId?: string;
  isAutoTrade?: boolean;
  isAIAnalyzed?: boolean;
  timeframe?: string;
  mode?: 'option' | 'forex';
}

const payoutById: Record<number, number> = {};
let usedMode = 'binary';

interface IQOptionCredentials {
  email: string;
  password: string;
  account_type: string;
}

// Multiple IQ Option API endpoints to try
const IQ_OPTION_AUTH_URLS = [
  'https://auth.iqoption.com/api/v2/login',
  'https://api.iqoption.com/api/v2/login',
];
const IQ_OPTION_WS_URL = 'wss://iqoption.com/echo/websocket';

async function tryHttpLogin(email: string, password: string): Promise<string | null> {
  for (const url of IQ_OPTION_AUTH_URLS) {
    try {
      console.log(`🔄 Attempting HTTP login: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Origin': 'https://iqoption.com',
          'Referer': 'https://iqoption.com/',
        },
        body: new URLSearchParams({ identifier: email, password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      if (data?.code === 'success' && data?.ssid) {
        console.log('✅ HTTP login successful');
        return data.ssid;
      }
      if (data?.code === 'invalid') return null;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`❌ HTTP login failed for ${url}:`, msg);
    }
  }
  return null;
}

async function tryWsLogin(email: string, password: string): Promise<string | null> {
  try {
    console.log(`🔄 Attempting WS login: ${IQ_OPTION_WS_URL}`);
    const ssid = await new Promise<string | null>((resolve) => {
      const ws = new WebSocket(IQ_OPTION_WS_URL);
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; ws.close(); resolve(null); }
      }, 12000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ name: 'authenticate', msg: { email, password } }));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.name === 'authenticated') {
            clearTimeout(timeout); resolved = true; ws.close();
            resolve(msg.msg?.ssid || `ws-auth-${Date.now()}`);
          }
          if (msg.name === 'error' || msg.name === 'auth-error') {
            clearTimeout(timeout); resolved = true; ws.close(); resolve(null);
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => { if (!resolved) { resolved = true; ws.close(); resolve(null); } };
      ws.onclose = () => { clearTimeout(timeout); };
    });
    return ssid;
  } catch { return null; }
}

async function loginToIQOption(email: string, password: string): Promise<{ ssid: string | null; error: string | null }> {
  let ssid = await tryHttpLogin(email, password);
  if (ssid) return { ssid, error: null };
  
  console.log('🔄 HTTP failed, trying WebSocket authentication...');
  ssid = await tryWsLogin(email, password);
  if (ssid) return { ssid, error: null };
  
  return { ssid: null, error: 'Não foi possível conectar à IQ Option' };
}

// Track asset type (binary vs turbo) for correct option_type_id
interface AssetInfo {
  id: number;
  optionType: number; // 1 = binary, 3 = turbo
  turboId?: number;  // Alternative turbo ID if available
  binaryId?: number; // Alternative binary ID if available
}

async function placeTradeFireAndForget(
  ssid: string, 
  accountType: string,
  trade: TradeRequest,
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  return new Promise((resolve) => {
    console.log('📡 Connecting to IQ Option WebSocket for trading...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    let balanceId = 0;
    let tradeId: string | null = null;
    const activeAssets: Record<string, AssetInfo> = {};
    let tradePlaced = false;
    let fxSender: ((leverage: number) => void) | null = null;
    const fxLevers = [500, 300, 100, 50];
    
    // Shorter timeout - we don't wait for result, just confirmation of placement
    const timeout = setTimeout(() => {
      console.log('⏰ Trade placement timeout');
      ws.close();
      if (tradePlaced && tradeId) {
        resolve({ success: true, tradeId });
      } else {
        // Trade was NOT confirmed by IQ Option - do NOT save as pending
        console.log('❌ Trade NOT confirmed - will not save fake pending entry');
        resolve({ success: false, error: 'Trade timeout - no confirmation from IQ Option' });
      }
    }, 90000);

    ws.onopen = () => {
      console.log('🔗 WebSocket connected, authenticating...');
      ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.name === 'profile') {
          console.log('✅ Authenticated, getting assets...');
          
          const balances = data.msg.balances || [];
          for (const balance of balances) {
            if (accountType === 'PRACTICE' && balance.type === 4) {
              balanceId = balance.id; break;
            } else if (accountType === 'REAL' && balance.type === 1) {
              balanceId = balance.id; break;
            }
          }
          if (!balanceId && balances.length > 0) balanceId = balances[0].id;
          
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: { name: 'get-initialization-data', version: '3.0', body: {} }
          }));
        }
        
        if (data.name === 'initialization-data') {
          const binary = data.msg?.binary?.actives || {};
          const turbo = data.msg?.turbo?.actives || {};
          
          // Map assets with their correct option type
          function mapAssets(actives: Record<string, any>, optionType: number) {
            for (const [id, info] of Object.entries(actives)) {
              const assetInfo = info as { name?: string; enabled?: boolean; is_suspended?: boolean };
              if (!assetInfo.enabled || assetInfo.is_suspended) continue;
              
              const name = (assetInfo.name || '').toUpperCase();
              const numId = parseInt(id);
              const commission = (info as any)?.option?.profit?.commission;
              if (typeof commission === 'number') payoutById[numId] = 100 - commission;
              
              // Merge with existing entry to keep both turbo and binary IDs
              function setAsset(key: string) {
                const existing = activeAssets[key];
                if (existing) {
                  // Update with new type info
                  if (optionType === 3) existing.turboId = numId;
                  else existing.binaryId = numId;
                  // Prefer turbo for the main ID (better for short-term trades)
                  if (optionType === 3) {
                    existing.id = numId;
                    existing.optionType = 3;
                  }
                } else {
                  activeAssets[key] = { 
                    id: numId, 
                    optionType,
                    turboId: optionType === 3 ? numId : undefined,
                    binaryId: optionType === 1 ? numId : undefined,
                  };
                }
              }
              
              setAsset(name);
              
              let baseName = name.startsWith('FRONT.') ? name.replace('FRONT.', '') : name;
              const isOTC = baseName.includes('-OTC');
              const isOP = baseName.includes('-OP');
              const cleanName = baseName.replace('-OTC', '').replace('-OP', '');
              
              const withSlash = cleanName.length === 6 && /^[A-Z]{6}$/.test(cleanName)
                ? `${cleanName.slice(0, 3)}/${cleanName.slice(3)}` : null;
              
              if (isOTC) {
                [`${cleanName}-OTC`, `${cleanName} OTC`, `${cleanName}OTC`].forEach(v => setAsset(v));
                if (withSlash) {
                  [`${withSlash}-OTC`, `${withSlash} OTC`, `${withSlash}OTC`].forEach(v => setAsset(v));
                }
              } else {
                [cleanName, `${cleanName}-OP`].forEach(v => setAsset(v));
                if (withSlash) {
                  [withSlash, `${withSlash}-OP`].forEach(v => setAsset(v));
                }
              }
            }
          }
          
          // Map binary first, then turbo (turbo updates existing entries)
          mapAssets(binary, 1);
          mapAssets(turbo, 3);
          
          console.log(`📊 ${Object.keys(activeAssets).length} asset variations mapped`);
          
          // Find the asset
          const isOTCAsset = trade.asset.toUpperCase().includes('OTC');
          let cleanAsset = trade.asset.toUpperCase().replace(/[\/\- ]/g, '').replace('OTC', '');
          const withSlash = cleanAsset.length === 6 && /^[A-Z]{6}$/.test(cleanAsset)
            ? `${cleanAsset.slice(0, 3)}/${cleanAsset.slice(3)}` : cleanAsset;
          
          let searchVariations: string[];
          if (isOTCAsset) {
            searchVariations = [
              trade.asset.toUpperCase(), `${cleanAsset}-OTC`, `${cleanAsset} OTC`,
              `${withSlash}-OTC`, `${withSlash} OTC`, `FRONT.${cleanAsset}-OTC`,
            ];
          } else {
            searchVariations = [
              trade.asset.toUpperCase(), withSlash, cleanAsset,
              `${cleanAsset}-OP`, `${withSlash}-OP`, `FRONT.${cleanAsset}-OP`,
            ];
          }
          
          let foundAsset: AssetInfo | undefined;
          let matchedName = '';
          
          for (const variation of searchVariations) {
            if (variation && activeAssets[variation]) {
              foundAsset = activeAssets[variation];
              matchedName = variation;
              break;
            }
          }
          
          // OTC fallback if not found and not OTC asset
          if (!foundAsset && !isOTCAsset) {
            const otcVariations = [
              `${cleanAsset}-OTC`, `${cleanAsset} OTC`, `${withSlash}-OTC`, `${withSlash} OTC`,
            ];
            for (const v of otcVariations) {
              if (activeAssets[v]) {
                foundAsset = activeAssets[v];
                matchedName = v;
                console.log(`🔄 Using OTC fallback: ${v}`);
                break;
              }
            }
          }
          
          if (!foundAsset) {
            console.error(`❌ Asset ${trade.asset} not found. Available: ${Object.keys(activeAssets).filter(k => k.length <= 12).slice(0, 30).join(', ')}`);
            clearTimeout(timeout); ws.close();
            resolve({ success: false, error: `Asset ${trade.asset} not available` });
            return;
          }
          
          const hasTurbo = !!foundAsset.turboId;
          const hasBinary = !!foundAsset.binaryId;
          console.log(`✅ Found: "${matchedName}" -> Turbo:${foundAsset.turboId || 'N/A'}, Binary:${foundAsset.binaryId || 'N/A'}, Default:${foundAsset.id}(${foundAsset.optionType === 1 ? 'BIN' : 'TUR'})`);
          
          // Set balance
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: { name: 'set-active-balance', version: '1.0', body: { balance_id: balanceId } }
          }));
          
          // ===== FOREX (margem) alavancagem 1000x, take profit de 1000% no servidor da IQ =====
          if (trade.mode === 'forex') {
            if (isOTCAsset) {
              clearTimeout(timeout); ws.close();
              resolve({ success: false, error: 'Forex não disponível para OTC' });
              return;
            }
            usedMode = 'forex';
            tradePlaced = true;
            const sendForex = (leverage: number) => {
              console.log(`📤 FOREX ${trade.direction} ${cleanAsset} margem $${trade.amount} x${leverage} TP 1000%`);
              ws.send(JSON.stringify({
                name: 'sendMessage', request_id: 'fx1',
                msg: { name: 'place-order-temp', version: '4.0', body: {
                  user_balance_id: balanceId, client_platform_id: 9,
                  instrument_type: 'forex', instrument_id: cleanAsset,
                  side: trade.direction === 'call' ? 'buy' : 'sell', type: 'market',
                  amount: trade.amount, leverage,
                  limit_price: null, stop_price: null,
                  use_token_for_commission: false, auto_margin_call: false, use_trail_stop: false,
                  take_profit_kind: 'percent', take_profit_value: 1000,
                  stop_lose_kind: null, stop_lose_value: null,
                } },
              }));
            };
            fxSender = sendForex;
            sendForex(1000);
            // Sem resposta em 5s -> tenta próxima alavancagem
            const fxRetry = () => setTimeout(() => {
              if (!tradeId && fxLevers.length) {
                const next = fxLevers.shift()!;
                console.log(`🔄 FOREX sem resposta — tentando x${next}`);
                sendForex(next);
                fxRetry();
              }
            }, 5000);
            fxRetry();
            return;
          }

          const sendDigital = (reason: string) => {
            usedMode = 'digital';
            tradePlaced = true;
            const expMs = candleOpenMs + trade.expiration * 60000;
            const e = new Date(expMs);
            const pad = (n: number) => String(n).padStart(2, '0');
            const instrumentId = `do${foundAsset!.id}A${e.getUTCFullYear()}${pad(e.getUTCMonth()+1)}${pad(e.getUTCDate())}D${pad(e.getUTCHours())}${pad(e.getUTCMinutes())}00T${trade.expiration}M${trade.direction === 'call' ? 'C' : 'P'}SPT`;
            console.log(`📤 DIGITAL (${reason}) ${instrumentId} $${trade.amount}`);
            ws.send(JSON.stringify({
              name: 'sendMessage', request_id: 'dg1',
              msg: { name: 'digital-options.place-digital-option', version: '3.0', body: {
                user_balance_id: balanceId, instrument_id: instrumentId,
                amount: String(trade.amount), asset_id: foundAsset!.id, instrument_index: 0,
              } },
            }));
          };

          // ===== Entrada sincronizada: exatamente na ABERTURA da próxima vela (:00) =====
          // Envia ~120ms antes para compensar a latência do relay e chegar na IQ às :00.
          const nowMs0 = Date.now();
          const candleOpenMs = Math.ceil((nowMs0 + 1000) / 60000) * 60000;
          const entryDelay = Math.max(0, candleOpenMs - ENTRY_LATENCY_LEAD_MS - nowMs0);
          console.log(`⏱️ Aguardando ${(entryDelay / 1000).toFixed(1)}s para entrar na abertura da vela ${new Date(candleOpenMs).toISOString()}`);

          const fire = () => {
            const optPayout = payoutById[foundAsset!.turboId || foundAsset!.binaryId || foundAsset!.id] || 0;
            if (!hasTurbo || (optPayout > 0 && optPayout < 80)) {
              sendDigital(!hasTurbo ? 'sem turbo' : `payout ${optPayout}%`);
              return;
            }
            usedMode = 'binary';
            const expirationTime = candleOpenMs / 1000 + trade.expiration * 60;
            const useId = foundAsset!.turboId!;
            console.log(`📤 Placing ${trade.direction.toUpperCase()} on ${matchedName} | ID:${useId} | TURBO | $${trade.amount} | Exp:${trade.expiration}min | offset:${Date.now() - candleOpenMs}ms`);
            tradePlaced = true;
            ws.send(JSON.stringify({
              name: 'sendMessage',
              msg: {
                name: 'binary-options.open-option', version: '1.0',
                body: {
                  user_balance_id: balanceId, active_id: useId, option_type_id: 3,
                  direction: trade.direction, expired: expirationTime,
                  price: trade.amount, profit_percent: 0,
                },
              },
            }));
            setTimeout(() => { if (!tradeId) sendDigital('turbo sem resposta'); }, 2500);
          };
          setTimeout(fire, entryDelay);
        }

        if (data.request_id === 'fx1') console.log('📨 FOREX resposta:', JSON.stringify(data).slice(0, 400));
        else if (usedMode === 'forex' && !['heartbeat', 'timeSync', 'front'].includes(data.name)) console.log('📨 FOREX msg:', data.name, JSON.stringify(data.msg ?? {}).slice(0, 300));
        if (usedMode === 'forex' && (data.name === 'order-changed' || data.name === 'position-changed') && data.msg?.id && !tradeId) {
          tradeId = String(data.msg.id);
          console.log(`✅ FOREX aberto via ${data.name}! ID: ${tradeId}`);
          clearTimeout(timeout); ws.close();
          resolve({ success: true, tradeId });
          return;
        }
        
        // Respostas de DIGITAL / FOREX
        if (data.request_id === 'fx1' || data.request_id === 'dg1' || data.name === 'digital-option-placed') {
          const id = data.msg?.id;
          if (id) {
            tradeId = String(id);
            console.log(`✅ ${usedMode.toUpperCase()} aberto! ID: ${tradeId}`);
            clearTimeout(timeout); ws.close();
            resolve({ success: true, tradeId });
            return;
          }
          if (data.request_id === 'fx1' && fxSender && fxLevers.length && (data.msg?.message || data.status >= 400)) {
            const next = fxLevers.shift()!;
            console.log(`🔄 FOREX rejeitado (${data.msg?.message || data.status}) — tentando x${next}`);
            fxSender(next);
            return;
          }
          if (data.msg?.message || data.status >= 400) {
            console.error(`❌ ${usedMode} erro:`, JSON.stringify(data.msg));
            clearTimeout(timeout); ws.close();
            resolve({ success: false, error: data.msg?.message || `${usedMode} rejeitado` });
            return;
          }
        }

        // Trade opened successfully
        if (data.name === 'binary-options.option-opened' || data.name === 'option') {
          const id = data.msg?.id || data.msg?.option_id;
          if (id) {
            tradeId = String(id);
            console.log(`✅ Trade placed! ID: ${tradeId}`);
            clearTimeout(timeout); ws.close();
            resolve({ success: true, tradeId });
            return;
          }
        }
        
        // Handle error responses
        if (data.name === 'binary-options.open-option' && (data.msg?.result === 'error' || data.msg?.message)) {
          console.error('❌ Trade error:', JSON.stringify(data.msg));
          clearTimeout(timeout); ws.close();
          resolve({ success: false, error: data.msg?.message || data.msg?.reason || 'Trade rejected' });
          return;
        }
        
        if (data.name === 'error') {
          console.error('❌ Error:', JSON.stringify(data.msg));
          clearTimeout(timeout); ws.close();
          resolve({ success: false, error: data.msg?.message || 'Unknown error' });
          return;
        }
        
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      clearTimeout(timeout);
      resolve({ success: false, error: 'WebSocket connection error' });
    };
    ws.onclose = () => { clearTimeout(timeout); };
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tradeRequest: TradeRequest = await req.json();
    console.log('📥 Trade request:', JSON.stringify(tradeRequest));
    
    if (!tradeRequest.asset || !tradeRequest.direction || !tradeRequest.amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get IQ Option credentials
    const { data: configData } = await supabase
      .from('iqoption_config')
      .select('email, password, account_type')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!configData) {
      return new Response(
        JSON.stringify({ success: false, error: 'No IQ Option credentials configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Place trade (fire-and-forget, don't wait for result)
    // A notificação exige um sinal já autorizado pelo gerador na fila real.
    // Nenhum parâmetro enviado pelo navegador habilita alertas por si só.
    let notifyEntry: ((entryAt: number) => Promise<number | undefined>) | undefined;
    let entryStrategy: string | null = null;
    if (tradeRequest.isAutoTrade && tradeRequest.signalId && tradeRequest.mode !== 'forex'
      && tradeRequest.timeframe !== 'TEST' && tradeRequest.timeframe !== 'MT5') {
      const { data: queued } = await supabase.from('trade_queue').select('id, created_at')
        .eq('signal_id', tradeRequest.signalId).eq('asset', tradeRequest.asset)
        .eq('direction', tradeRequest.direction.toUpperCase()).eq('status', 'executing')
        .gte('created_at', new Date(Date.now() - 90000).toISOString()).limit(1).maybeSingle();
      if (queued) {
        const signalId = tradeRequest.signalId;
        // Origem informada pelo gerador autorizado (Perda anterior desativada em 15/10/2026).
        const reqStrategy = (tradeRequest as any).entryStrategy;
        if (reqStrategy === 'HISTORICO' || reqStrategy === 'TENDENCIA' || reqStrategy === 'EMPATE' || reqStrategy === 'REVERSAO_RSI' || reqStrategy === 'TENDENCIA_V1') entryStrategy = reqStrategy;
        const strategy = entryStrategy === 'HISTORICO' ? 'Histórico bom'
          : entryStrategy === 'TENDENCIA' ? 'Tendência alinhada'
          : entryStrategy === 'TENDENCIA_V1' ? 'Tendência V1'
          : entryStrategy === 'REVERSAO_RSI' ? 'Reversão RSI'
          : entryStrategy === 'EMPATE' ? 'Após empate' : 'IA';
        notifyEntry = async entryAt => {
          // Regra (16/10/2026): só envia ao Telegram quando houver OUTRO sinal
          // no mesmo minuto com a estratégia complementar (Tendência + Reversão RSI).
          // O par pode ser real (trade_queue) ou TESTE (operation_results, ativo
          // recusado pela corretora); par de teste também libera o envio e recebe
          // uma mensagem própria marcada como TESTE.
          // Tendência V1 (pedido 16/10/2026): vai ao Telegram direto, sem exigir par.
          const complementary = entryStrategy === 'TENDENCIA_V1' ? 'DIRECT'
            : entryStrategy === 'TENDENCIA' ? 'REVERSAO_RSI'
            : entryStrategy === 'REVERSAO_RSI' ? 'TENDENCIA' : null;
          if (!complementary) {
            console.log(`📵 Telegram ignorado: sinal ${signalId} (${entryStrategy}) sem estratégia complementar`);
            return undefined;
          }
          const { data: pairSignals } = await supabase.from('trade_queue').select('signal_id, entry_strategy')
            .eq('status', 'executing').neq('signal_id', signalId)
            .gte('created_at', new Date(Date.now() - 120000).toISOString()).limit(5);
          let hasComplementaryPair = complementary === 'DIRECT' || (pairSignals || []).some(p => p.entry_strategy === complementary);
          let testPair: { signal_id: string; asset: string; direction: string } | null = null;
          if (!hasComplementaryPair) {
            const { data: testPairs } = await supabase.from('operation_results')
              .select('signal_id, asset, direction')
              .eq('timeframe', 'TEST').eq('entry_strategy', complementary)
              .gte('created_at', new Date(Date.now() - 120000).toISOString())
              .order('created_at', { ascending: false }).limit(1);
            testPair = (testPairs || [])[0] || null;
            hasComplementaryPair = !!testPair;
          }
          if (!hasComplementaryPair) {
            console.log(`📵 Telegram ignorado: sinal ${signalId} (${entryStrategy}) sem par Tendência+Reversão RSI no mesmo minuto`);
            return undefined;
          }
          const messageId = await sendIQAlert({
          asset: tradeRequest.asset, direction: tradeRequest.direction,
          expiration: tradeRequest.expiration, entryAt, signalId,
          timeframe: tradeRequest.timeframe || 'M1',
          strategy,
        }, {
          lovableKey: Deno.env.get('LOVABLE_API_KEY') || '',
          telegramKey: Deno.env.get('TELEGRAM_API_KEY') || '',
          });
          if (messageId === undefined) return undefined;
          const { error: deliveryError } = await supabase.from('telegram_iq_deliveries').upsert({
            signal_id: signalId, chat_id: IQ_TELEGRAM_CHANNEL, signal_message_id: messageId, strategy,
          }, { onConflict: 'signal_id', ignoreDuplicates: true });
          if (deliveryError) throw deliveryError;
          await supabase.from('operation_results').update({ telegram_sent: true }).eq('signal_id', signalId);
          // Par de teste (ativo recusado): avisa no canal com marcação de TESTE,
          // sem registrar no ledger de resultados (não há resultado real a enviar).
          if (testPair) {
            const testEntryTime = new Date(entryAt).toLocaleTimeString('pt-BR', {
              timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
            const testText = [
              '🧪 AGÊNCIA MKT TRADER — Sinal TESTE (sem ordem real)',
              `💱 Ativo: ${testPair.asset}`,
              `🎯 Estratégia: ${complementary === 'REVERSAO_RSI' ? 'Reversão RSI' : 'Tendência alinhada'}`,
              `Direção: ${String(testPair.direction).toUpperCase() === 'CALL' ? '🟢 COMPRA (CALL)' : '🔴 VENDA (PUT)'}`,
              `⏰ Entrada prevista: ${testEntryTime} (Brasília)`,
              '⚠️ A corretora recusou este ativo; entrada apenas simulada. Sem garantia de lucro.',
            ].join('\n');
            try {
              const testResp = await fetch('https://connector-gateway.lovable.dev/telegram/sendMessage', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY') || ''}`,
                  'X-Connection-Api-Key': Deno.env.get('TELEGRAM_API_KEY') || '',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ chat_id: IQ_TELEGRAM_CHANNEL, text: testText }),
                signal: AbortSignal.timeout(8000),
              });
              if (testResp.ok) {
                await supabase.from('operation_results').update({ telegram_sent: true }).eq('signal_id', testPair.signal_id);
                console.log(`📱 Telegram TESTE enviado: ${testPair.asset} | sinal ${testPair.signal_id}`);
              } else {
                console.error(`❌ Telegram TESTE [${testResp.status}]: ${await testResp.text()}`);
              }
            } catch (e) {
              console.error('❌ Telegram TESTE:', String(e));
            }
          }
          return messageId;
        };
      }
    }
    // Telegram sai ANTES da entrada (30–60 s, pedido 15/10/2026) para entrada manual.
    // Se a IQ Option recusar a ordem, uma resposta de CANCELADO é enviada ao sinal.
    let notification: Promise<number | undefined> | undefined;
    if (notifyEntry) {
      const entryAt = Math.ceil((Date.now() + 1000) / 60000) * 60000;
      notification = notifyEntry(entryAt).catch(error => { console.error('❌ Telegram IQ:', String(error)); return undefined; });
      // @ts-ignore EdgeRuntime is available in the hosted runtime
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(notification);
    }
    const cancelAlert = async () => {
      if (!notification) return;
      const msgId = await notification;
      if (msgId === undefined) return;
      await supabase.from('telegram_iq_deliveries').update({ result_status: 'cancelled', result_sent_at: new Date().toISOString() })
        .eq('signal_id', tradeRequest.signalId!);
      await fetch('https://connector-gateway.lovable.dev/telegram/sendMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY') || ''}`,
          'X-Connection-Api-Key': Deno.env.get('TELEGRAM_API_KEY') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: IQ_TELEGRAM_CHANNEL,
          text: `🚫 SINAL CANCELADO\n💱 ${tradeRequest.asset}\n⚠️ A corretora recusou este ativo agora. Não entre nesta operação.`,
          reply_parameters: { message_id: msgId, allow_sending_without_reply: true },
        }),
      }).catch(e => console.error('❌ Telegram cancel:', String(e)));
    };
    const { ssid, error: loginError } = await loginToIQOption(configData.email, configData.password);
    if (!ssid) {
      await cancelAlert();
      return new Response(
        JSON.stringify({ success: false, error: loginError || 'Failed to login' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const result = await placeTradeFireAndForget(ssid, configData.account_type, tradeRequest);
    if (!(result.success && result.tradeId)) await cancelAlert();
    console.log('📊 Trade result:', JSON.stringify(result));

    // Save to operation_results
    if (result.success && result.tradeId) {
      const isForex = usedMode === 'forex';
      const timeframe = isForex ? 'FOREX' : (tradeRequest.timeframe || (tradeRequest.expiration <= 1 ? 'M1' : 'M5'));
      // Expiração = início do minuto de entrada (arredondado) + duração, para a sincronização achar a ordem logo ao vencer.
      const expirationIso = isForex ? null
        : new Date((Math.round(Date.now() / 60000) + (tradeRequest.expiration || 1)) * 60000).toISOString();
      
      await supabase.from('operation_results').insert({
        signal_id: tradeRequest.signalId || `auto_${Date.now()}`,
        asset: tradeRequest.asset,
        direction: tradeRequest.direction.toUpperCase(),
        entry_price: tradeRequest.amount,
        result: isForex ? 'open' : 'pending',
        profit: 0,
        iq_option_id: result.tradeId,
        is_auto_trade: tradeRequest.isAutoTrade || false,
        is_ai_analyzed: tradeRequest.isAIAnalyzed || false,
        entry_strategy: entryStrategy,
        timeframe,
        expiration_time: expirationIso,
      });
      
      console.log(`💾 Saved pending trade: ${result.tradeId}`);

      // Schedule result checks right at expiry (fast win/loss → instant post-win continuation)
      if (!isForex) {
        const expMs = expirationIso ? new Date(expirationIso).getTime() : Date.now() + 60000;
        const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/iqoption-check-results`;
        const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const delays = [1500, 4000, 8000, 14000, 25000, 45000].map(d => Math.max(0, expMs - Date.now() + d));
        const task = (async () => {
          let last = 0;
          for (const d of delays) {
            await new Promise(r => setTimeout(r, d - last));
            last = d;
            try {
              const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: '{}' });
              const j = await r.json().catch(() => ({}));
              console.log(`⚡ Fast result check (+${d}ms):`, JSON.stringify(j).slice(0, 200));
              if (j?.updatedResults > 0) break;
            } catch (e) { console.log('fast check error', e); }
          }
        })();
        // @ts-ignore EdgeRuntime exists in Supabase runtime
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(task);
      }
    }

    // Update trade_queue if this came from queue
    if (tradeRequest.signalId && tradeRequest.mode !== 'forex') {
      await supabase.from('trade_queue')
        .update({ 
          status: result.success ? 'executed' : 'failed',
          iq_option_id: result.tradeId || null,
          error: result.error || null,
          executed_at: new Date().toISOString(),
        })
        .eq('signal_id', tradeRequest.signalId)
        .eq('status', 'pending');
    }

    return new Response(
      JSON.stringify({ ...result, mode: usedMode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
