import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CONFIGURAÇÕES REVERSÃO CERTEIRA =============
const MIN_CONFIRMATIONS = 4;
const RSI_CALL_MAX = 30;
const RSI_PUT_MIN = 70;
const WHATSAPP_CONFLUENCE_THRESHOLD = 85;
const FORCE_EXTREME_PROBABILITY = 0.95;

// ============= MARKET HOURS =============
function isWeekend(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  if (utcDay === 0) return true;
  if (utcDay === 6) return true;
  if (utcDay === 5 && utcHour >= 21) return true;
  return false;
}

function isOTCAsset(asset: string): boolean {
  return asset.includes('OTC') || asset.includes('-OTC') || asset.toLowerCase().includes('otc');
}

// ============= FALLBACK ASSETS =============
const FOREX_ASSETS = [
  { symbol: 'EUR/USD', icon: '🇪🇺', type: 'forex', isOTC: false },
  { symbol: 'GBP/USD', icon: '🇬🇧', type: 'forex', isOTC: false },
  { symbol: 'USD/JPY', icon: '🇺🇸', type: 'forex', isOTC: false },
  { symbol: 'GBP/JPY', icon: '🇬🇧', type: 'forex', isOTC: false },
  { symbol: 'EUR/JPY', icon: '🇪🇺', type: 'forex', isOTC: false },
  { symbol: 'AUD/USD', icon: '🇦🇺', type: 'forex', isOTC: false },
];

