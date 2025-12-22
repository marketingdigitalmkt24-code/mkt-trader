import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IQ_OPTION_AUTH_URL = 'https://auth.iqoption.com/api/v2/login';
const IQ_OPTION_WS_URL = 'wss://iqoption.com/echo/websocket';

interface LoginResult {
  success: boolean;
  ssid?: string;
  balance?: number;
  currency?: string;
  accountType?: string;
  error?: string;
}

async function loginAndGetProfile(email: string, password: string, accountType: string): Promise<LoginResult> {
  console.log('🔐 Authenticating with IQ Option...');
  
  try {
    // Step 1: HTTP Login to get SSID
    const response = await fetch(IQ_OPTION_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        identifier: email,
        password: password,
      }),
    });

    const data = await response.json();
    console.log('Login response code:', data.code);
    
    if (data.code !== 'success' || !data.ssid) {
      return { 
        success: false, 
        error: data.message || 'Email ou senha incorretos' 
      };
    }

    const ssid = data.ssid;
    console.log('✅ SSID obtained, connecting to WebSocket...');

    // Step 2: Connect to WebSocket and get profile/balance
    return new Promise((resolve) => {
      const ws = new WebSocket(IQ_OPTION_WS_URL);
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          resolve({ success: false, error: 'Timeout ao obter saldo' });
        }
      }, 15000);

      ws.onopen = () => {
        console.log('📡 WebSocket connected, authenticating with SSID...');
        ws.send(JSON.stringify({
          name: 'ssid',
          msg: ssid,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.name === 'profile') {
            console.log('✅ Profile received');
            const balances = msg.msg?.balances || [];
            
            let balance = 0;
            let currency = 'USD';
            
            for (const b of balances) {
              // type 1 = REAL, type 4 = PRACTICE
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
            
            resolve({
              success: true,
              ssid,
              balance,
              currency,
              accountType,
            });
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve({ success: false, error: 'Erro de conexão WebSocket' });
        }
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve({ success: false, error: 'Conexão fechada inesperadamente' });
        }
      };
    });

  } catch (error) {
    console.error('Login error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, accountType, userId } = await req.json();
    
    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email e senha são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate with IQ Option
    const result = await loginAndGetProfile(email, password, accountType || 'PRACTICE');
    
    if (result.success && userId) {
      // Update last_connected_at in database
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('iqoption_config')
        .update({ last_connected_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_active', true);
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro interno' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
