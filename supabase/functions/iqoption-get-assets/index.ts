import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
}

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

async function getAvailableAssets(ssid: string): Promise<{ assets: AvailableAsset[]; error: string | null }> {
  return new Promise((resolve) => {
    console.log('Connecting to IQ Option WebSocket to get assets...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    const assets: AvailableAsset[] = [];
    let receivedData = false;
    
    const timeout = setTimeout(() => {
      if (!receivedData) {
        console.log('Timeout waiting for assets');
        ws.close();
        resolve({ assets: [], error: 'Timeout waiting for assets' });
      }
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
        
        if (data.name === 'profile') {
          console.log('Authenticated! Requesting initialization data...');
          
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'get-initialization-data',
              version: '3.0',
              body: {}
            }
          }));
        }
        
        if (data.name === 'initialization-data') {
          console.log('Received initialization data');
          receivedData = true;
          
          // Parse binary options assets
          const binary = data.msg?.binary?.actives || {};
          const turbo = data.msg?.turbo?.actives || {};
          
          // Combine binary and turbo assets
          const allActives = { ...binary, ...turbo };
          
          for (const [id, info] of Object.entries(allActives)) {
            const assetInfo = info as any;
            
            if (assetInfo.enabled && !assetInfo.is_suspended) {
              const name = assetInfo.name || '';
              const isOTC = name.toLowerCase().includes('otc') || 
                           assetInfo.underlying?.includes('-OTC') ||
                           assetInfo.description?.includes('OTC');
              
              // Determine asset type
              let type = 'forex';
              if (isOTC) {
                type = 'otc';
              } else if (name.includes('BTC') || name.includes('ETH') || name.includes('LTC') || name.includes('XRP')) {
                type = 'crypto';
              }
              
              // Get payout percentage if available
              const payout = assetInfo.option?.profit?.commission || 
                            assetInfo.profit_percent || 
                            assetInfo.option?.profit_commission || 0;
              
              assets.push({
                id: parseInt(id),
                name: name,
                type: type,
                isOTC: isOTC,
                enabled: true,
                payout: payout,
              });
            }
          }
          
          console.log(`Found ${assets.length} available assets`);
          
          // Log some examples
          const otcAssets = assets.filter(a => a.isOTC);
          const forexAssets = assets.filter(a => a.type === 'forex' && !a.isOTC);
          const cryptoAssets = assets.filter(a => a.type === 'crypto');
          
          console.log(`OTC: ${otcAssets.length}, Forex: ${forexAssets.length}, Crypto: ${cryptoAssets.length}`);
          
          if (otcAssets.length > 0) {
            console.log('Sample OTC assets:', otcAssets.slice(0, 5).map(a => a.name));
          }
          
          clearTimeout(timeout);
          ws.close();
          resolve({ assets, error: null });
        }
        
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeout);
      resolve({ assets: [], error: 'WebSocket connection error' });
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      clearTimeout(timeout);
      if (!receivedData) {
        resolve({ assets: [], error: 'Connection closed before receiving data' });
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
          error: 'No IQ Option credentials configured',
          assets: []
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Login to IQ Option
    const { ssid, error: loginError } = await loginToIQOption(configData.email, configData.password);
    
    if (!ssid) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: loginError || 'Failed to login to IQ Option',
          assets: []
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get available assets
    const { assets, error: assetsError } = await getAvailableAssets(ssid);
    
    if (assetsError) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: assetsError,
          assets: []
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group assets by type
    const groupedAssets = {
      otc: assets.filter(a => a.isOTC),
      forex: assets.filter(a => a.type === 'forex' && !a.isOTC),
      crypto: assets.filter(a => a.type === 'crypto'),
    };

    console.log('Returning assets:', {
      total: assets.length,
      otc: groupedAssets.otc.length,
      forex: groupedAssets.forex.length,
      crypto: groupedAssets.crypto.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        assets: assets,
        grouped: groupedAssets,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, assets: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
