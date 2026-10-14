import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

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

// Configuration
const MAX_RETRIES = 4;
const LOGIN_TIMEOUT_MS = 20000; // more resilient in unstable networks
const RETRY_BASE_DELAY_MS = 1200; // base delay for backoff

// Multiple IQ Option API endpoints to try (some regions block intermittently)
const IQ_OPTION_AUTH_URLS = [
  'https://auth.iqoption.com/api/v2/login',
  'https://api.iqoption.com/api/v2/login',
  'https://iqoption.com/api/v2/login',
];

// Multiple WebSocket endpoints to try
const IQ_OPTION_WS_URLS = [
  'wss://iqoption.com/echo/websocket',
  'wss://ws.iqoption.com/echo/websocket',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number) {
  const spread = Math.round(ms * 0.25);
  const delta = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
  return Math.max(250, ms + delta);
}

async function tryHttpLoginOnce(authUrl: string, email: string, password: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

  try {
    console.log(`🔄 HTTP login: ${authUrl} (timeout=${LOGIN_TIMEOUT_MS}ms)`);

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({ identifier: email, password }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    console.log('Login response status:', response.status, 'code:', data?.code);

    if (data?.code === 'success' && data?.ssid) {
      console.log(`✅ Login successful via ${authUrl}`);
      return String(data.ssid);
    }

    const message = data?.message || data?.error || 'Login failed';
    console.log(`❌ Login rejected via ${authUrl}: ${message}`);
    return null;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const reason = err.name === 'AbortError' ? `timeout after ${LOGIN_TIMEOUT_MS}ms` : err.message;
    console.log(`❌ HTTP login failed via ${authUrl}: ${reason}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loginToIQOptionResilient(email: string, password: string): Promise<{ ssid: string | null; error: string | null }> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`Login attempt ${attempt}/${MAX_RETRIES}...`);

    for (const authUrl of IQ_OPTION_AUTH_URLS) {
      const ssid = await tryHttpLoginOnce(authUrl, email, password);
      if (ssid) return { ssid, error: null };
      lastError = `Login failed via ${authUrl}`;
    }

    if (attempt < MAX_RETRIES) {
      const backoff = jitter(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
      console.log(`Waiting ${backoff}ms before retry...`);
      await delay(backoff);
    }
  }

  console.error(`All ${MAX_RETRIES} login attempts failed`);
  return { ssid: null, error: lastError || 'Login failed' };
}

type WsAuthMode =
  | { mode: 'ssid'; ssid: string }
  | { mode: 'credentials'; email: string; password: string };

async function getClosedPositions(auth: WsAuthMode, accountType: string): Promise<{ positions: PositionResult[]; authenticated: boolean; usedWsUrl: string | null }> {
  for (const wsUrl of IQ_OPTION_WS_URLS) {
    try {
      const res = await new Promise<{ positions: PositionResult[]; authenticated: boolean; usedWsUrl: string | null }>((resolve) => {
        const positions: PositionResult[] = [];
        let balanceId = 0;
        let authenticated = false;
        let resolved = false;
        let finishTimer: number | null = null;

        console.log(`Connecting to IQ Option WebSocket for results: ${wsUrl}`);
        const ws = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            console.log('WebSocket timeout, returning positions found:', positions.length);
            ws.close();
            resolve({ positions, authenticated, usedWsUrl: wsUrl });
          }
        }, 25000);

        const finish = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          if (finishTimer) clearTimeout(finishTimer);
          ws.close();
          resolve({ positions, authenticated, usedWsUrl: wsUrl });
        };

        ws.onopen = () => {
          console.log('WebSocket connected, authenticating...');
          if (auth.mode === 'ssid') {
            ws.send(JSON.stringify({ name: 'ssid', msg: auth.ssid }));
          } else {
            ws.send(JSON.stringify({ name: 'authenticate', msg: { email: auth.email, password: auth.password } }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.name !== 'timeSync') {
              console.log('Received:', data.name);
            }

            // WS-only auth can send "authenticated" before profile
            if (data.name === 'authenticated') {
              authenticated = true;
              ws.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-profile', version: '1.0' } }));
              return;
            }

            if (data.name === 'profile') {
              authenticated = true;
              console.log('Authenticated! Getting balance and history...');

              const balances = data.msg?.balances || [];
              for (const balance of balances) {
                if (accountType === 'PRACTICE' && balance.type === 4) {
                  balanceId = balance.id;
                  break;
                } else if (accountType === 'REAL' && balance.type === 1) {
                  balanceId = balance.id;
                  break;
                }
              }
              if (!balanceId && balances.length > 0) balanceId = balances[0].id;
              console.log('Using balance ID:', balanceId);

              // Request closed history (multiple pages for better matching)
              const historyOffsets = [0, 300, 600];

              for (const offset of historyOffsets) {
                ws.send(JSON.stringify({
                  name: 'sendMessage',
                  msg: {
                    name: 'portfolio.get-history-positions',
                    version: '2.0',
                    body: {
                      user_balance_id: balanceId,
                      instrument_types: ['binary-option', 'turbo-option', 'digital-option'],
                      limit: 300,
                      offset,
                    },
                  },
                }));
              }

              for (const offset of historyOffsets) {
                ws.send(JSON.stringify({
                  name: 'sendMessage',
                  msg: {
                    name: 'get-history-positions',
                    version: '1.0',
                    body: {
                      user_balance_id: balanceId,
                      instrument_types: ['turbo'],
                      limit: 300,
                      offset,
                    },
                  },
                }));
              }
            }

            const isHistoryMessage =
              data.name === 'portfolio.get-history-positions' ||
              data.name === 'history-positions' ||
              (data.name === 'portfolio.order-changed' && data.msg);

            if (isHistoryMessage) {
              console.log('Received history positions, processing...');

              let positionsList: any[] = [];
              if (data.msg?.positions) positionsList = data.msg.positions;
              else if (Array.isArray(data.msg)) positionsList = data.msg;
              else if (data.msg?.history) positionsList = data.msg.history;

              console.log('Found', positionsList.length, 'positions in response');

              for (const pos of positionsList) {
                const toNum = (v: any) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN);

                let win = 'pending';

                // Priority order for profit: pnl_net > pnl > close_profit (pnl_net is the real net result)
                const profitRaw =
                  pos.pnl_net ??
                  pos.pnl ??
                  pos.close_profit ??
                  pos.profit ??
                  pos.close_profit_amount ??
                  pos.net_profit ??
                  0;

                let profit = toNum(profitRaw);
                if (!Number.isFinite(profit)) profit = 0;

                // If profit is still 0, try computing from win_amount - investment
                if (profit === 0 && pos.win_amount != null) {
                  const investmentRaw = pos.amount ?? pos.invest ?? pos.investment ?? pos.buy_amount ?? pos.open_amount;
                  const investment = toNum(investmentRaw);
                  const winAmount = toNum(pos.win_amount);
                  if (Number.isFinite(investment) && Number.isFinite(winAmount)) {
                    const net = winAmount - investment;
                    if (net !== 0) profit = net;
                  }
                }

                // Determine win/loss/tie - prioritize raw_event.result if available
                const rawEvent = pos.raw_event?.binary_options_option_changed1;
                const explicitResult = rawEvent?.result || pos.close_reason || pos.result;

                if (pos.status === 'closed' || pos.close_time || pos.close_at) {
                  // Use explicit result from IQ Option if available
                  if (explicitResult === 'win') {
                    win = 'win';
                  } else if (explicitResult === 'loose' || explicitResult === 'loss') {
                    win = 'loose';
                  } else if (explicitResult === 'equal' || explicitResult === 'tie') {
                    win = 'equal';
                  } else if (typeof pos.win === 'string') {
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

                const digitalOrderIds = [
                  ...(Array.isArray(pos.order_ids) ? pos.order_ids : []),
                  ...(Array.isArray(pos.raw_event?.digital_options_position_changed1?.order_ids) ? pos.raw_event.digital_options_position_changed1.order_ids : []),
                  pos.raw_event?.digital_options_position_changed1?.order_id,
                ];
                const candidateIds = [pos.option_id, pos.position_id, pos.external_id, pos.id, ...digitalOrderIds]
                  .filter((v: any) => v !== undefined && v !== null)
                  .map((v: any) => String(v));

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

              console.log('Processed', positions.length, 'closed positions total');

              // Debounce finish to allow multiple pages/messages to arrive
              if (finishTimer) clearTimeout(finishTimer);
              finishTimer = setTimeout(finish, 1200);
            }

            if (data.name === 'option-closed' || data.name === 'binary-options.option-closed') {
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
                  .filter((v: any) => v !== undefined && v !== null)
                  .map((v: any) => String(v));

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
          finish();
        };

        ws.onclose = () => {
          console.log('WebSocket closed, found', positions.length, 'positions');
          if (!resolved) {
            clearTimeout(timeout);
            resolve({ positions, authenticated, usedWsUrl: wsUrl });
          }
        };
      });

      // If we authenticated, we keep this result (even if 0 positions)
      if (res.authenticated) return res;

      // Otherwise try next ws url
      console.log(`❌ WS auth failed (no profile/auth) via ${wsUrl}, trying next...`);
      continue;
    } catch (e) {
      console.log(`❌ WebSocket failed with ${wsUrl}:`, e instanceof Error ? e.message : String(e));
      continue;
    }
  }

  return { positions: [], authenticated: false, usedWsUrl: null };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const debugIqOptionIds: string[] = Array.isArray((body as any)?.debugIqOptionIds)
      ? (body as any).debugIqOptionIds.map((v: any) => String(v))
      : (body as any)?.debugIqOptionId
        ? [String((body as any).debugIqOptionId)]
        : [];

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
    
    // Login to IQ Option with resilient strategy
    console.log('Starting login (resilient)...');
    const { ssid, error: loginError } = await loginToIQOptionResilient(credentials.email, credentials.password);

    // Strategy 1: SSID + WebSocket
    let wsResult = ssid
      ? await getClosedPositions({ mode: 'ssid', ssid }, credentials.account_type)
      : { positions: [], authenticated: false, usedWsUrl: null as string | null };

    // Strategy 2: WebSocket-only auth fallback (when HTTP login times out / is blocked)
    if (!wsResult.authenticated) {
      console.log('🔄 HTTP login failed, trying WS-only authentication...');
      wsResult = await getClosedPositions(
        { mode: 'credentials', email: credentials.email, password: credentials.password },
        credentials.account_type
      );
    }

    if (!wsResult.authenticated) {
      return new Response(
        JSON.stringify({
          error: loginError || 'Failed to authenticate with IQ Option (HTTP+WS) - try again',
          success: false,
          retriesAttempted: MAX_RETRIES,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last connected timestamp
    await supabase
      .from('iqoption_config')
      .update({ last_connected_at: new Date().toISOString() })
      .eq('email', credentials.email);

    // Get ALL pending operations AND ALL tie results (which should be verified)
    // TIE results are often temporary placeholders - we should always verify them
    const { data: pendingOperations, error: pendingError } = await supabase
      .from('operation_results')
      .select('id, iq_option_id, signal_id, created_at, result, asset, direction, timeframe')
      .or('result.eq.pending,result.eq.tie')
      .order('created_at', { ascending: false })
      .limit(200);

    if (pendingError) {
      console.error('Error fetching pending operations:', pendingError);
    }

    const pendingCount = pendingOperations?.filter((p) => p.result === 'pending').length || 0;
    const tieCount = pendingOperations?.filter((p) => p.result === 'tie').length || 0;
    console.log(`Found ${pendingCount} pending + ${tieCount} recent tie operations to check`);

    // Get closed positions from IQ Option history
    const closedPositions = wsResult.positions;
    console.log(
      `Found ${closedPositions.length} closed positions from IQ Option history (ws=${wsResult.usedWsUrl || 'n/a'})`
    );

    const debugMatches = debugIqOptionIds.length
      ? debugIqOptionIds.map((id) => {
          const match = closedPositions.find((p) => p.matchIds.includes(id));
          return match
            ? {
                iq_option_id: id,
                win: match.win,
                profit: match.profit,
                close_quote: match.close_quote ?? null,
                raw: match.rawJson,
              }
            : { iq_option_id: id, notFound: true };
        })
      : [];

    // Update pending operations with REAL results from IQ Option history
    let updatedCount = 0;
    let freshWin: { signal_id: string; asset: string; direction: string; timeframe: string } | null = null;
    if (pendingOperations && pendingOperations.length > 0 && closedPositions.length > 0) {
      for (const pending of pendingOperations) {
        const iqId = pending.iq_option_id ? String(pending.iq_option_id) : '';

        // Search for matching closed position in IQ Option history
        // IMPORTANT: use strict ID matching to avoid false positives
        // Digital: o id retornado na abertura é o order_id, que aparece dentro do raw_event (order_ids)
        const idRe = iqId ? new RegExp(`[^0-9]${iqId}[^0-9]`) : null;
        const closed = closedPositions.find((p) =>
          iqId ? p.matchIds.includes(iqId) : p.matchIds.includes(String(pending.signal_id))
        ) || (idRe ? closedPositions.find((p) => idRe.test(p.rawJson)) : undefined);

        if (closed && closed.win !== 'pending') {
          const result = closed.win === 'win' ? 'win' :
                         closed.win === 'loose' ? 'loss' : 'tie';

          console.log(`✅ Found real result for ${pending.id}: ${result} (profit: ${closed.profit})`);

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
            // Track the most recent fresh WIN for immediate continuation
            if (
              result === 'win' &&
              !freshWin &&
              pending.timeframe !== 'MT5' &&
              pending.timeframe !== 'FOREX' &&
              !String(pending.signal_id).startsWith('cont-')
            ) {
              freshWin = {
                signal_id: String(pending.signal_id),
                asset: pending.asset,
                direction: String(pending.direction).toUpperCase(),
                timeframe: pending.timeframe || 'M1',
              };
            }
          } else {
            console.error('Error updating result:', updateError);
          }
        } else {
          // Log pending operations that weren't found in history yet
          console.log(`⏳ Still pending: ${pending.id} (iq_id: ${iqId || 'none'}, created: ${pending.created_at})`);
        }
      }
    }

    console.log(`Updated ${updatedCount} operation results from IQ Option history`);


    const responsePayload = {
      success: true,
      pendingChecked: pendingOperations?.length || 0,
      stillPending: (pendingOperations?.length || 0) - updatedCount,
      closedPositions: closedPositions.length,
      updatedResults: updatedCount,
      ...(debugMatches.length ? { debugMatches } : {}),
    };

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
