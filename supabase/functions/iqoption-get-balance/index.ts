import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BalanceResult {
  success: boolean;
  balance?: number;
  currency?: string;
  accountType?: string;
  error?: string;
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

// Get balance via WebSocket using SSID
async function getBalanceViaWs(ssid: string, accountType: string): Promise<BalanceResult> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      console.log(`📡 Connecting to ${wsUrl} for balance...`);
      
      const result = await new Promise<BalanceResult>((resolve) => {
        const ws = new WebSocket(wsUrl);
        let resolved = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ success: false, error: 'Timeout' });
          }
        }, 15000);

        ws.onopen = () => {
          console.log('✅ WebSocket connected, authenticating...');
          ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.name === 'profile') {
              console.log('✅ Profile received, extracting balance...');
              const balances = data.msg?.balances || [];
              
              let balance = 0;
              let currency = 'USD';
              
              for (const b of balances) {
                if (accountType === 'PRACTICE' && b.type === 4) {
                  balance = b.amount;
                  currency = b.currency || 'USD';
                  break;
                } else if (accountType === 'REAL' && b.type === 1) {
                  balance = b.amount;
                  currency = b.currency || 'USD';
                  break;
                }
              }
              
              console.log(`💰 Balance: ${balance} ${currency}`);
              clearTimeout(timeout);
              resolved = true;
              ws.close();
              resolve({ success: true, balance, currency, accountType });
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };

        ws.onerror = () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve({ success: false, error: 'WebSocket error' });
          }
        };

        ws.onclose = () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve({ success: false, error: 'Connection closed' });
          }
        };
      });
      
      if (result.success) return result;
    } catch (error) {
      console.log(`❌ WebSocket failed with ${wsUrl}`);
      continue;
    }
  }
  
  return { success: false, error: 'Could not get balance' };
}

// Try WebSocket-only authentication (when HTTP is blocked)
async function tryWsOnlyAuth(email: string, password: string, accountType: string): Promise<BalanceResult> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      console.log(`🔄 Trying WS-only auth at: ${wsUrl}`);
      
      const result = await new Promise<BalanceResult>((resolve) => {
        const ws = new WebSocket(wsUrl);
        let resolved = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ success: false, error: 'Timeout' });
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
            
            if (data.name === 'authenticated') {
              console.log('✅ Authenticated via WS, requesting profile...');
              ws.send(JSON.stringify({
                name: 'sendMessage',
                msg: { name: 'get-profile', version: '1.0' }
              }));
            }
            
            if (data.name === 'profile') {
              console.log('✅ Profile received via WS-only auth');
              const balances = data.msg?.balances || [];
              
              let balance = 0;
              let currency = 'USD';
              
              for (const b of balances) {
                if (accountType === 'PRACTICE' && b.type === 4) {
                  balance = b.amount;
                  currency = b.currency || 'USD';
                  break;
                } else if (accountType === 'REAL' && b.type === 1) {
                  balance = b.amount;
                  currency = b.currency || 'USD';
                  break;
                }
              }
              
              clearTimeout(timeout);
              resolved = true;
              ws.close();
              resolve({ success: true, balance, currency, accountType });
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };

        ws.onerror = () => {
          if (!resolved) { clearTimeout(timeout); resolved = true; resolve({ success: false, error: 'WS error' }); }
        };
        ws.onclose = () => {
          if (!resolved) { clearTimeout(timeout); resolved = true; resolve({ success: false, error: 'Closed' }); }
        };
      });
      
      if (result.success) return result;
    } catch (error) {
      continue;
    }
  }
  return { success: false, error: 'All connection methods failed' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let userId: string | null = null;
    try {
      const body = await req.json();
      userId = body?.userId || null;
    } catch {
      // No body
    }

    let query = supabase
      .from('iqoption_config')
      .select('email, password, account_type')
      .eq('is_active', true);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: configData, error: configError } = await query.limit(1).maybeSingle();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ success: false, error: 'No IQ Option credentials configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountType = configData.account_type || 'PRACTICE';

    // Strategy 1: Try HTTP login first
    const ssid = await tryHttpLogin(configData.email, configData.password);
    
    let balanceResult: BalanceResult | null = null;
    
    if (ssid) {
      balanceResult = await getBalanceViaWs(ssid, accountType);
    }
    
    // Strategy 2: Try WebSocket-only authentication if HTTP failed
    if (!balanceResult?.success) {
      console.log('🔄 HTTP failed, trying WS-only auth...');
      balanceResult = await tryWsOnlyAuth(configData.email, configData.password, accountType);
    }

    if (!balanceResult?.success) {
      return new Response(
        JSON.stringify({ success: false, error: balanceResult?.error || 'Failed to get balance' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's stats from database
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: todayResults } = await supabase
      .from('operation_results')
      .select('result, profit, entry_price')
      .gte('created_at', today.toISOString());

    let dailyProfit = 0;
    let todayTrades = 0;
    let wins = 0;
    let losses = 0;
    let consecutiveLosses = 0;
    let tempConsecutive = 0;

    if (todayResults) {
      todayTrades = todayResults.length;
      
      for (const result of todayResults) {
        if (result.result === 'win') {
          dailyProfit += result.profit || 0;
          wins++;
          tempConsecutive = 0;
        } else if (result.result === 'loose' || result.result === 'loss') {
          dailyProfit -= result.entry_price || 0;
          losses++;
          tempConsecutive++;
          if (tempConsecutive > consecutiveLosses) {
            consecutiveLosses = tempConsecutive;
          }
        } else if (result.result === 'equal') {
          tempConsecutive = 0;
        }
      }
    }

    console.log('📊 Daily stats:', { dailyProfit, todayTrades, wins, losses, consecutiveLosses });

    return new Response(
      JSON.stringify({
        success: true,
        balance: balanceResult.balance,
        currency: balanceResult.currency,
        accountType: balanceResult.accountType,
        dailyProfit,
        todayTrades,
        wins,
        losses,
        consecutiveLosses,
      }),
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
