import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IQOptionCredentials {
  email: string;
  password: string;
  account_type: string;
}

interface BalanceInfo {
  balance: number;
  currency: string;
  accountType: string;
}

// Use the same endpoint that works in iqoption-get-assets
const IQ_OPTION_AUTH_URL = 'https://auth.iqoption.com/api/v2/login';
const IQ_OPTION_WS_URL = 'wss://iqoption.com/echo/websocket';

async function loginToIQOption(email: string, password: string): Promise<{ ssid: string | null; error: string | null }> {
  try {
    console.log('Attempting to login to IQ Option...');
    
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

async function getBalance(ssid: string, accountType: string): Promise<BalanceInfo | null> {
  return new Promise((resolve) => {
    console.log('Connecting to IQ Option WebSocket for balance...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    let balanceInfo: BalanceInfo | null = null;
    
    const timeout = setTimeout(() => {
      console.log('Balance fetch timeout, closing connection');
      ws.close();
      resolve(null);
    }, 15000);

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
        
        if (data.name !== 'timeSync') {
          console.log('Received message:', data.name);
        }
        
        if (data.name === 'profile') {
          console.log('Authenticated! Getting balance...');
          
          const balances = data.msg.balances || [];
          console.log('Available balances:', balances.length);
          
          for (const balance of balances) {
            // type 1 = REAL, type 4 = PRACTICE (demo)
            if (accountType === 'PRACTICE' && balance.type === 4) {
              balanceInfo = {
                balance: balance.amount,
                currency: balance.currency || 'USD',
                accountType: 'PRACTICE',
              };
              console.log('Found PRACTICE balance:', balanceInfo);
              break;
            } else if (accountType === 'REAL' && balance.type === 1) {
              balanceInfo = {
                balance: balance.amount,
                currency: balance.currency || 'USD',
                accountType: 'REAL',
              };
              console.log('Found REAL balance:', balanceInfo);
              break;
            }
          }
          
          clearTimeout(timeout);
          ws.close();
          resolve(balanceInfo);
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeout);
      resolve(null);
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

    // Get user_id from request body (optional)
    let userId: string | null = null;
    try {
      const body = await req.json();
      userId = body?.userId || null;
    } catch {
      // No body or invalid JSON, continue without userId
    }

    // Build query for IQ Option credentials
    let query = supabase
      .from('iqoption_config')
      .select('email, password, account_type')
      .eq('is_active', true);

    // Filter by user_id if provided
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: configData, error: configError } = await query
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

    // Get balance
    const balanceInfo = await getBalance(ssid, credentials.account_type);
    
    if (!balanceInfo) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to get balance' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's profit/loss from operation_results
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: todayResults, error: resultsError } = await supabase
      .from('operation_results')
      .select('result, profit, entry_price')
      .gte('created_at', today.toISOString());

    let dailyProfit = 0;
    let todayTrades = 0;
    let wins = 0;
    let losses = 0;
    let consecutiveLosses = 0;
    let tempConsecutive = 0;

    if (todayResults && !resultsError) {
      todayTrades = todayResults.length;
      
      // Calculate profits and stats
      for (const result of todayResults) {
        if (result.result === 'win') {
          dailyProfit += result.profit || 0;
          wins++;
          tempConsecutive = 0;
        } else if (result.result === 'loose' || result.result === 'loss') {
          // Loss = entry_price amount lost
          dailyProfit -= result.entry_price || 0;
          losses++;
          tempConsecutive++;
          if (tempConsecutive > consecutiveLosses) {
            consecutiveLosses = tempConsecutive;
          }
        } else if (result.result === 'equal') {
          // Tie - no profit/loss
          tempConsecutive = 0;
        }
      }
    }

    console.log('Daily stats:', { dailyProfit, todayTrades, wins, losses, consecutiveLosses });

    return new Response(
      JSON.stringify({
        success: true,
        balance: balanceInfo.balance,
        currency: balanceInfo.currency,
        accountType: balanceInfo.accountType,
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
