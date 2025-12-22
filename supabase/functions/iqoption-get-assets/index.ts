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
  isBlitz?: boolean;
  isBinary?: boolean;
  schedule?: {
    open: boolean;
    openTime?: string;
    closeTime?: string;
    tradingDays?: number[];
  };
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

// Get assets via WebSocket using SSID
async function getAssetsViaWs(ssid: string): Promise<{ assets: AvailableAsset[]; error: string | null }> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      console.log(`📡 Connecting to ${wsUrl} for assets...`);
      
      const result = await new Promise<{ assets: AvailableAsset[]; error: string | null }>((resolve) => {
        const ws = new WebSocket(wsUrl);
        const assets: AvailableAsset[] = [];
        let resolved = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ assets: [], error: 'Timeout' });
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
              console.log('✅ Authenticated! Requesting assets...');
              ws.send(JSON.stringify({
                name: 'sendMessage',
                msg: { name: 'get-initialization-data', version: '3.0', body: {} }
              }));
            }
            
            if (data.name === 'initialization-data') {
              console.log('📊 Received initialization data');
              resolved = true;
              
              const binary = data.msg?.binary?.actives || {};
              const turbo = data.msg?.turbo?.actives || {};
              const turboIds = new Set(Object.keys(turbo));
              const binaryIds = new Set(Object.keys(binary));
              const allActives = { ...binary, ...turbo };
              
              for (const [id, info] of Object.entries(allActives)) {
                const assetInfo = info as any;
                const isOpen = assetInfo.enabled && !assetInfo.is_suspended;
                const name = assetInfo.name || '';
                const isOTC = name.toLowerCase().includes('otc') || 
                             assetInfo.underlying?.includes('-OTC');
                const isBlitz = turboIds.has(id);
                const isBinaryAsset = binaryIds.has(id);
                
                let type = 'forex';
                if (isOTC) type = 'otc';
                else if (name.includes('BTC') || name.includes('ETH') || name.includes('LTC') || name.includes('XRP')) type = 'crypto';
                else if (isBlitz) type = 'blitz';
                
                const payout = assetInfo.option?.profit?.commission || assetInfo.profit_percent || 0;
                
                let tradingSchedule: AvailableAsset['schedule'] = { open: isOpen };
                if (isOTC || type === 'crypto') {
                  tradingSchedule = { open: isOpen, tradingDays: [0, 1, 2, 3, 4, 5, 6] };
                } else {
                  tradingSchedule = { open: isOpen, tradingDays: [1, 2, 3, 4, 5] };
                }
                
                if (assetInfo.enabled !== false) {
                  assets.push({
                    id: parseInt(id), name, type, isOTC, enabled: isOpen,
                    payout, isBlitz, isBinary: isBinaryAsset, schedule: tradingSchedule,
                  });
                }
              }
              
              assets.sort((a, b) => (b.payout || 0) - (a.payout || 0));
              console.log(`✅ Found ${assets.length} assets`);
              
              clearTimeout(timeout);
              ws.close();
              resolve({ assets, error: null });
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };

        ws.onerror = () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve({ assets: [], error: 'WebSocket error' });
          }
        };

        ws.onclose = () => {
          if (!resolved) {
            clearTimeout(timeout);
            resolved = true;
            resolve({ assets: [], error: 'Connection closed' });
          }
        };
      });
      
      if (result.assets.length > 0) {
        return result;
      }
    } catch (error) {
      console.log(`❌ WebSocket failed with ${wsUrl}`);
      continue;
    }
  }
  
  return { assets: [], error: 'Could not connect to IQ Option' };
}

