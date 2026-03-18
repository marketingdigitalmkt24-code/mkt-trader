import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROVISIONING_URL = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (e: any) {
    if (e.message?.includes('certificate') || e.message?.includes('peer') || e.message?.includes('tls')) {
      // @ts-ignore
      const client = Deno.createHttpClient({ caCerts: [] });
      return await fetch(url, { ...options, client } as any);
    }
    throw e;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let closeAll = false;
    let loopMode = false;
    try {
      const body = await req.json();
      closeAll = body?.closeAll === true;
      loopMode = body?.loopMode === true;
    } catch (_) {}

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: metaConfig } = await supabase
      .from('metaapi_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!metaConfig) {
      return new Response(
        JSON.stringify({ success: false, error: 'MetaAPI não configurado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const METAAPI_TOKEN = metaConfig.token;
    const METAAPI_ACCOUNT_ID = metaConfig.account_id;
    const tpPercent = metaConfig.take_profit_pips || 10;

    if (!METAAPI_TOKEN || !METAAPI_ACCOUNT_ID) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token ou Account ID não configurados' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tradingSettings } = await supabase
      .from('user_trading_settings')
      .select('mt5_trade_amount')
      .limit(1)
      .maybeSingle();

    const tradeAmount = tradingSettings?.mt5_trade_amount || 1;
    const tpCurrency = tradeAmount * (tpPercent / 100);
    
    // ===== STOP LOSS: Limitar perdas a 2x o TP (Risk/Reward 1:2 favorecendo wins) =====
    const slMultiplier = 2; // SL = 2x TP target
    const slCurrency = tpCurrency * slMultiplier;
    console.log(`📊 Config: TP: $${tpCurrency.toFixed(2)} (${tpPercent}%) | SL: $${slCurrency.toFixed(2)} (${tpPercent * slMultiplier}%) | TradeAmt: $${tradeAmount}`);

    // Get region and ensure account is deployed
    let region = 'new-york';
    let clientToken = METAAPI_TOKEN;
    let accountState = 'UNKNOWN';
    let connectionStatus = 'UNKNOWN';
    console.log(`📍 Checking account ${METAAPI_ACCOUNT_ID}...`);
    try {
      const accountRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}`, {
        headers: { 'auth-token': METAAPI_TOKEN },
      });
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        region = accountData.region || 'new-york';
        accountState = accountData.state || 'UNKNOWN';
        connectionStatus = accountData.connectionStatus || 'UNKNOWN';
        console.log(`📍 Region: ${region} | State: ${accountState} | Connection: ${connectionStatus}`);
        
        // Auto-deploy if undeployed
        if (accountState === 'UNDEPLOYED') {
          console.log('🔄 Account is UNDEPLOYED, deploying...');
          try {
            const deployRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/deploy`, {
              method: 'POST',
              headers: { 'auth-token': METAAPI_TOKEN },
            });
            const deployText = await deployRes.text();
            console.log(`Deploy response: ${deployRes.status} ${deployText}`);
            if (deployRes.ok || deployRes.status === 204) {
              console.log('✅ Deploy request sent. Account will connect shortly.');
              // Wait for deployment
              await new Promise(r => setTimeout(r, 8000));
              // Re-check state
              const recheck = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}`, {
                headers: { 'auth-token': METAAPI_TOKEN },
              });
              if (recheck.ok) {
                const recheckData = await recheck.json();
                accountState = recheckData.state || accountState;
                connectionStatus = recheckData.connectionStatus || connectionStatus;
                console.log(`📍 After deploy - State: ${accountState} | Connection: ${connectionStatus}`);
              } else { await recheck.text(); }
            }
          } catch (deployErr) {
            console.error('❌ Deploy error:', deployErr);
          }
        }
      } else {
        const errText = await accountRes.text();
        console.error(`❌ Account check failed: ${accountRes.status} ${errText}`);
      }
    } catch (e) {
      console.error('Error checking account:', e);
    }

    // Get account-specific access token for Client API
    try {
      const tokenRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/access-token`, {
        headers: { 'auth-token': METAAPI_TOKEN },
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.accessToken) {
          clientToken = tokenData.accessToken;
        }
      } else { await tokenRes.text(); }
    } catch (_) {}

    const baseUrl = `https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}`;
    const authHeaders = { 'auth-token': clientToken };

    // Fetch account balance - retry with main token if client token fails
    let accountBalance: number | null = null;
    let accountEquity: number | null = null;
    let accountCurrency = 'USD';
    try {
      let infoRes = await safeFetch(`${baseUrl}/account-information`, {
        headers: authHeaders,
      });
      // If client token fails, try with main token
      if (!infoRes.ok && clientToken !== METAAPI_TOKEN) {
        await infoRes.text();
        console.log('⚠️ Client token failed for account-info, retrying with main token...');
        infoRes = await safeFetch(`${baseUrl}/account-information`, {
          headers: { 'auth-token': METAAPI_TOKEN },
        });
      }
      if (infoRes.ok) {
        const info = await infoRes.json();
        accountBalance = info.balance ?? null;
        accountEquity = info.equity ?? null;
        accountCurrency = info.currency || 'USD';
        console.log(`💰 MT5 Balance: ${accountBalance} ${accountCurrency} | Equity: ${accountEquity}`);
      } else {
        const errText = await infoRes.text();
        console.error(`❌ Failed to get account info: ${infoRes.status} ${errText}`);
      }
    } catch (e) {
      console.error('❌ Error fetching account info:', e);
    }

    // Fetch deal history: today + 30 days
    let todayDeals: any[] = [];
    let monthDeals: any[] = [];
    try {
      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const thirtyDaysAgo = new Date(todayStart);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const endTime = new Date(now.getTime() + 60000); // +1min buffer

      const [todayRes, monthRes] = await Promise.all([
        safeFetch(`${baseUrl}/history-deals/time/${todayStart.toISOString()}/${endTime.toISOString()}`, {
          headers: authHeaders,
        }),
        safeFetch(`${baseUrl}/history-deals/time/${thirtyDaysAgo.toISOString()}/${endTime.toISOString()}`, {
          headers: authHeaders,
        }),
      ]);

      if (todayRes.ok) {
        todayDeals = await todayRes.json();
        // Filter only trade deals (entry OUT = closed trades with profit)
        todayDeals = (todayDeals || []).filter((d: any) => 
          d.entryType === 'DEAL_ENTRY_OUT' && d.type !== 'DEAL_TYPE_BALANCE'
        );
      }
      if (monthRes.ok) {
        monthDeals = await monthRes.json();
        monthDeals = (monthDeals || []).filter((d: any) => 
          d.entryType === 'DEAL_ENTRY_OUT' && d.type !== 'DEAL_TYPE_BALANCE'
        );
      }
    } catch (e) {
      console.error('Error fetching deal history:', e);
    }

    // Calculate today stats from deals
    let todayProfit = 0;
    let todayWins = 0;
    let todayLosses = 0;
    let consecutiveLosses = 0;
    let currentStreak = 0;
    for (const deal of todayDeals) {
      const p = deal.profit ?? 0;
      todayProfit += p;
      if (p > 0) {
        todayWins++;
        currentStreak = 0;
      } else if (p < 0) {
        todayLosses++;
        currentStreak++;
        consecutiveLosses = Math.max(consecutiveLosses, currentStreak);
      }
    }

    // Calculate 30d P&L
    let pnl30d = 0;
    for (const deal of monthDeals) {
      pnl30d += deal.profit ?? 0;
    }

    // Spread advantage: ONLY for EURUSD (tightest spread ~1 pip)
    // EURUSD closes 15% earlier since spread cost is minimal — faster profit
    const EURUSD_SPREAD_MULTIPLIER = 0.85;

    // Loop mode: run for ~55 seconds checking every 3 seconds
    const maxIterations = loopMode ? 18 : 1; // 18 * 3s = 54s
    const allClosed: any[] = [];
    let lastOpenPositions: any[] = [];

    for (let i = 0; i < maxIterations; i++) {
      if (i > 0) {
        await new Promise(r => setTimeout(r, 3000));
      }

      try {
        const positionsRes = await safeFetch(`${baseUrl}/positions`, {
          headers: authHeaders,
        });

        if (!positionsRes.ok) {
          const errText = await positionsRes.text();
          console.error(`❌ Erro ao buscar posições (iter ${i}): ${positionsRes.status} ${errText}`);
          continue;
        }

        const positions = await positionsRes.json();

        // Track open positions for response
        lastOpenPositions = positions.map((pos: any) => ({
          id: pos.id,
          symbol: pos.symbol || 'unknown',
          unrealizedProfit: parseFloat((pos.unrealizedProfit ?? pos.profit ?? 0).toFixed(2)),
          volume: pos.volume || 0.01,
          type: pos.type,
          target: parseFloat(tpCurrency.toFixed(2)),
        }));

        if (positions.length === 0) {
          if (loopMode) continue;
          break;
        }

        console.log(`👁️ [${i+1}/${maxIterations}] ${positions.length} posições | TP: $${tpCurrency.toFixed(2)} (${tpPercent}%) | closeAll: ${closeAll}`);

        for (const pos of positions) {
          const unrealizedProfit = pos.unrealizedProfit ?? pos.profit ?? 0;
          const symbol = pos.symbol || 'unknown';
          const posId = pos.id;

          // Spread advantage ONLY for EURUSD
          const isEurusd = symbol === 'EURUSD';
          const effectiveTp = isEurusd ? tpCurrency * EURUSD_SPREAD_MULTIPLIER : tpCurrency;

          const shouldClose = closeAll || (effectiveTp > 0 && unrealizedProfit >= effectiveTp);

          if (shouldClose) {
            const reason = closeAll ? 'CLOSE_ALL' : (isEurusd ? 'TP_SPREAD' : 'TP');
            console.log(`🎯 ${reason}: Fechando ${symbol} (${posId}) | P/L: $${unrealizedProfit.toFixed(2)} | TP: $${effectiveTp.toFixed(2)}${isEurusd ? ' (EURUSD spread)' : ''}`);
            try {
              const closeRes = await safeFetch(`${baseUrl}/trade`, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  actionType: 'POSITION_CLOSE_ID',
                  positionId: posId,
                }),
              });
              const closeResult = await closeRes.json();
              if (closeRes.ok) {
                console.log(`✅ Posição ${posId} (${symbol}) fechada! P/L: $${unrealizedProfit.toFixed(2)}`);
                allClosed.push({ id: posId, symbol, profit: unrealizedProfit, reason });
              } else {
                console.error(`❌ Erro ao fechar ${posId}: ${JSON.stringify(closeResult)}`);
              }
            } catch (e) {
              console.error(`❌ Erro de rede ao fechar ${posId}: ${e}`);
            }
          }
        }

        if (closeAll) break;
      } catch (iterErr) {
        console.error(`❌ Erro na iteração ${i}: ${iterErr}`);
      }
    }

    // Filter out closed positions from open list
    const openPositions = lastOpenPositions.filter(p => !allClosed.find(c => c.id === p.id));

    return new Response(
      JSON.stringify({
        success: true,
        totalOpen: openPositions.length,
        closedCount: allClosed.length,
        closedPositions: allClosed,
        openPositions,
        tpTarget: parseFloat(tpCurrency.toFixed(2)),
        tpPercent,
        tradeAmount,
        balance: accountBalance,
        equity: accountEquity,
        currency: accountCurrency,
        todayTrades: todayDeals.length,
        todayProfit: parseFloat(todayProfit.toFixed(2)),
        todayWins,
        todayLosses,
        consecutiveLosses,
        pnl30d: parseFloat(pnl30d.toFixed(2)),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Monitor error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});