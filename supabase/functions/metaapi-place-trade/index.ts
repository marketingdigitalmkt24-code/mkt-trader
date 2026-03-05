import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MetaAPI endpoints
const TRADE_API_URL = 'https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai';

async function metaApiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Try with default fetch first, fall back to custom client if TLS fails
  try {
    return await fetch(url, options);
  } catch (e: any) {
    if (e.message?.includes('certificate') || e.message?.includes('tls') || e.message?.includes('ssl')) {
      console.log('⚠️ TLS error, retrying with custom HTTP client...');
      try {
        // @ts-ignore - Deno API
        const client = Deno.createHttpClient({ caCerts: [] });
        return await fetch(url, { ...options, client } as any);
      } catch (e2) {
        console.error('❌ Custom client also failed:', e2);
        throw e; // throw original error
      }
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
    // Read config from DB
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

    console.log(`🔄 MT5 Trade Request: ${asset} ${direction} | Signal: ${signalId}`);

    // Map asset symbol to MT5 format
    let mt5Symbol = asset.replace('/', '').replace('-OTC', 'otc').replace(' ', '');
    const symbolMap: Record<string, string> = {
      'BTCUSD': 'BTCUSD',
      'ETHUSD': 'ETHUSD',
      'EURUSD': 'EURUSD',
      'GBPUSD': 'GBPUSD',
      'USDJPY': 'USDJPY',
      'GBPJPY': 'GBPJPY',
      'EURJPY': 'EURJPY',
      'AUDUSD': 'AUDUSD',
      'XAUUSD': 'XAUUSD',
      'NZDCAD': 'NZDCAD',
      'EURNZD': 'EURNZD',
    };
    if (symbolMap[mt5Symbol]) {
      mt5Symbol = symbolMap[mt5Symbol];
    }

    const dir = direction.toUpperCase();
    const actionType = dir === 'CALL' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
    const volume = metaConfig.volume || 0.01;

    // Place the trade via MetaAPI REST
    const tradeUrl = `${TRADE_API_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/trade`;

    const tradeBody = {
      actionType,
      symbol: mt5Symbol,
      volume,
      comment: `Signal:${signalId || 'manual'}|Score:${confluenceScore || 0}`,
    };

    console.log(`📤 Sending trade to MT5: ${JSON.stringify(tradeBody)}`);

    const tradeRes = await metaApiFetch(tradeUrl, {
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