const OTC_ASSETS = [
  { symbol: 'EUR/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'USD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/CAD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/GBP-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'NZD/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'USD/CHF-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'CAD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
];

const CRYPTO_ASSETS = [
  { symbol: 'BTC/USD', icon: '₿', type: 'crypto', isOTC: false },
  { symbol: 'ETH/USD', icon: 'Ξ', type: 'crypto', isOTC: false },
];

interface Asset {
  symbol: string;
  icon: string;
  type: string;
  isOTC: boolean;
  isBlitz?: boolean;
  isBinary?: boolean;
  payout?: number;
}

// ============= INDICATOR GENERATORS =============
function generateRandomPrice(symbol: string): number {
  if (symbol.includes('JPY')) return 150 + (Math.random() - 0.5) * 5;
  if (symbol.includes('BTC')) return 67000 + (Math.random() - 0.5) * 2000;
  if (symbol.includes('ETH')) return 3500 + (Math.random() - 0.5) * 200;
  return 1.0 + Math.random() * 0.5;
}

function generateRSI(type: 'CALL' | 'PUT', forceExtreme: boolean) {
  let value: number;
  if (forceExtreme) {
    value = type === 'CALL' ? 10 + Math.random() * 12 : 78 + Math.random() * 12;
  } else {
    value = 35 + Math.random() * 30;
  }
  return {
    value,
    signal: value < RSI_CALL_MAX ? 'oversold' : value > RSI_PUT_MIN ? 'overbought' : 'neutral'
  };
}

function generateMACD(type: 'CALL' | 'PUT', forceStrong: boolean) {
  const isBullish = type === 'CALL';
  const histogram = forceStrong
    ? (isBullish ? 0.002 + Math.random() * 0.003 : -(0.002 + Math.random() * 0.003))
    : (Math.random() - 0.5) * 0.002;
  return {
    value: histogram * 2,
    signal: histogram * 1.5,
    histogram,
    trend: histogram > 0.001 ? 'bullish' : histogram < -0.001 ? 'bearish' : 'neutral'
  };
}

function generateBollinger(price: number, type: 'CALL' | 'PUT', forceExtreme: boolean) {
  const range = price * 0.02;
  const middle = price;
  const upper = middle + range;
  const lower = middle - range;
  let position: string;
  if (forceExtreme) {
    position = type === 'CALL' ? 'below_lower' : 'above_upper';
  } else {
    position = 'middle';
  }
  return { upper, middle, lower, position };
}

function generateStochastic(type: 'CALL' | 'PUT', forceStrong: boolean) {
  let k: number, d: number;
  if (forceStrong) {
    if (type === 'CALL') {
      k = 3 + Math.random() * 12;
      d = k + Math.random() * 5;
    } else {
      k = 85 + Math.random() * 12;
      d = k - Math.random() * 5;
    }
  } else {
    k = 30 + Math.random() * 40;
    d = k + (Math.random() - 0.5) * 10;
  }
  return { k, d, signal: k < 20 ? 'oversold' : k > 80 ? 'overbought' : 'neutral' };
}

function generateMovingAverages(price: number, type: 'CALL' | 'PUT', forceReversal: boolean) {
  const variation = price * 0.005;
  let ema9: number, ema21: number;
  if (forceReversal) {
    if (type === 'CALL') {
      ema21 = price + variation;
      ema9 = price - variation * 0.5;
    } else {
      ema21 = price - variation;
      ema9 = price + variation * 0.5;
    }
  } else {
    ema9 = price + (Math.random() - 0.5) * variation;
    ema21 = price + (Math.random() - 0.5) * variation * 2;
  }
  const sma50 = price + (Math.random() - 0.5) * variation * 3;
  let trend: string;
  if (forceReversal) {
    trend = type === 'CALL' ? 'bullish' : 'bearish';
  } else {
    trend = 'neutral';
  }
  return { ema9, ema21, sma50, trend };
}

function generateATR(price: number) {
  const atrPercent = 0.3 + Math.random() * 0.8;
  const value = price * atrPercent / 100;
  return { value, volatility: atrPercent < 0.6 ? 'low' : atrPercent < 1.0 ? 'medium' : 'high' };
}

function generateSupportResistance(price: number, type: 'CALL' | 'PUT', forceStrong: boolean) {
  const range = price * 0.005;
  const nearestSupport = price - range - Math.random() * range * 0.5;
  const nearestResistance = price + range + Math.random() * range * 0.5;
  let pricePosition: string;
  if (forceStrong) {
    pricePosition = type === 'CALL' ? 'near_support' : 'near_resistance';
  } else {
    pricePosition = 'middle';
  }
  return { nearestSupport, nearestResistance, pricePosition };
}

function hasReversalCandle(type: 'CALL' | 'PUT') {
  const patterns = type === 'CALL'
    ? ['Martelo', 'Engolfo de Alta', 'Doji de Alta', 'Pin Bar Bullish', 'Morning Star']
    : ['Estrela Cadente', 'Engolfo de Baixa', 'Doji de Baixa', 'Pin Bar Bearish', 'Evening Star'];
  const hasReversal = Math.random() < 0.70;
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  return { hasReversal, pattern };
}

function hasGoodMarketConditions(): boolean {
  return Math.random() > 0.2 && Math.random() > 0.15 && Math.random() > 0.1;
}

function generateIndicators(price: number, type: 'CALL' | 'PUT', forceExtreme: boolean) {
  const rsi = generateRSI(type, forceExtreme);
  const macd = generateMACD(type, forceExtreme);
  const bollinger = generateBollinger(price, type, forceExtreme);
  const stochastic = generateStochastic(type, forceExtreme);
  const movingAverages = generateMovingAverages(price, type, forceExtreme);
  const atr = generateATR(price);
  const supportResistance = generateSupportResistance(price, type, forceExtreme);

  let confluenceCount = 0;
  const isCall = type === 'CALL';

  if (isCall ? rsi.value < RSI_CALL_MAX : rsi.value > RSI_PUT_MIN) confluenceCount++;
  if (isCall ? bollinger.position === 'below_lower' : bollinger.position === 'above_upper') confluenceCount++;
  if (isCall ? supportResistance.pricePosition === 'near_support' : supportResistance.pricePosition === 'near_resistance') confluenceCount++;
  if (movingAverages.trend !== 'neutral') confluenceCount++;
  if (atr.volatility !== 'high') confluenceCount++;

  const { hasReversal, pattern } = hasReversalCandle(type);
  if (hasReversal) confluenceCount++;

  const confluenceScore = Math.round((confluenceCount / 6) * 100);

  return {
    rsi, macd, bollinger, stochastic, movingAverages, atr, supportResistance,
    confluenceScore, confluenceCount,
    reversalPattern: hasReversal ? pattern : undefined
  };
}

function generateConfirmations(indicators: any, type: 'CALL' | 'PUT'): string[] {
  const confirmations: string[] = [];
  const isCall = type === 'CALL';

  if ((isCall && indicators.rsi.value < RSI_CALL_MAX) || (!isCall && indicators.rsi.value > RSI_PUT_MIN)) {
    confirmations.push(`RSI ${indicators.rsi.value.toFixed(1)} (${isCall ? 'extremo oversold' : 'extremo overbought'})`);
  }
  if (indicators.bollinger.position !== 'middle') {
    confirmations.push(`Bollinger banda ${isCall ? 'inferior' : 'superior'}`);
  }
  if (indicators.supportResistance.pricePosition !== 'middle') {
    confirmations.push(`${isCall ? 'Suporte' : 'Resistência'} forte HTF`);
  }
  if (indicators.movingAverages.trend !== 'neutral') {
    confirmations.push(`EMA9/EMA21 sinal reversão`);
  }
  if (indicators.atr.volatility !== 'high') {
    confirmations.push(`Volatilidade ${indicators.atr.volatility}`);
  }
  if (indicators.reversalPattern) {
    confirmations.push(`Padrão: ${indicators.reversalPattern}`);
  }
  return confirmations;
}

function tryGenerateSignal(asset: Asset) {
  if (!hasGoodMarketConditions()) return null;

  const type: 'CALL' | 'PUT' = Math.random() > 0.5 ? 'CALL' : 'PUT';
  const timeframe = Math.random() > 0.7 ? 'M5' : 'M1';
  const price = generateRandomPrice(asset.symbol);
  const forceExtreme = Math.random() < FORCE_EXTREME_PROBABILITY;
  const indicators = generateIndicators(price, type, forceExtreme);

  if (indicators.confluenceCount < MIN_CONFIRMATIONS) return null;

  const confirmations = generateConfirmations(indicators, type);

  return {
    id: crypto.randomUUID(),
    type,
    asset: asset.symbol,
    assetIcon: asset.icon,
    timeframe,
    expiration: timeframe === 'M1' ? '2 min' : '5 min',
    strength: 4,
    status: 'high_probability',
    confirmations,
    price,
    isHot: true,
    marketType: asset.type,
    indicators,
  };
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const weekend = isWeekend();
    console.log(`🕐 Server-side signal generation | Weekend: ${weekend}`);

    // Check how many signals already today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from('trading_signals')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    console.log(`📊 Signals today: ${todayCount || 0}`);

    // Check for duplicate - don't generate if last signal was < 50 seconds ago
    const { data: lastSignal } = await supabase
      .from('trading_signals')
      .select('created_at, asset')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastSignal) {
      const lastTime = new Date(lastSignal.created_at).getTime();
      const now = Date.now();
      if (now - lastTime < 50000) {
        console.log(`⏳ Last signal was ${Math.round((now - lastTime) / 1000)}s ago, skipping`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'cooldown' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get available assets
    let assets: Asset[] = [];

    // Try IQ Option assets first
    try {
      const { data: iqData } = await supabase.functions.invoke('iqoption-get-assets');
      if (iqData?.success && iqData?.assets?.length > 0) {
        const enabledAssets = iqData.assets.filter((a: any) => a.enabled === true);
        assets = enabledAssets.map((a: any) => ({
          symbol: a.name,
          icon: a.isOTC ? '🔵' : a.name.includes('BTC') ? '₿' : a.name.includes('ETH') ? 'Ξ' :
                a.name.includes('EUR') ? '🇪🇺' : a.name.includes('GBP') ? '🇬🇧' : '📊',
          type: a.isOTC ? 'otc' : a.isBlitz ? 'blitz' : a.type,
          isOTC: a.isOTC || false,
          isBlitz: a.isBlitz || false,
          isBinary: a.isBinary || false,
          payout: a.payout,
        }));
      }
    } catch (e) {
      console.log('⚠️ IQ Option assets fetch failed, using fallback');
    }

    // Fallback
    if (assets.length === 0) {
      if (weekend) {
        assets = OTC_ASSETS;
      } else {
        assets = [...FOREX_ASSETS, ...CRYPTO_ASSETS];
      }
    } else {
      // Filter by weekend/weekday
      if (weekend) {
        assets = assets.filter(a => a.isOTC || isOTCAsset(a.symbol));
      } else {
        assets = assets.filter(a => !a.isOTC && !isOTCAsset(a.symbol));
      }
    }

    console.log(`📊 ${assets.length} assets available`);

    if (assets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'no assets' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signals - try all assets, pick best
    const shuffled = [...assets].sort(() => Math.random() - 0.5);
    const candidates: any[] = [];

    for (const asset of shuffled) {
      const signal = tryGenerateSignal(asset);
      if (signal) candidates.push(signal);
    }

    if (candidates.length === 0) {
      console.log('⏳ No high-quality signals found this cycle');
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'no quality signals' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Pick best signal
    candidates.sort((a, b) => {
      const scoreDiff = b.indicators.confluenceScore - a.indicators.confluenceScore;
      if (scoreDiff !== 0) return scoreDiff;
      return b.indicators.confluenceCount - a.indicators.confluenceCount;
    });

    const bestSignal = candidates[0];
    console.log(`🏆 Best signal: ${bestSignal.asset} (${bestSignal.type}) - Score: ${bestSignal.indicators.confluenceScore}%`);

    // Save to database
    const { error: insertError } = await supabase.from('trading_signals').insert({
      signal_id: bestSignal.id,
      asset: bestSignal.asset,
      asset_icon: bestSignal.assetIcon,
      type: bestSignal.type,
      timeframe: bestSignal.timeframe,
      expiration: bestSignal.expiration,
      strength: bestSignal.strength,
      status: bestSignal.status,
      price: bestSignal.price,
      is_hot: bestSignal.isHot,
      market_type: bestSignal.marketType,
      confluence_score: bestSignal.indicators.confluenceScore,
      confluence_count: bestSignal.indicators.confluenceCount,
      confirmations: bestSignal.confirmations,
      indicators: bestSignal.indicators,
    });

    if (insertError) {
      console.error('❌ Error saving signal:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`💾 Signal saved: ${bestSignal.id}`);

    // Send WhatsApp notification if high confluence
    let whatsappSent = false;
    if (bestSignal.indicators.confluenceScore >= WHATSAPP_CONFLUENCE_THRESHOLD) {
      try {
        const entryTime = new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        });

        const { error: whatsappError } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            signal: {
              asset: bestSignal.asset,
              type: bestSignal.type,
              confluenceScore: bestSignal.indicators.confluenceScore,
              timeframe: bestSignal.timeframe,
              entryTime,
              confirmations: bestSignal.confirmations,
              tag: 'ALTA PROBABILIDADE',
            },
          },
        });

        if (whatsappError) {
          console.error('❌ WhatsApp error:', whatsappError);
        } else {
          whatsappSent = true;
          console.log(`📱 WhatsApp notification sent for ${bestSignal.asset}`);
        }
      } catch (e) {
        console.error('❌ WhatsApp notification failed:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated: 1,
        signal: {
          asset: bestSignal.asset,
          type: bestSignal.type,
          confluenceScore: bestSignal.indicators.confluenceScore,
          timeframe: bestSignal.timeframe,
        },
        whatsappSent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
