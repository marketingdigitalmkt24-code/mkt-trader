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

interface PositionResult {
  matchIds: string[];
  rawJson: string;
  win: string;
  profit: number;
  close_quote?: number;
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

async function getClosedPositions(ssid: string, accountType: string): Promise<PositionResult[]> {
  return new Promise((resolve) => {
    const positions: PositionResult[] = [];
    let balanceId = 0;
    
    console.log('Connecting to IQ Option WebSocket for results...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    const timeout = setTimeout(() => {
      console.log('WebSocket timeout, returning positions found:', positions.length);
      ws.close();
      resolve(positions);
    }, 25000);

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
        
        // Skip timeSync messages
        if (data.name !== 'timeSync') {
          console.log('Received:', data.name);
        }
        
        if (data.name === 'profile') {
          console.log('Authenticated! Getting balance and history...');
          
          // Get correct balance ID
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
          
          console.log('Using balance ID:', balanceId);
          
          // Request closed binary options history - try multiple formats
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'portfolio.get-history-positions',
              version: '2.0',
              body: {
                user_balance_id: balanceId,
                instrument_types: ['binary-option', 'turbo-option', 'digital-option'],
                limit: 100,
                offset: 0,
              },
            },
          }));
          
          // Also try alternative history request format
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'get-history-positions',
              version: '1.0',
              body: {
                user_balance_id: balanceId,
                instrument_types: ['turbo'],
                limit: 100,
                offset: 0,
              },
            },
          }));
        }
        
        // Handle history positions response - check multiple event names
        if (data.name === 'portfolio.get-history-positions' || 
            data.name === 'history-positions' || 
            (data.name === 'portfolio.order-changed' && data.msg)) {
          console.log('Received history positions, processing...');
          
          // Handle different response structures
          let positionsList = [];
          if (data.msg?.positions) {
            positionsList = data.msg.positions;
          } else if (Array.isArray(data.msg)) {
            positionsList = data.msg;
          } else if (data.msg?.history) {
            positionsList = data.msg.history;
          }
          
          console.log('Found', positionsList.length, 'positions in response');

          if (positionsList.length > 0) {
            try {
              console.log('Sample position keys:', Object.keys(positionsList[0] || {}));
              console.log(
                'Sample position snippet:',
                JSON.stringify(positionsList[0]).slice(0, 800)
              );
            } catch (_e) {
              // ignore
            }
          }
          
          for (const pos of positionsList) {
            // Determine win/loss status based on different API response formats
            let win = 'pending';
            const profit = pos.close_profit ?? pos.pnl ?? pos.profit ?? pos.win_amount ?? 0;
            
            // Check various fields for win status
            if (pos.status === 'closed' || pos.close_time || pos.close_at) {
              if (typeof pos.win === 'string') {
                win = pos.win; // 'win', 'loose', 'equal'
              } else if (profit > 0) {
                win = 'win';
              } else if (profit < 0) {
                win = 'loose';
              } else {
                win = 'equal';
              }
            } else if (pos.result) {
              win = pos.result;
            }
            
            // Get the best IDs to match with our stored iq_option_id (usually numeric)
            const candidateIds = [
              pos.option_id,
              pos.position_id,
              pos.external_id,
              pos.id,
            ]
              .filter((v) => v !== undefined && v !== null)
              .map((v) => String(v));

            const matchIds = Array.from(new Set(candidateIds)).filter(Boolean);

            if (matchIds.length > 0) {
              console.log(`Position ${matchIds[0]} (ids=${matchIds.join(',')}): win=${win}, profit=${profit}`);
              positions.push({
                matchIds,
                rawJson: JSON.stringify(pos),
                win,
                profit,
                close_quote: pos.close_quote || pos.close_rate || pos.close_price,
              });
            }
          }
          
          console.log('Processed', positions.length, 'closed positions total');
          
          // Close after receiving data
          setTimeout(() => {
            clearTimeout(timeout);
            ws.close();
            resolve(positions);
          }, 1000);
        }
        
        // Handle option-closed event (real-time)
        if (data.name === 'option-closed' || data.name === 'binary-options.option-closed') {
          console.log('Option closed event received');
          const msg = data.msg;
          if (msg && (msg.id || msg.option_id || msg.position_id || msg.external_id)) {
            let win = 'pending';
            if (msg.profit !== undefined) {
              if (msg.profit > 0) win = 'win';
              else if (msg.profit < 0) win = 'loose';
              else win = 'equal';
            } else if (msg.win) {
              win = msg.win;
            }

            const candidateIds = [msg.id, msg.option_id, msg.position_id, msg.external_id]
              .filter((v) => v !== undefined && v !== null)
              .map((v) => String(v));

            const matchIds = Array.from(new Set(candidateIds)).filter(Boolean);

            positions.push({
              matchIds,
              rawJson: JSON.stringify(msg),
              win,
              profit: msg.profit || 0,
              close_quote: msg.close_quote,
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
      resolve(positions);
    };

    ws.onclose = () => {
      console.log('WebSocket closed, found', positions.length, 'positions');
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

    // Get pending operations from our database
    const { data: pendingOperations, error: pendingError } = await supabase
      .from('operation_results')
      .select('id, iq_option_id, signal_id')
      .eq('result', 'pending');

    if (pendingError) {
      console.error('Error fetching pending operations:', pendingError);
    }

    console.log('Found', pendingOperations?.length || 0, 'pending operations to check');

    // Get closed positions from IQ Option
    const closedPositions = await getClosedPositions(ssid, credentials.account_type);
    console.log(`Found ${closedPositions.length} closed positions from IQ Option`);

    // Update pending operations with results
    let updatedCount = 0;
    if (pendingOperations && closedPositions.length > 0) {
      for (const pending of pendingOperations) {
        const iqId = pending.iq_option_id ? String(pending.iq_option_id) : '';

        const closed = closedPositions.find((p) =>
          (iqId && (p.matchIds.includes(iqId) || p.rawJson.includes(iqId))) ||
          p.matchIds.includes(String(pending.signal_id)) ||
          p.rawJson.includes(String(pending.signal_id))
        );
        
        if (closed && closed.win !== 'pending') {
          const result = closed.win === 'win' ? 'win' : 
                         closed.win === 'loose' ? 'loss' : 'tie';
          
          console.log(`Updating ${pending.id}: ${result} (profit: ${closed.profit})`);
          
          const { error: updateError } = await supabase
            .from('operation_results')
            .update({
              result,
              profit: closed.profit,
              exit_price: closed.close_quote || null,
            })
            .eq('id', pending.id);

          if (!updateError) {
            updatedCount++;
          } else {
            console.error('Error updating result:', updateError);
          }
        }
      }
    }

    console.log(`Updated ${updatedCount} operation results`);

    return new Response(
      JSON.stringify({ 
        success: true,
        pendingChecked: pendingOperations?.length || 0,
        closedPositions: closedPositions.length,
        updatedResults: updatedCount,
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