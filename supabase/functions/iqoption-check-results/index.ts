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

// IQ Option WebSocket URL - use direct WebSocket auth instead of HTTP
const IQ_OPTION_WS_URL = 'wss://iqoption.com/echo/websocket';

// Helper function to delay
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Login via WebSocket directly (bypasses HTTP API that may be blocked)
async function loginViaWebSocket(email: string, password: string): Promise<{ ssid: string | null; error: string | null }> {
  return new Promise((resolve) => {
    console.log('Attempting WebSocket direct login...');
    
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve({ ssid: null, error: 'WebSocket login timeout' });
      }
    }, 15000);

    ws.onopen = () => {
      console.log('WebSocket connected, sending credentials...');
      // Send login via WebSocket
      ws.send(JSON.stringify({
        name: 'login',
        msg: {
          email: email,
          password: password,
        }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WS Auth response:', data.name);
        
        if (data.name === 'login' && data.msg?.ssid) {
          console.log('WebSocket login successful!');
          clearTimeout(timeout);
          resolved = true;
          ws.close();
          resolve({ ssid: data.msg.ssid, error: null });
        }
        
        if (data.name === 'login' && data.msg?.code === 'error') {
          console.error('Login error:', data.msg);
          clearTimeout(timeout);
          resolved = true;
          ws.close();
          resolve({ ssid: null, error: data.msg.message || 'Invalid credentials' });
        }
        
        // Handle profile message as implicit auth success
        if (data.name === 'profile' && data.msg?.user_id) {
          console.log('Got profile, extracting session...');
          // If we got profile, connection is authenticated
          clearTimeout(timeout);
          resolved = true;
          // Return a placeholder - we'll use the open WS connection
          resolve({ ssid: 'ws_authenticated', error: null });
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ ssid: null, error: 'WebSocket connection failed' });
      }
    };

    ws.onclose = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ ssid: null, error: 'WebSocket closed before auth' });
      }
    };
  });
}

// Combined function: login and get positions in one WebSocket connection
async function loginAndGetPositions(
  email: string, 
  password: string, 
  accountType: string
): Promise<{ success: boolean; positions: PositionResult[]; error?: string }> {
  return new Promise((resolve) => {
    const positions: PositionResult[] = [];
    let balanceId = 0;
    let authenticated = false;
    
    console.log('Connecting to IQ Option WebSocket...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    const timeout = setTimeout(() => {
      console.log('Connection timeout');
      ws.close();
      if (!authenticated) {
        resolve({ success: false, positions: [], error: 'Connection timeout' });
      } else {
        resolve({ success: true, positions });
      }
    }, 30000);

    ws.onopen = () => {
      console.log('WebSocket connected, authenticating...');
      // Try login via WebSocket message
      ws.send(JSON.stringify({
        name: 'login',
        msg: {
          email: email,
          password: password,
        }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.name !== 'timeSync') {
          console.log('Received:', data.name);
        }
        
        // Handle successful login response
        if (data.name === 'login') {
          if (data.msg?.ssid) {
            console.log('Login successful via WebSocket!');
            authenticated = true;
            // Authenticate with SSID
            ws.send(JSON.stringify({
              name: 'ssid',
              msg: data.msg.ssid,
            }));
          } else if (data.msg?.code === 'error') {
            console.error('Login failed:', data.msg);
            clearTimeout(timeout);
            ws.close();
            resolve({ success: false, positions: [], error: data.msg.message || 'Invalid credentials' });
            return;
          }
        }
        
        if (data.name === 'profile') {
          console.log('Authenticated! Getting balance and history...');
          authenticated = true;
          
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
          
          // Request history
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
        }
        
        // Handle history positions
        if (data.name === 'portfolio.get-history-positions' || 
            data.name === 'history-positions') {
          console.log('Received history positions');
          
          let positionsList = [];
          if (data.msg?.positions) {
            positionsList = data.msg.positions;
          } else if (Array.isArray(data.msg)) {
            positionsList = data.msg;
          } else if (data.msg?.history) {
            positionsList = data.msg.history;
          }
          
          console.log('Found', positionsList.length, 'positions');

          for (const pos of positionsList) {
            let win = 'pending';
            const profit = pos.close_profit ?? pos.pnl ?? pos.profit ?? pos.win_amount ?? 0;
            
            if (pos.status === 'closed' || pos.close_time || pos.close_at) {
              if (typeof pos.win === 'string') {
                win = pos.win;
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
              positions.push({
                matchIds,
                rawJson: JSON.stringify(pos),
                win,
                profit,
                close_quote: pos.close_quote || pos.close_rate || pos.close_price,
              });
            }
          }
          
          console.log('Processed', positions.length, 'positions');
          
          // Done - close after a short delay
          setTimeout(() => {
            clearTimeout(timeout);
            ws.close();
            resolve({ success: true, positions });
          }, 1000);
        }
        
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      clearTimeout(timeout);
      if (!authenticated) {
        resolve({ success: false, positions: [], error: 'Connection error' });
      } else {
        resolve({ success: true, positions });
      }
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

    // Get IQ Option credentials
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
    
    // Login and get positions in one connection
    console.log('Starting combined login and fetch...');
    const result = await loginAndGetPositions(
      credentials.email, 
      credentials.password, 
      credentials.account_type
    );
    
    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          error: result.error || 'Failed to connect',
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

    // Get pending operations
    const { data: pendingOperations, error: pendingError } = await supabase
      .from('operation_results')
      .select('id, iq_option_id, signal_id')
      .eq('result', 'pending');

    if (pendingError) {
      console.error('Error fetching pending operations:', pendingError);
    }

    console.log('Found', pendingOperations?.length || 0, 'pending operations');

    // Update pending operations with results
    let updatedCount = 0;
    const closedPositions = result.positions;
    
    if (pendingOperations && closedPositions.length > 0) {
      for (const pending of pendingOperations) {
        const iqId = pending.iq_option_id ? String(pending.iq_option_id) : '';

        const closed = closedPositions.find((p) =>
          (iqId && (p.matchIds.includes(iqId) || p.rawJson.includes(iqId))) ||
          p.matchIds.includes(String(pending.signal_id)) ||
          p.rawJson.includes(String(pending.signal_id))
        );
        
        if (closed && closed.win !== 'pending') {
          const resultStatus = closed.win === 'win' ? 'win' : 
                       closed.win === 'loose' ? 'loss' : 'tie';
          
          console.log(`Updating ${pending.id}: ${resultStatus}`);
          
          const { error: updateError } = await supabase
            .from('operation_results')
            .update({
              result: resultStatus,
              profit: closed.profit,
              exit_price: closed.close_quote || null,
            })
            .eq('id', pending.id);

          if (!updateError) {
            updatedCount++;
          }
        }
      }
    }

    console.log(`Updated ${updatedCount} results`);

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
