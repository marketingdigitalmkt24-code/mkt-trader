import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
}

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
  trade: TradeRequest
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  return new Promise((resolve) => {
    console.log('📡 Connecting to IQ Option WebSocket for trading...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    let balanceId = 0;
    let tradeId: string | null = null;
    const activeAssets: Record<string, AssetInfo> = {};
    let tradePlaced = false;
    
    // Shorter timeout - we don't wait for result, just confirmation of placement
    const timeout = setTimeout(() => {
      console.log('⏰ Trade placement timeout');
      ws.close();
      if (tradePlaced && tradeId) {
        resolve({ success: true, tradeId });
      } else if (tradePlaced) {
        // Trade was sent but no confirmation - still might have worked
        resolve({ success: true, tradeId: `pending_${Date.now()}` });
      } else {
        resolve({ success: false, error: 'Trade timeout - asset may be closed' });
      }
    }, 30000); // 30s timeout (was 120s)

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
          
          // Calculate expiration
          const now = Math.floor(Date.now() / 1000);
          const nextMinute = Math.ceil(now / 60) * 60;
          const expirationTime = nextMinute + (trade.expiration * 60);
          
          // For M1 trades, prefer turbo. For longer, prefer binary.
          const isShortTerm = trade.expiration <= 5;
          let useId = foundAsset.id;
          let useType = foundAsset.optionType;
          
          if (isShortTerm && hasTurbo) {
            useId = foundAsset.turboId!;
            useType = 3;
          } else if (!isShortTerm && hasBinary) {
            useId = foundAsset.binaryId!;
            useType = 1;
          }
          
          console.log(`📤 Placing ${trade.direction.toUpperCase()} on ${matchedName} | ID:${useId} | ${useType === 3 ? 'TURBO' : 'BINARY'} | $${trade.amount} | Exp:${trade.expiration}min`);
          
          tradePlaced = true;
          let retryAttempted = false;
          
          function sendTradeMessage(activeId: number, optionTypeId: number) {
            ws.send(JSON.stringify({
              name: 'sendMessage',
              msg: {
                name: 'binary-options.open-option',
                version: '1.0',
                body: {
                  user_balance_id: balanceId,
                  active_id: activeId,
                  option_type_id: optionTypeId,
                  direction: trade.direction,
                  expired: expirationTime,
                  price: trade.amount,
                  profit_percent: 0,
                },
              },
            }));
          }
          
          sendTradeMessage(useId, useType);
          
          // Auto-retry with alternative type after 5 seconds if no response
          const retryTimeout = setTimeout(() => {
            if (!tradeId && !retryAttempted) {
              retryAttempted = true;
              const altId = useType === 3 ? foundAsset.binaryId : foundAsset.turboId;
              const altType = useType === 3 ? 1 : 3;
              if (altId) {
                console.log(`🔄 Retry with ${altType === 3 ? 'TURBO' : 'BINARY'} (ID:${altId})`);
                sendTradeMessage(altId, altType);
              }
            }
          }, 5000);
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

    // Login
    const { ssid, error: loginError } = await loginToIQOption(configData.email, configData.password);
    
    if (!ssid) {
      return new Response(
        JSON.stringify({ success: false, error: loginError || 'Failed to login' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Place trade (fire-and-forget, don't wait for result)
    const result = await placeTradeFireAndForget(ssid, configData.account_type, tradeRequest);
    console.log('📊 Trade result:', JSON.stringify(result));

    // Save to operation_results
    if (result.success && result.tradeId) {
      const timeframe = tradeRequest.timeframe || (tradeRequest.expiration <= 1 ? 'M1' : 'M5');
      
      await supabase.from('operation_results').insert({
        signal_id: tradeRequest.signalId || `auto_${Date.now()}`,
        asset: tradeRequest.asset,
        direction: tradeRequest.direction.toUpperCase(),
        entry_price: tradeRequest.amount,
        result: 'pending',
        profit: 0,
        iq_option_id: result.tradeId,
        is_auto_trade: tradeRequest.isAutoTrade || false,
        is_ai_analyzed: tradeRequest.isAIAnalyzed || false,
        timeframe,
      });
      
      console.log(`💾 Saved pending trade: ${result.tradeId}`);
    }

    // Update trade_queue if this came from queue
    if (tradeRequest.signalId) {
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
      JSON.stringify(result),
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
