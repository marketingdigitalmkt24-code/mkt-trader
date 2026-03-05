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
      console.log('⚠️ TLS fallback...');
      // @ts-ignore
      const client = Deno.createHttpClient({ caCerts: [] });
      return await fetch(url, { ...options, client } as any);
    }
    throw e;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface TradeRequest {
  asset: string;
  direction: 'call' | 'put' | 'CALL' | 'PUT';
  amount: number;
  expiration: number;
  signalId?: string;
  confluenceScore?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      throw new Error('MetaAPI não configurado ou desativado');
    }

    const METAAPI_TOKEN = metaConfig.token;
    const METAAPI_ACCOUNT_ID = metaConfig.account_id;

    if (!METAAPI_TOKEN || !METAAPI_ACCOUNT_ID) {
      throw new Error('Token ou Account ID MetaAPI não configurados');
    }

    const body: TradeRequest = await req.json();
    const { asset, direction, signalId, confluenceScore } = body;

    console.log(`🔄 MT5 Trade Request: ${asset} ${direction} | Signal: ${signalId} | AccountID: ${METAAPI_ACCOUNT_ID}`);

    // Step 1: Get account region from provisioning API
    let region = 'new-york';
    try {
      const accountRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}`, {
        headers: { 'auth-token': METAAPI_TOKEN },
      });
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        region = accountData.region || 'new-york';
        console.log(`📍 Account region: ${region} | State: ${accountData.state} | Connection: ${accountData.connectionStatus}`);
      }
    } catch (e) {
      console.log(`⚠️ Region lookup failed, using default: ${region}`);
    }

    const tradeApiUrl = `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
    const baseUrl = `${tradeApiUrl}/users/current/accounts/${METAAPI_ACCOUNT_ID}`;
    const authHeaders = { 'auth-token': METAAPI_TOKEN };

    // Map asset symbol to MT5 format
    let mt5Symbol = asset.replace('/', '').replace('-OTC', 'otc').replace(' ', '');
    const symbolMap: Record<string, string> = {
      'BTCUSD': 'BTCUSD', 'ETHUSD': 'ETHUSD', 'EURUSD': 'EURUSD',
      'GBPUSD': 'GBPUSD', 'USDJPY': 'USDJPY', 'GBPJPY': 'GBPJPY',
      'EURJPY': 'EURJPY', 'AUDUSD': 'AUDUSD', 'XAUUSD': 'XAUUSD',
      'NZDCAD': 'NZDCAD', 'EURNZD': 'EURNZD', 'GBPAUD': 'GBPAUD',
      'GBPCHF': 'GBPCHF', 'AUDCAD': 'AUDCAD', 'AUDJPY': 'AUDJPY',
      'CADJPY': 'CADJPY', 'NZDUSD': 'NZDUSD', 'USDCHF': 'USDCHF',
      'EURGBP': 'EURGBP', 'GBPNZD': 'GBPNZD',
    };
    if (symbolMap[mt5Symbol]) {
      mt5Symbol = symbolMap[mt5Symbol];
    }

    // ===== Step 2: Check for existing open positions on this symbol =====
    try {
      const positionsRes = await safeFetch(`${baseUrl}/positions`, {
        headers: authHeaders,
      });
      if (positionsRes.ok) {
        const positions = await positionsRes.json();
        const activeForSymbol = positions.filter((p: any) => p.symbol === mt5Symbol);
        if (activeForSymbol.length > 0) {
          console.log(`⛔ Symbol ${mt5Symbol} already has ${activeForSymbol.length} active position(s). Skipping trade.`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Já existe posição aberta para ${mt5Symbol}. Aguardando fechamento.`,
              skipped: true,
              activePositions: activeForSymbol.length,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch (e) {
      console.log(`⚠️ Could not check open positions, proceeding with trade`);
    }

    // ===== Step 3: Place the trade =====
    const dir = direction.toUpperCase();
    const actionType = dir === 'CALL' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
    const volume = metaConfig.volume || 0.01;
    const tpPercent = metaConfig.take_profit_pips || 10;
    const investmentAmount = body.amount || 1;
    const tpCurrency = investmentAmount * (tpPercent / 100);

    const tradeUrl = `${baseUrl}/trade`;
    const tradeBody: Record<string, any> = {
      actionType,
      symbol: mt5Symbol,
      volume,
      comment: `S${(signalId || '').slice(0, 8)}|${confluenceScore || 0}`,
    };

    if (tpPercent > 0 && tpCurrency > 0) {
      tradeBody.takeProfit = tpCurrency;
      tradeBody.takeProfitUnits = 'RELATIVE_CURRENCY';
      console.log(`🎯 Take Profit: $${tpCurrency.toFixed(2)} (${tpPercent}% de $${investmentAmount})`);
    }

    console.log(`📤 Sending trade to MT5: ${tradeUrl}`);
    console.log(`📤 Trade body: ${JSON.stringify(tradeBody)}`);

    const tradeRes = await safeFetch(tradeUrl, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(tradeBody),
    });

    const tradeResult = await tradeRes.json();

    if (!tradeRes.ok) {
      console.error(`❌ MT5 trade failed [${tradeRes.status}]: ${JSON.stringify(tradeResult)}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: tradeResult.message || `Trade failed: ${tradeRes.status}`,
          details: tradeResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ MT5 Trade executed: ${JSON.stringify(tradeResult)}`);
    const positionId = tradeResult.positionId;

    // ===== Step 4: Monitor position every 1 second until closed (max 120s) =====
    let positionClosed = false;
    let finalProfit = 0;
    const maxMonitorSeconds = 120;

    if (positionId) {
      console.log(`👁️ Monitoring position ${positionId} every 1s...`);
      for (let i = 0; i < maxMonitorSeconds; i++) {
        await sleep(1000);
        try {
          const posRes = await safeFetch(`${baseUrl}/positions/${positionId}`, {
            headers: authHeaders,
          });
          if (posRes.status === 404) {
            // Position no longer exists = closed
            console.log(`✅ Position ${positionId} closed after ${i + 1}s`);
            positionClosed = true;

            // Try to get the deal from history
            try {
              const historyRes = await safeFetch(
                `${baseUrl}/history-deals-by-position/${positionId}`,
                { headers: authHeaders }
              );
              if (historyRes.ok) {
                const deals = await historyRes.json();
                finalProfit = deals.reduce((sum: number, d: any) => sum + (d.profit || 0), 0);
                console.log(`💰 Position profit: $${finalProfit.toFixed(2)}`);
              }
            } catch (_) { /* ignore */ }
            break;
          } else if (posRes.ok) {
            const posData = await posRes.json();
            const unrealizedProfit = posData.unrealizedProfit || posData.profit || 0;
            if (i % 10 === 0) {
              console.log(`⏳ Position ${positionId} still open | Unrealized P/L: $${unrealizedProfit.toFixed(2)} (${i + 1}s)`);
            }
          }
        } catch (e) {
          // Network error, continue monitoring
        }
      }

      if (!positionClosed) {
        console.log(`⏰ Monitoring timeout (${maxMonitorSeconds}s). Position ${positionId} still open.`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId: tradeResult.orderId,
        positionId,
        symbol: mt5Symbol,
        direction: dir,
        volume,
        positionClosed,
        finalProfit,
        tradeResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ MetaAPI error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
