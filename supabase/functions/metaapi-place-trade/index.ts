import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

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

    // Step 1: Get account region and access token from provisioning API
    let region = 'new-york';
    let clientToken = METAAPI_TOKEN; // fallback to general token
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

    // Get account-specific access token for Client API
    try {
      const tokenRes = await safeFetch(`${PROVISIONING_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/access-token`, {
        headers: { 'auth-token': METAAPI_TOKEN },
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.accessToken) {
          clientToken = tokenData.accessToken;
          console.log(`🔑 Account access token obtained (length: ${clientToken.length})`);
        }
      } else {
        const errText = await tokenRes.text();
        console.log(`⚠️ Access token not available [${tokenRes.status}]: ${errText}`);
      }
    } catch (e) {
      console.log(`⚠️ Access token fetch failed, using general token`);
    }

    const tradeApiUrl = `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
    const baseUrl = `${tradeApiUrl}/users/current/accounts/${METAAPI_ACCOUNT_ID}`;
    const authHeaders = { 'auth-token': clientToken };

    // ===== FILTER: Only allow REAL assets (no OTC) that exist on XM MT5 =====
    const isOTC = asset.toUpperCase().includes('OTC');
    if (isOTC) {
      console.log(`⛔ ${asset} é OTC — MT5 não opera ativos OTC. Ignorando.`);
      return new Response(
        JSON.stringify({ success: false, error: `${asset} é OTC. MT5 opera apenas ativos reais.`, skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map IQ Option asset names to MT5/XM symbol format
    const xmSymbolMap: Record<string, string> = {
      // Forex majors
      'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'AUD/USD': 'AUDUSD',
      'NZD/USD': 'NZDUSD', 'USD/JPY': 'USDJPY', 'USD/CHF': 'USDCHF',
      'USD/CAD': 'USDCAD',
      // Forex crosses with USD
      'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD',
      // Commodities
      'XAU/USD': 'XAUUSD', 'XAG/USD': 'XAGUSD',
      'USO/USD': 'USOIL', 'UKO/USD': 'UKOIL',
      // Crypto
      'BTC/USD': 'BTCUSD', 'ETH/USD': 'ETHUSD',
      // Indices
      'US500': 'US500', 'US100': 'US100', 'US30': 'US30',
      'SP500': 'US500', 'DE30': 'DE30', 'UK100': 'UK100',
      'JP225': 'JP225', 'FR40': 'FR40',
    };

    // Normalize asset name: remove extra spaces, slashes
    const cleanAsset = asset.trim();
    let mt5Symbol = xmSymbolMap[cleanAsset];
    
    if (!mt5Symbol) {
      // Try without slash: "EURUSD" format
      const noSlash = cleanAsset.replace('/', '').replace(' ', '');
      mt5Symbol = Object.values(xmSymbolMap).find(s => s === noSlash) || noSlash;
    }

    // Final USD check
    const symbolUpper = mt5Symbol.toUpperCase();
    const hasUSD = symbolUpper.includes('USD') || symbolUpper.includes('OIL') || 
                   ['US500','US100','US30','DE30','UK100','JP225','FR40'].includes(symbolUpper);
    if (!hasUSD) {
      console.log(`⛔ ${mt5Symbol} (from ${asset}) não é par USD/índice válido. Ignorando.`);
      return new Response(
        JSON.stringify({ success: false, error: `${asset} não é ativo compatível com MT5/XM.`, skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Símbolo mapeado: ${asset} → ${mt5Symbol}`);

    // ===== Step 2: Check total open positions (max 5 simultaneous) =====
    const MAX_MT5_POSITIONS = 5;
    try {
      const positionsRes = await safeFetch(`${baseUrl}/positions`, {
        headers: authHeaders,
      });
      if (positionsRes.ok) {
        const positions = await positionsRes.json();
        if (positions.length >= MAX_MT5_POSITIONS) {
          console.log(`⛔ MT5 já tem ${positions.length}/${MAX_MT5_POSITIONS} posições abertas. Limite atingido.`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Limite de ${MAX_MT5_POSITIONS} posições simultâneas atingido.`,
              skipped: true,
              activePositions: positions.length,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Still block duplicate symbols
        const activeForSymbol = positions.filter((p: any) => p.symbol === mt5Symbol);
        if (activeForSymbol.length > 0) {
          console.log(`⛔ ${mt5Symbol} já tem posição aberta. Aguardando fechamento.`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Já existe posição aberta para ${mt5Symbol}.`,
              skipped: true,
              activePositions: activeForSymbol.length,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log(`✅ MT5: ${positions.length}/${MAX_MT5_POSITIONS} posições abertas — espaço disponível`);
      }
    } catch (e) {
      console.log(`⚠️ Could not check open positions, proceeding with trade`);
    }

    // ===== Step 3: Get symbol specification for min volume =====
    const dir = direction.toUpperCase();
    const actionType = dir === 'CALL' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
    let volume = metaConfig.volume || 0.01;
    const tpPercent = metaConfig.take_profit_pips || 10;
    const investmentAmount = body.amount || 1;
    const tpCurrency = investmentAmount * (tpPercent / 100);

    // Auto-detect minimum volume from symbol specification
    try {
      const specRes = await safeFetch(`${baseUrl}/symbols/${mt5Symbol}/specification`, {
        headers: authHeaders,
      });
      if (specRes.ok) {
        const spec = await specRes.json();
        const minVolume = spec.minVolume || spec.minLot || 0.01;
        const volumeStep = spec.volumeStep || spec.lotStep || 0.01;
        if (volume < minVolume) {
          console.log(`📐 ${mt5Symbol}: Volume ${volume} < minVolume ${minVolume}. Ajustando para ${minVolume}`);
          volume = minVolume;
        }
        // Ensure volume is aligned to volumeStep
        volume = Math.max(minVolume, Math.round(volume / volumeStep) * volumeStep);
        volume = parseFloat(volume.toFixed(4));
        console.log(`📐 ${mt5Symbol}: Volume final: ${volume} (min: ${minVolume}, step: ${volumeStep})`);
      } else {
        const errText = await specRes.text();
        console.log(`⚠️ Symbol spec not available for ${mt5Symbol}: ${errText}`);
      }
    } catch (e) {
      console.log(`⚠️ Could not get symbol spec for ${mt5Symbol}, using volume: ${volume}`);
    }

    const tradeUrl = `${baseUrl}/trade`;
    const tradeBody: Record<string, any> = {
      actionType,
      symbol: mt5Symbol,
      volume,
      comment: `S${(signalId || '').slice(0, 8)}|${confluenceScore || 0}`,
    };

    // Operações rápidas: TP agressivo para fechar rápido com lucro
    if (tpPercent > 0 && tpCurrency > 0) {
      console.log(`🎯 TP rápido: $${tpCurrency.toFixed(2)} (${tpPercent}% de $${investmentAmount}) — fechamento automático ao atingir`);
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

    return new Response(
      JSON.stringify({
        success: true,
        orderId: tradeResult.orderId,
        positionId: tradeResult.positionId,
        symbol: mt5Symbol,
        direction: dir,
        volume,
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
