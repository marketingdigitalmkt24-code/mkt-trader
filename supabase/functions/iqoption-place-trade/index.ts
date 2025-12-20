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
  expiration: number; // in minutes
  signalId?: string;
}

interface IQOptionCredentials {
  email: string;
  password: string;
  account_type: string;
}

// IQ Option API endpoints
const IQ_OPTION_AUTH_URL = 'https://auth.iqoption.com/api/v2/login';
const IQ_OPTION_WS_URL = 'wss://iqoption.com/echo/websocket';

async function loginToIQOption(email: string, password: string): Promise<{ ssid: string | null; error: string | null }> {
  try {
    console.log('Attempting to login to IQ Option for trading...');
    
    const response = await fetch(IQ_OPTION_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: new URLSearchParams({
        identifier: email,
        password: password,
      }),
    });

    const data = await response.json();
    console.log('Login response status:', response.status);
    
    if (data.code === 'success' && data.ssid) {
      console.log('Login successful, SSID obtained');
      return { ssid: data.ssid, error: null };
    } else {
      console.error('Login failed:', data.message || 'Unknown error');
      return { ssid: null, error: data.message || 'Login failed' };
    }
  } catch (error) {
    console.error('Login error:', error);
    return { ssid: null, error: String(error) };
  }
}

async function placeTrade(
  ssid: string, 
  accountType: string,
  trade: TradeRequest
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  return new Promise((resolve) => {
    console.log('Connecting to IQ Option WebSocket for trading...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    let balanceId = 0;
    let tradeId: string | null = null;
    let activeAssets: Record<string, number> = {};
    let tradePlaced = false;
    
    const timeout = setTimeout(() => {
      if (!tradePlaced) {
        console.log('Trade timeout, closing connection');
        ws.close();
        resolve({ success: false, error: 'Trade timeout - asset may be closed' });
      }
    }, 20000); // 20 second timeout

    ws.onopen = () => {
      console.log('WebSocket connected, authenticating...');
      ws.send(JSON.stringify({
        name: 'ssid',
        msg: ssid,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Skip timeSync messages from logging
        if (data.name !== 'timeSync') {
          console.log('Received message:', data.name);
        }
        
        if (data.name === 'profile') {
          console.log('Authenticated! Getting balance and assets...');
          
          // Get balance based on account type
          const balances = data.msg.balances || [];
          for (const balance of balances) {
            if (accountType === 'PRACTICE' && balance.type === 4) {
              balanceId = balance.id;
              console.log('Using PRACTICE balance:', balanceId);
              break;
            } else if (accountType === 'REAL' && balance.type === 1) {
              balanceId = balance.id;
              console.log('Using REAL balance:', balanceId);
              break;
            }
          }
          
          if (!balanceId && balances.length > 0) {
            balanceId = balances[0].id;
            console.log('Using fallback balance:', balanceId);
          }
          
          // Request available assets for binary options
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'get-initialization-data',
              version: '3.0',
              body: {}
            }
          }));
        }
        
        // Handle initialization data with asset list
        if (data.name === 'initialization-data') {
          console.log('Received initialization data');
          const binary = data.msg?.binary?.actives || {};
          
          // Build active assets map
          for (const [id, info] of Object.entries(binary)) {
            const assetInfo = info as { name?: string; enabled?: boolean; is_suspended?: boolean };
            if (assetInfo.enabled && !assetInfo.is_suspended) {
              const name = assetInfo.name || '';
              activeAssets[name.toUpperCase()] = parseInt(id);
            }
          }
          
          console.log('Available assets count:', Object.keys(activeAssets).length);
          
          // Now place the trade
          placeTradeWithAssets();
        }
        
        function placeTradeWithAssets() {
          // Normalize asset name for lookup
          const assetName = trade.asset.toUpperCase().replace(/\//g, '').replace(/-/g, '');
          const assetNameWithDash = trade.asset.toUpperCase().replace(/\//g, '-');
          const assetNameSlash = trade.asset.toUpperCase();
          
          let assetId = activeAssets[assetName] || 
                        activeAssets[assetNameWithDash] || 
                        activeAssets[assetNameSlash] ||
                        activeAssets[trade.asset.toUpperCase()];
          
          // Try common OTC naming patterns
          if (!assetId) {
            const otcVariations = [
              assetName,
              assetName.replace('OTC', '-OTC'),
              assetName.replace('-OTC', 'OTC'),
              assetNameWithDash,
              assetNameSlash.replace('/', ''),
            ];
            
            for (const variation of otcVariations) {
              if (activeAssets[variation]) {
                assetId = activeAssets[variation];
                console.log(`Found asset with variation: ${variation} -> ID: ${assetId}`);
                break;
              }
            }
          }
          
          // If still not found, try partial match
          if (!assetId) {
            const baseAsset = assetName.replace('OTC', '').replace('-', '');
            for (const [name, id] of Object.entries(activeAssets)) {
              if (name.includes(baseAsset) && name.includes('OTC')) {
                assetId = id;
                console.log(`Found asset with partial match: ${name} -> ID: ${assetId}`);
                break;
              }
            }
          }
          
          if (!assetId) {
            console.error('Asset not found or not available:', trade.asset);
            console.log('Looking for:', assetName, 'in assets:', Object.keys(activeAssets).slice(0, 20));
            clearTimeout(timeout);
            ws.close();
            resolve({ success: false, error: `Asset ${trade.asset} not available for trading` });
            return;
          }
          
          // Set balance first
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'set-active-balance',
              version: '1.0',
              body: {
                balance_id: balanceId,
              },
            },
          }));
          
          // Calculate expiration time (next minute boundary + expiration minutes)
          const now = Math.floor(Date.now() / 1000);
          const nextMinute = Math.ceil(now / 60) * 60;
          const expirationTime = nextMinute + (trade.expiration * 60);
          
          console.log(`Placing ${trade.direction.toUpperCase()} trade on ${trade.asset} (ID: ${assetId})`);
          console.log(`Amount: ${trade.amount}, Expiration: ${trade.expiration} min, ExpTime: ${expirationTime}`);
          
          tradePlaced = true;
          
          // Binary option buy message - using correct format
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'binary-options.open-option',
              version: '1.0',
              body: {
                user_balance_id: balanceId,
                active_id: assetId,
                option_type_id: 3, // turbo/binary option
                direction: trade.direction,
                expired: expirationTime,
                price: trade.amount,
                profit_percent: 0, // Let server determine
              },
            },
          }));
        }
        
        // Handle successful trade responses
        if (data.name === 'binary-options.option-opened') {
          console.log('Trade opened successfully!', JSON.stringify(data.msg));
          const id = data.msg?.id || data.msg?.option_id;
          if (id) {
            tradeId = String(id);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, tradeId: tradeId });
          }
        }
        
        // Handle option message (alternative success response)
        if (data.name === 'option' && data.msg?.id) {
          console.log('Option received:', JSON.stringify(data.msg));
          // Check if this is an error or success
          if (data.msg.message && typeof data.msg.message === 'string' && data.msg.message.includes('not found')) {
            console.error('Asset error:', data.msg.message);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: false, error: data.msg.message });
          } else if (data.msg.id) {
            tradeId = String(data.msg.id);
            console.log('Trade confirmed with ID:', tradeId);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, tradeId: tradeId });
          }
        }
        
        // Handle listInfoData for getting actual tradeable assets
        if (data.name === 'listInfoData' || data.name === 'activeSchedule') {
          console.log('Received asset schedule data');
        }
        
        // Handle error responses
        if (data.name === 'binary-options.open-option') {
          if (data.msg?.result === 'error' || data.msg?.message) {
            console.error('Trade error response:', JSON.stringify(data.msg));
            clearTimeout(timeout);
            ws.close();
            resolve({ 
              success: false, 
              error: data.msg?.message || data.msg?.reason || 'Trade failed',
            });
          }
        }
        
        // Handle general errors
        if (data.name === 'error') {
          console.error('Error received:', JSON.stringify(data));
          clearTimeout(timeout);
          ws.close();
          resolve({ 
            success: false, 
            error: data.msg?.message || data.msg || 'Unknown error',
          });
        }
        
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeout);
      resolve({ success: false, error: 'WebSocket connection error' });
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

    // Parse trade request
    const tradeRequest: TradeRequest = await req.json();
    
    console.log('Received trade request:', JSON.stringify(tradeRequest));
    
    // Validate request
    if (!tradeRequest.asset || !tradeRequest.direction || !tradeRequest.amount) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields: asset, direction, amount' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get IQ Option credentials from database
    const { data: configData, error: configError } = await supabase
      .from('iqoption_config')
      .select('email, password, account_type')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (configError || !configData) {
      console.error('No IQ Option credentials found');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No IQ Option credentials configured' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const credentials: IQOptionCredentials = configData;
    
    // Login to IQ Option
    const { ssid, error: loginError } = await loginToIQOption(credentials.email, credentials.password);
    
    if (!ssid) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: loginError || 'Failed to login to IQ Option' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Place the trade
    const result = await placeTrade(ssid, credentials.account_type, tradeRequest);
    
    console.log('Trade result:', result);

    // Log the trade
    if (result.success) {
      await supabase
        .from('operation_results')
        .insert({
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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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