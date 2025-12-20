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

// Asset ID mapping (common OTC assets)
const ASSET_IDS: Record<string, number> = {
  'EURUSD': 1,
  'EURUSD-OTC': 76,
  'EURGBP': 2,
  'EURGBP-OTC': 77,
  'GBPJPY': 6,
  'GBPJPY-OTC': 86,
  'USDJPY': 7,
  'USDJPY-OTC': 87,
  'AUDUSD': 8,
  'AUDUSD-OTC': 88,
  'GBPUSD': 5,
  'GBPUSD-OTC': 85,
  'USDCHF': 9,
  'USDCHF-OTC': 89,
  'NZDUSD': 10,
  'NZDUSD-OTC': 90,
  'USDCAD': 11,
  'USDCAD-OTC': 91,
  'EURJPY': 3,
  'EURJPY-OTC': 83,
  'AUDCAD': 12,
  'AUDCAD-OTC': 92,
  'AUDJPY': 13,
  'AUDJPY-OTC': 93,
  'CADJPY': 14,
  'CADJPY-OTC': 94,
  'CHFJPY': 15,
  'CHFJPY-OTC': 95,
  'EURAUD': 16,
  'EURAUD-OTC': 96,
  'EURCAD': 17,
  'EURCAD-OTC': 97,
  'GBPAUD': 18,
  'GBPAUD-OTC': 98,
  'GBPCAD': 19,
  'GBPCAD-OTC': 99,
};

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

function getAssetId(asset: string): number {
  // Normalize asset name
  const normalized = asset.toUpperCase().replace(/\//g, '');
  return ASSET_IDS[normalized] || 0;
}

async function placeTrade(
  ssid: string, 
  accountType: string,
  trade: TradeRequest
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  return new Promise((resolve) => {
    console.log('Connecting to IQ Option WebSocket for trading...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    let isAuthenticated = false;
    let balanceId = 0;
    let tradeId: string | null = null;
    
    const timeout = setTimeout(() => {
      console.log('Trade timeout, closing connection');
      ws.close();
      resolve({ success: false, error: 'Trade timeout' });
    }, 15000); // 15 second timeout

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
        
        if (data.name === 'profile') {
          isAuthenticated = true;
          console.log('Authenticated! Getting balance info...');
          
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
            // Fallback to first available balance
            balanceId = balances[0].id;
            console.log('Using fallback balance:', balanceId);
          }
          
          // Set balance
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
          
          // Place the trade
          const assetId = getAssetId(trade.asset);
          if (!assetId) {
            console.error('Unknown asset:', trade.asset);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: false, error: `Unknown asset: ${trade.asset}` });
            return;
          }
          
          const expirationTime = Math.floor(Date.now() / 1000) + (trade.expiration * 60);
          
          console.log(`Placing ${trade.direction.toUpperCase()} trade on ${trade.asset} (ID: ${assetId})`);
          console.log(`Amount: ${trade.amount}, Expiration: ${trade.expiration} min`);
          
          // Binary option buy message
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'binary-options.open-option',
              version: '1.0',
              body: {
                user_balance_id: balanceId,
                active_id: assetId,
                option_type_id: 3, // turbo option
                direction: trade.direction,
                expired: expirationTime,
                price: trade.amount,
              },
            },
          }));
        }
        
        if (data.name === 'binary-options.option-opened') {
          console.log('Trade opened successfully!', data.msg);
          tradeId = data.msg?.id || data.msg?.option_id;
          clearTimeout(timeout);
          ws.close();
          resolve({ 
            success: true, 
            tradeId: String(tradeId),
          });
        }
        
        if (data.name === 'binary-options.open-option' && data.msg?.result === 'error') {
          console.error('Trade error:', data.msg);
          clearTimeout(timeout);
          ws.close();
          resolve({ 
            success: false, 
            error: data.msg?.message || 'Trade failed',
          });
        }
        
        if (data.name === 'option' && data.msg?.id) {
          console.log('Option created:', data.msg);
          tradeId = data.msg.id;
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
      if (!tradeId) {
        // If we haven't resolved yet, wait a moment and check
        setTimeout(() => {
          if (tradeId) {
            resolve({ success: true, tradeId: String(tradeId) });
          }
        }, 500);
      }
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