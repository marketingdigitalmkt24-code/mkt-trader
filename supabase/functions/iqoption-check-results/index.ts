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

interface Position {
  id: string;
  instrument_id: string;
  invest: number;
  open_time: number;
  close_time: number;
  profit: number;
  win: string; // 'win', 'loose', 'equal'
  option_type: string;
}

// IQ Option API endpoints
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

async function getRecentPositions(ssid: string): Promise<Position[]> {
  return new Promise((resolve, reject) => {
    const positions: Position[] = [];
    let isAuthenticated = false;
    
    console.log('Connecting to IQ Option WebSocket...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    const timeout = setTimeout(() => {
      console.log('WebSocket timeout, closing connection');
      ws.close();
      resolve(positions);
    }, 30000); // 30 second timeout

    ws.onopen = () => {
      console.log('WebSocket connected, sending SSID authentication...');
      ws.send(JSON.stringify({
        name: 'ssid',
        msg: ssid,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received message type:', data.name);
        
        if (data.name === 'profile') {
          isAuthenticated = true;
          console.log('Authenticated! Requesting positions history...');
          
          // Request closed positions (binary options history)
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'get-positions-state',
              version: '1.0',
            },
          }));
          
          // Also request binary options history
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'portfolio.get-positions',
              version: '4.0',
              body: {
                instrument_type: 'binary-option',
                limit: 50,
                offset: 0,
              },
            },
          }));
          
          // Get closed positions
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'portfolio.get-history-positions',
              version: '1.0',
              body: {
                instrument_type: 'binary-option',
                limit: 50,
                offset: 0,
              },
            },
          }));
        }
        
        if (data.name === 'positions-state' || data.name === 'portfolio.get-positions' || data.name === 'portfolio.get-history-positions') {
          console.log('Received positions data');
          
          if (data.msg && Array.isArray(data.msg.positions)) {
            for (const pos of data.msg.positions) {
              positions.push({
                id: pos.id || pos.external_id,
                instrument_id: pos.instrument_id || pos.active_id,
                invest: pos.invest || pos.amount,
                open_time: pos.open_time || pos.created,
                close_time: pos.close_time || pos.expired,
                profit: pos.profit || pos.win_amount - pos.invest,
                win: pos.win || (pos.profit > 0 ? 'win' : pos.profit < 0 ? 'loose' : 'equal'),
                option_type: pos.option_type || pos.direction,
              });
            }
          }
          
          // Close connection after getting data
          setTimeout(() => {
            clearTimeout(timeout);
            ws.close();
            resolve(positions);
          }, 2000);
        }
        
        if (data.name === 'option-closed') {
          console.log('Option closed event:', data.msg);
          if (data.msg) {
            positions.push({
              id: data.msg.id,
              instrument_id: data.msg.active_id,
              invest: data.msg.amount,
              open_time: data.msg.created,
              close_time: data.msg.expired,
              profit: data.msg.profit,
              win: data.msg.win,
              option_type: data.msg.direction,
            });
          }
        }
        
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeout);
      reject(error);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      clearTimeout(timeout);
      resolve(positions);
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
          error: 'No IQ Option credentials configured',
          success: false 
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
          error: loginError || 'Failed to login to IQ Option',
          success: false 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last connected timestamp
    await supabase
      .from('iqoption_config')
      .update({ last_connected_at: new Date().toISOString() })
      .eq('email', credentials.email);

    // Get recent positions
    const positions = await getRecentPositions(ssid);
    console.log(`Found ${positions.length} positions`);

    // Save results to database
    const results = [];
    for (const pos of positions) {
      const result = pos.win === 'win' ? 'win' : pos.win === 'loose' ? 'loss' : 'tie';
      
      // Check if already exists
      const { data: existing } = await supabase
        .from('operation_results')
        .select('id')
        .eq('iq_option_id', String(pos.id))
        .maybeSingle();

      if (!existing) {
        const { error: insertError } = await supabase
          .from('operation_results')
          .insert({
            signal_id: `iq_${pos.id}`,
            asset: String(pos.instrument_id),
            direction: pos.option_type === 'call' ? 'CALL' : 'PUT',
            entry_price: pos.invest,
            profit: pos.profit,
            result,
            iq_option_id: String(pos.id),
            expiration_time: pos.close_time ? new Date(pos.close_time * 1000).toISOString() : null,
          });

        if (!insertError) {
          results.push(pos);
        }
      }
    }

    console.log(`Saved ${results.length} new results to database`);

    return new Response(
      JSON.stringify({ 
        success: true,
        totalPositions: positions.length,
        newResultsSaved: results.length,
        positions: positions.slice(0, 10), // Return last 10
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});