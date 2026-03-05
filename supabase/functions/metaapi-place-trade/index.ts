import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const METAAPI_BASE_URL = 'https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai';

interface TradeRequest {
  asset: string;
  direction: 'call' | 'put' | 'CALL' | 'PUT';
  amount: number;
  expiration: number; // minutes
  signalId?: string;
  confluenceScore?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const METAAPI_TOKEN = Deno.env.get('METAAPI_TOKEN');
    const METAAPI_ACCOUNT_ID = Deno.env.get('METAAPI_ACCOUNT_ID');

    if (!METAAPI_TOKEN) {
      throw new Error('METAAPI_TOKEN não configurado');
    }
    if (!METAAPI_ACCOUNT_ID) {
      throw new Error('METAAPI_ACCOUNT_ID não configurado');
    }

    const body: TradeRequest = await req.json();
    const { asset, direction, amount, expiration, signalId, confluenceScore } = body;

    console.log(`🔄 MT5 Trade Request: ${asset} ${direction} $${amount} | Signal: ${signalId}`);

    // Map asset symbol to MT5 format (e.g. EUR/USD -> EURUSD, EUR/USD-OTC -> EURUSDotc)
    let mt5Symbol = asset.replace('/', '').replace('-OTC', 'otc').replace(' ', '');
    // Common MT5 symbol mappings
    const symbolMap: Record<string, string> = {
      'BTCUSD': 'BTCUSD',
      'ETHUSD': 'ETHUSD',
      'EURUSD': 'EURUSD',
      'GBPUSD': 'GBPUSD',
      'USDJPY': 'USDJPY',
      'GBPJPY': 'GBPJPY',
      'EURJPY': 'EURJPY',
      'AUDUSD': 'AUDUSD',
    };
    if (symbolMap[mt5Symbol]) {
      mt5Symbol = symbolMap[mt5Symbol];
    }

    const dir = direction.toUpperCase();
    const actionType = dir === 'CALL' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
    
    // Volume in lots (amount in USD / 100000 for forex, simplified)
    const volume = Math.max(0.01, Math.round((amount / 100) * 100) / 100);

    // Calculate SL/TP based on expiration
    // For binary-style: we use a tight SL/TP
    const slPips = 50; // 5 pips stop loss
    const tpPips = 50; // 5 pips take profit

    // 1. First check account connection status
    const accountUrl = `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}`;
    const accountRes = await fetch(accountUrl, {
      headers: { 'auth-token': METAAPI_TOKEN },
    });

    if (!accountRes.ok) {
      const errText = await accountRes.text();
      console.error(`❌ MetaAPI account check failed [${accountRes.status}]: ${errText}`);
      throw new Error(`Conta MetaAPI não encontrada: ${accountRes.status}`);
    }

    const accountData = await accountRes.json();
    console.log(`✅ MetaAPI Account: ${accountData.name} | State: ${accountData.state} | Connection: ${accountData.connectionStatus}`);

    if (accountData.state !== 'DEPLOYED' || accountData.connectionStatus !== 'CONNECTED') {
      // Try to deploy if not deployed
      if (accountData.state !== 'DEPLOYED') {
        console.log('📡 Deploying MetaAPI account...');
        await fetch(`${accountUrl}/deploy`, {
          method: 'POST',
          headers: { 'auth-token': METAAPI_TOKEN },
        });
        // Wait a bit for deployment
        await new Promise(r => setTimeout(r, 3000));
      }
      
      console.log(`⚠️ Account not fully connected. State: ${accountData.state}, Connection: ${accountData.connectionStatus}`);
    }

    // 2. Place the trade via MetaAPI REST
    const tradeUrl = `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/trade`;
    
    const tradeBody = {
      actionType,
      symbol: mt5Symbol,
      volume,
      comment: `Signal:${signalId || 'manual'}|Score:${confluenceScore || 0}`,
    };

    console.log(`📤 Sending trade to MT5: ${JSON.stringify(tradeBody)}`);

    const tradeRes = await fetch(tradeUrl, {
      method: 'POST',
      headers: {
        'auth-token': METAAPI_TOKEN,
        'Content-Type': 'application/json',
      },
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