// Try WebSocket-only authentication (when HTTP is blocked)
async function tryWsOnlyAuth(email: string, password: string): Promise<{ assets: AvailableAsset[]; error: string | null }> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      console.log(`🔄 Trying WS-only auth at: ${wsUrl}`);
      
      const result = await new Promise<{ assets: AvailableAsset[]; error: string | null }>((resolve) => {
        const ws = new WebSocket(wsUrl);
        const assets: AvailableAsset[] = [];
        let resolved = false;
        let authenticated = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ assets: [], error: 'Timeout' });
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
            
            if (data.name === 'authenticated' || data.name === 'profile') {
              if (!authenticated) {
                authenticated = true;
                console.log('✅ Authenticated via WS, getting assets...');
                ws.send(JSON.stringify({
                  name: 'sendMessage',
                  msg: { name: 'get-initialization-data', version: '3.0', body: {} }
                }));
              }
            }
            
            if (data.name === 'initialization-data' && authenticated) {
              resolved = true;
              
              const binary = data.msg?.binary?.actives || {};
              const turbo = data.msg?.turbo?.actives || {};
              const turboIds = new Set(Object.keys(turbo));
              const binaryIds = new Set(Object.keys(binary));
              const allActives = { ...binary, ...turbo };
              
              for (const [id, info] of Object.entries(allActives)) {
                const assetInfo = info as any;
                const isOpen = assetInfo.enabled && !assetInfo.is_suspended;
                const name = assetInfo.name || '';
                const isOTC = name.toLowerCase().includes('otc') || assetInfo.underlying?.includes('-OTC');
                const isBlitz = turboIds.has(id);
                const isBinaryAsset = binaryIds.has(id);
                
                let type = 'forex';
                if (isOTC) type = 'otc';
                else if (name.includes('BTC') || name.includes('ETH') || name.includes('LTC') || name.includes('XRP')) type = 'crypto';
                else if (isBlitz) type = 'blitz';
                
                const payout = assetInfo.option?.profit?.commission || assetInfo.profit_percent || 0;
                
                if (assetInfo.enabled !== false) {
                  assets.push({
                    id: parseInt(id), name, type, isOTC, enabled: isOpen,
                    payout, isBlitz, isBinary: isBinaryAsset,
                    schedule: { open: isOpen, tradingDays: isOTC || type === 'crypto' ? [0,1,2,3,4,5,6] : [1,2,3,4,5] },
                  });
                }
              }
              
              assets.sort((a, b) => (b.payout || 0) - (a.payout || 0));
              console.log(`✅ Found ${assets.length} assets via WS-only`);
              
              clearTimeout(timeout);
              ws.close();
              resolve({ assets, error: null });
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        };

        ws.onerror = () => {
          if (!resolved) { clearTimeout(timeout); resolved = true; resolve({ assets: [], error: 'WS error' }); }
        };
        ws.onclose = () => {
          if (!resolved) { clearTimeout(timeout); resolved = true; resolve({ assets: [], error: 'Closed' }); }
        };
      });
      
      if (result.assets.length > 0) return result;
    } catch (error) {
      continue;
    }
  }
  return { assets: [], error: 'All connection methods failed' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: configData, error: configError } = await supabase
      .from('iqoption_config')
      .select('email, password, account_type')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ success: false, error: 'No IQ Option credentials configured', assets: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Strategy 1: Try HTTP login first
    const ssid = await tryHttpLogin(configData.email, configData.password);
    
    if (ssid) {
      const { assets, error } = await getAssetsViaWs(ssid);
      if (assets.length > 0) {
        const grouped = {
          blitz: assets.filter(a => a.isBlitz && !a.isOTC),
          binary: assets.filter(a => a.isBinary && !a.isOTC && !a.isBlitz),
          otc: assets.filter(a => a.isOTC),
          forex: assets.filter(a => a.type === 'forex' && !a.isOTC),
          crypto: assets.filter(a => a.type === 'crypto'),
        };
        
        return new Response(
          JSON.stringify({ success: true, assets, grouped, timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Strategy 2: Try WebSocket-only authentication
    console.log('🔄 HTTP failed, trying WS-only auth...');
    const wsResult = await tryWsOnlyAuth(configData.email, configData.password);
    
    if (wsResult.assets.length > 0) {
      const grouped = {
        blitz: wsResult.assets.filter(a => a.isBlitz && !a.isOTC),
        binary: wsResult.assets.filter(a => a.isBinary && !a.isOTC && !a.isBlitz),
        otc: wsResult.assets.filter(a => a.isOTC),
        forex: wsResult.assets.filter(a => a.type === 'forex' && !a.isOTC),
        crypto: wsResult.assets.filter(a => a.type === 'crypto'),
      };
      
      return new Response(
        JSON.stringify({ success: true, assets: wsResult.assets, grouped, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: wsResult.error || 'Connection failed', assets: [] }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
