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

    // Get region
    let region = 'new-york';
    try {
      const accountRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}`, {
        headers: { 'auth-token': METAAPI_TOKEN },
      });
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        region = accountData.region || 'new-york';
      } else {
        await accountRes.text();
      }
    } catch (_) {}

    const baseUrl = `https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}`;
    const authHeaders = { 'auth-token': METAAPI_TOKEN };

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

          const shouldClose = closeAll || (tpCurrency > 0 && unrealizedProfit >= tpCurrency);

          if (shouldClose) {
            const reason = closeAll ? 'CLOSE_ALL' : 'TP';
            console.log(`🎯 ${reason}: Fechando ${symbol} (${posId}) | P/L: $${unrealizedProfit.toFixed(2)}`);
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