import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradeRequest {
  asset: string;
  direction: 'call' | 'put';
  amount: number;
  expiration: number;
  signalId?: string;
}

interface IQOptionCredentials {
  email: string;
  password: string;
  account_type: string;
}

// IQ Option WebSocket URL
const IQ_OPTION_WS_URL = 'wss://iqoption.com/echo/websocket';

// Combined function: login and place trade in one WebSocket connection
async function loginAndPlaceTrade(
  email: string,
  password: string,
  accountType: string,
  trade: TradeRequest
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  return new Promise((resolve) => {
    console.log('Connecting to IQ Option WebSocket...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    let balanceId = 0;
    let tradeId: string | null = null;
    let activeAssets: Record<string, number> = {};
    let tradePlaced = false;
    let authenticated = false;
    
    const timeout = setTimeout(() => {
      console.log('Trade timeout');
      ws.close();
      if (!authenticated) {
        resolve({ success: false, error: 'Connection timeout - IQ Option may be unavailable' });
      } else if (!tradePlaced) {
        resolve({ success: false, error: 'Trade timeout - asset may be closed' });
      }
    }, 30000);

    ws.onopen = () => {
      console.log('WebSocket connected, authenticating...');
      // Login via WebSocket
      ws.send(JSON.stringify({
        name: 'login',
        msg: {
          email: email,
          password: password,
        }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.name !== 'timeSync') {
          console.log('Received:', data.name);
        }
        
        // Handle login response
        if (data.name === 'login') {
          if (data.msg?.ssid) {
            console.log('Login successful!');
            authenticated = true;
            ws.send(JSON.stringify({
              name: 'ssid',
              msg: data.msg.ssid,
            }));
          } else if (data.msg?.code === 'error') {
            console.error('Login failed:', data.msg);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: false, error: data.msg.message || 'Invalid credentials' });
            return;
          }
        }
        
        if (data.name === 'profile') {
          console.log('Authenticated!');
          authenticated = true;
          
          const balances = data.msg.balances || [];
          for (const balance of balances) {
            if (accountType === 'PRACTICE' && balance.type === 4) {
              balanceId = balance.id;
              break;
            } else if (accountType === 'REAL' && balance.type === 1) {
              balanceId = balance.id;
              break;
            }
          }
          
          if (!balanceId && balances.length > 0) {
            balanceId = balances[0].id;
          }
          
          console.log('Balance ID:', balanceId);
          
          // Get available assets
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'get-initialization-data',
              version: '3.0',
              body: {}
            }
          }));
        }
        
        // Handle initialization data
        if (data.name === 'initialization-data') {
          console.log('Got initialization data');
          const binary = data.msg?.binary?.actives || {};
          
          for (const [id, info] of Object.entries(binary)) {
            const assetInfo = info as { name?: string; enabled?: boolean; is_suspended?: boolean };
            if (assetInfo.enabled && !assetInfo.is_suspended) {
              const name = assetInfo.name || '';
              activeAssets[name.toUpperCase()] = parseInt(id);
            }
          }
          
          console.log('Available assets:', Object.keys(activeAssets).length);
          placeTradeWithAssets();
        }
        
        function placeTradeWithAssets() {
          const assetName = trade.asset.toUpperCase().replace(/\//g, '').replace(/-/g, '');
          const assetNameWithDash = trade.asset.toUpperCase().replace(/\//g, '-');
          const assetNameSlash = trade.asset.toUpperCase();
          
          let assetId = activeAssets[assetName] || 
                        activeAssets[assetNameWithDash] || 
                        activeAssets[assetNameSlash] ||
                        activeAssets[trade.asset.toUpperCase()];
          
          if (!assetId) {
            const otcVariations = [
              assetName,
              assetName.replace('OTC', '-OTC'),
              assetName.replace('-OTC', 'OTC'),
              assetNameWithDash,
            ];
            
            for (const variation of otcVariations) {
              if (activeAssets[variation]) {
                assetId = activeAssets[variation];
                break;
              }
            }
          }
          
          if (!assetId) {
            const baseAsset = assetName.replace('OTC', '').replace('-', '');
            for (const [name, id] of Object.entries(activeAssets)) {
              if (name.includes(baseAsset) && name.includes('OTC')) {
                assetId = id;
                break;
              }
            }
          }
          
          if (!assetId) {
            console.error('Asset not found:', trade.asset);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: false, error: `Asset ${trade.asset} not available` });
            return;
          }
          
          // Set balance
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'set-active-balance',
              version: '1.0',
              body: { balance_id: balanceId },
            },
          }));
          
          // Calculate expiration
          const now = Math.floor(Date.now() / 1000);
          const nextMinute = Math.ceil(now / 60) * 60;
          const expirationTime = nextMinute + (trade.expiration * 60);
          
          console.log(`Placing ${trade.direction} on ${trade.asset} (ID: ${assetId})`);
          tradePlaced = true;
          
          // Place trade
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'binary-options.open-option',
              version: '1.0',
              body: {
                user_balance_id: balanceId,
                active_id: assetId,
                option_type_id: 3,
                direction: trade.direction,
                expired: expirationTime,
                price: trade.amount,
                profit_percent: 0,
              },
            },
          }));
        }
        
        // Handle trade success
        if (data.name === 'binary-options.option-opened') {
          console.log('Trade opened!');
          const id = data.msg?.id || data.msg?.option_id;
          if (id) {
            tradeId = String(id);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, tradeId: tradeId });
          }
        }
        
        if (data.name === 'option' && data.msg?.id) {
          if (data.msg.message?.includes('not found')) {
            clearTimeout(timeout);
            ws.close();
            resolve({ success: false, error: data.msg.message });
          } else {
            tradeId = String(data.msg.id);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, tradeId: tradeId });
          }
        }
        
        // Handle errors
        if (data.name === 'binary-options.open-option' && data.msg?.result === 'error') {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: false, error: data.msg?.message || 'Trade failed' });
        }
        
        if (data.name === 'error') {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: false, error: data.msg?.message || 'Unknown error' });
        }
        
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeout);
      resolve({ success: false, error: 'Connection error' });
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      clearTimeout(timeout);
    };
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
    console.log('Trade request:', JSON.stringify(tradeRequest));
    
    if (!tradeRequest.asset || !tradeRequest.direction || !tradeRequest.amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get credentials
    const { data: configData, error: configError } = await supabase
      .from('iqoption_config')
      .select('email, password, account_type')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ success: false, error: 'No IQ Option credentials configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const credentials: IQOptionCredentials = configData;
    
    // Login and place trade
    const result = await loginAndPlaceTrade(
      credentials.email,
      credentials.password,
      credentials.account_type,
      tradeRequest
    );
    
    console.log('Result:', result);

    if (result.success) {
      await supabase.from('operation_results').insert({
        signal_id: tradeRequest.signalId || `manual_${Date.now()}`,
        asset: tradeRequest.asset,
        direction: tradeRequest.direction.toUpperCase(),
        entry_price: tradeRequest.amount,
        result: 'pending',
        profit: 0,
        iq_option_id: result.tradeId,
      });
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
