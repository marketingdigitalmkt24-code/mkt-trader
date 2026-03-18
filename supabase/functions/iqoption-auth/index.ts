import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Multiple IQ Option API endpoints to try (some may be blocked by region)
const IQ_OPTION_AUTH_URLS = [
  'https://auth.iqoption.com/api/v2/login',
  'https://api.iqoption.com/api/v2/login',
  'https://iqoption.com/api/v2/login',
];

const IQ_OPTION_WS_URLS = [
  'wss://iqoption.com/echo/websocket',
  'wss://ws.iqoption.com/echo/websocket',
];

interface LoginResult {
  success: boolean;
  ssid?: string;
  balance?: number;
  currency?: string;
  accountType?: string;
  error?: string;
  method?: string;
}

// Try to login using multiple endpoints
async function tryHttpLogin(email: string, password: string): Promise<{ ssid: string; url: string } | null> {
  for (const authUrl of IQ_OPTION_AUTH_URLS) {
    try {
      console.log(`🔄 Trying HTTP login at: ${authUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Origin': 'https://iqoption.com',
          'Referer': 'https://iqoption.com/',
        },
        body: new URLSearchParams({
          identifier: email,
          password: password,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const data = await response.json();
      console.log(`Response from ${authUrl}:`, data.code);
      
      if (data.code === 'success' && data.ssid) {
        console.log(`✅ Login successful via ${authUrl}`);
        return { ssid: data.ssid, url: authUrl };
      } else if (data.code === 'invalid' || data.message) {
        // Credentials are wrong, no need to try other endpoints
        return null;
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed with ${authUrl}:`, errMsg);
      continue;
    }
  }
  return null;
}

// Try WebSocket-only authentication
async function tryWsOnlyLogin(email: string, password: string, accountType: string): Promise<LoginResult> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      console.log(`🔄 Trying WebSocket auth at: ${wsUrl}`);
      
      const result = await new Promise<LoginResult>((resolve) => {
        const ws = new WebSocket(wsUrl);
        let resolved = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ success: false, error: `Timeout conectando a ${wsUrl}` });
          }
        }, 15000);

        ws.onopen = () => {
          console.log(`📡 WebSocket connected to ${wsUrl}`);
          // Send authentication directly
          ws.send(JSON.stringify({
            name: 'authenticate',
            msg: {
              email: email,
              password: password,
            },
          }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            console.log('WS message:', msg.name);
            
            if (msg.name === 'authenticated') {
              console.log('✅ WebSocket authentication successful');
              // Request profile after auth
              ws.send(JSON.stringify({
                name: 'sendMessage',
                msg: {
                  name: 'get-profile',
                  version: '1.0',
                },
              }));
            }
            
            if (msg.name === 'profile') {
              console.log('✅ Profile received via WebSocket');
              const balances = msg.msg?.balances || [];
              
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
              
              resolve({
                success: true,
                balance,
                currency,
                accountType,
                method: 'websocket-direct',
              });
            }
            
            if (msg.name === 'authentication_error' || msg.name === 'timeSync') {
              // Auth failed or general response
              if (msg.name === 'authentication_error') {
                clearTimeout(timeout);
                resolved = true;
                ws.close();
                resolve({ success: false, error: 'Email ou senha incorretos' });
              }
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };

        ws.onerror = (error) => {
          console.error(`WebSocket error on ${wsUrl}:`, error);
        };

        ws.onclose = () => {
          console.log(`WebSocket closed: ${wsUrl}`);
          if (!resolved) {
            clearTimeout(timeout);
            // Don't resolve here, let it try next URL
          }
        };
      });
      
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.log(`❌ WebSocket failed with ${wsUrl}:`, error);
      continue;
    }
  }
  
  return { success: false, error: 'Não foi possível conectar à IQ Option. Servidor pode estar bloqueado nesta região.' };
}

// Get profile via WebSocket after HTTP login
async function getProfileViaWs(ssid: string, accountType: string): Promise<LoginResult> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      const result = await new Promise<LoginResult>((resolve) => {
        const ws = new WebSocket(wsUrl);
        let resolved = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ success: false, error: 'Timeout ao obter saldo' });
          }
        }, 15000);

        ws.onopen = () => {
          console.log(`📡 WS connected for profile at ${wsUrl}`);
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
                method: 'http+websocket',
              });
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };

        ws.onerror = () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve({ success: false, error: 'Erro de conexão WebSocket' });
          }
        };

        ws.onclose = () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve({ success: false, error: 'Conexão fechada' });
          }
        };
      });
      
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.log(`❌ Profile fetch failed with ${wsUrl}:`, error);
      continue;
    }
  }
  
  return { success: false, error: 'Não foi possível obter saldo' };
}

async function loginAndGetProfile(email: string, password: string, accountType: string): Promise<LoginResult> {
  console.log('🔐 Attempting IQ Option authentication...');
  
  // Strategy 1: Try HTTP login first
  const httpResult = await tryHttpLogin(email, password);
  if (httpResult) {
    console.log('📡 HTTP login successful, getting profile via WebSocket...');
    return await getProfileViaWs(httpResult.ssid, accountType);
  }
  
  // Strategy 2: Try WebSocket-only authentication
  console.log('🔄 HTTP endpoints failed, trying WebSocket-only auth...');
  return await tryWsOnlyLogin(email, password, accountType);
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

    console.log(`🔐 Login attempt for: ${email.substring(0, 3)}***`);
    
    // Authenticate with IQ Option
    const result = await loginAndGetProfile(email, password, accountType || 'PRACTICE');
    
    console.log(`Result: success=${result.success}, method=${result.method || 'none'}`);
    
    if (result.success && userId) {
      // Update last_connected_at in database
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('iqoption_config')
          .update({ last_connected_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('is_active', true);
      } catch (dbError) {
        console.error('DB update error:', dbError);
      }
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
        error: 'A IQ Option pode estar bloqueando conexões deste servidor. Tente novamente mais tarde ou use um relay externo.' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
