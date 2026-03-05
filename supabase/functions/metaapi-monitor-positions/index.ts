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
        JSON.stringify({ success: false, openPositions: 0, closedPositions: 0, error: 'MetaAPI não configurado' }),
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
        await accountRes.text(); // consume body
      }
    } catch (_) {}

    const baseUrl = `https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}`;
    const authHeaders = { 'auth-token': METAAPI_TOKEN };

    // Get all open positions
    const positionsRes = await safeFetch(`${baseUrl}/positions`, {
      headers: authHeaders,
    });

    if (!positionsRes.ok) {
      const errText = await positionsRes.text();
      return new Response(
        JSON.stringify({ success: false, error: `Failed to get positions: ${positionsRes.status}`, details: errText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const positions = await positionsRes.json();
    const closedPositions: any[] = [];
    const openPositions: any[] = [];

    // Get user trading settings for investment amount
    const { data: tradingSettings } = await supabase
      .from('user_trading_settings')
      .select('trade_amount')
      .limit(1)
      .maybeSingle();

    const investmentAmount = tradingSettings?.trade_amount || 1;
    const tpCurrency = investmentAmount * (tpPercent / 100);

    for (const pos of positions) {
      const unrealizedProfit = pos.unrealizedProfit ?? pos.profit ?? 0;
      const symbol = pos.symbol || 'unknown';
      const posId = pos.id;

      openPositions.push({
        id: posId,
        symbol,
        unrealizedProfit: parseFloat(unrealizedProfit.toFixed(2)),
        volume: pos.volume,
        type: pos.type,
        target: parseFloat(tpCurrency.toFixed(2)),
      });

      // Check if profit target reached
      if (tpCurrency > 0 && unrealizedProfit >= tpCurrency) {
        console.log(`🎯 TP atingido para ${symbol} (pos ${posId})! P/L: $${unrealizedProfit.toFixed(2)} >= $${tpCurrency.toFixed(2)}. Fechando...`);
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
            console.log(`✅ Posição ${posId} (${symbol}) fechada! Lucro: $${unrealizedProfit.toFixed(2)}`);
            closedPositions.push({ id: posId, symbol, profit: unrealizedProfit });
          } else {
            console.error(`❌ Erro ao fechar ${posId}: ${JSON.stringify(closeResult)}`);
          }
        } catch (e) {
          console.error(`❌ Erro de rede ao fechar ${posId}: ${e}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalOpen: positions.length - closedPositions.length,
        closedCount: closedPositions.length,
        closedPositions,
        openPositions: openPositions.filter(p => !closedPositions.find(c => c.id === p.id)),
        tpTarget: parseFloat(tpCurrency.toFixed(2)),
        tpPercent,
        investmentAmount,
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
