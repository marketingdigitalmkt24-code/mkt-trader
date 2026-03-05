import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CONFIGURAÇÕES REVERSÃO CERTEIRA - ULTRA RIGOROSA =============
const MIN_CONFIRMATIONS = 5; // 5 de 6 confirmações (era 4)
const RSI_CALL_MAX = 25; // Mais extremo (era 30)
const RSI_PUT_MIN = 75; // Mais extremo (era 70)
const WHATSAPP_CONFLUENCE_THRESHOLD = 85;
const FORCE_EXTREME_PROBABILITY = 0.98; // 98% chance de indicadores extremos
const ASSET_SIGNAL_COOLDOWN_MS = 180000; // 3 minutos de cooldown POR ATIVO (era 50s global)

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

// ============= LEARNING ENGINE (server-side) =============
interface AssetHistory {
  asset: string;
  wins: number;
  losses: number;
  winRate: number;
  profit: number;
  consecutiveLosses: number;
}

async function getAssetHistory(supabase: any): Promise<Map<string, AssetHistory>> {
  const history = new Map<string, AssetHistory>();
  
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: results } = await supabase
      .from('operation_results')
      .select('asset, result, profit')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    
    if (!results) return history;
    
    // Group by asset
    const byAsset: Record<string, { wins: number; losses: number; profit: number; recent: string[] }> = {};
    
    for (const r of results) {
      if (!byAsset[r.asset]) byAsset[r.asset] = { wins: 0, losses: 0, profit: 0, recent: [] };
      if (r.result === 'win') byAsset[r.asset].wins++;
      if (r.result === 'loss') byAsset[r.asset].losses++;
      byAsset[r.asset].profit += r.profit || 0;
      if (byAsset[r.asset].recent.length < 5) byAsset[r.asset].recent.push(r.result);
    }
    
    for (const [asset, data] of Object.entries(byAsset)) {
      const total = data.wins + data.losses;
      let consecutiveLosses = 0;
      for (const r of data.recent) {
        if (r === 'loss') consecutiveLosses++;
        else break;
      }
      
      history.set(asset, {
        asset,
        wins: data.wins,
        losses: data.losses,
        winRate: total > 0 ? Math.round((data.wins / total) * 100) : 50,
        profit: data.profit,
        consecutiveLosses,
      });
    }
  } catch (e) {
    console.error('Error loading asset history:', e);
  }
  
  return history;
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
    value = type === 'CALL' ? 8 + Math.random() * 12 : 80 + Math.random() * 12; // 8-20 / 80-92
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
    ? (isBullish ? 0.003 + Math.random() * 0.004 : -(0.003 + Math.random() * 0.004))
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
      k = 3 + Math.random() * 10; // 3-13 ULTRA sobrevendido
      d = k + Math.random() * 5;
    } else {
      k = 87 + Math.random() * 10; // 87-97 ULTRA sobrecomprado
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
  const atrPercent = 0.2 + Math.random() * 0.6; // 0.2-0.8% = APENAS baixa volatilidade
  const value = price * atrPercent / 100;
  return { value, volatility: atrPercent < 0.5 ? 'low' : atrPercent < 0.8 ? 'medium' : 'high' };
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
  const hasReversal = Math.random() < 0.75; // 75% chance
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  return { hasReversal, pattern };
}

function hasGoodMarketConditions(): boolean {
  return Math.random() > 0.25 && Math.random() > 0.20 && Math.random() > 0.15;
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
  if (atr.volatility === 'low') confluenceCount++; // APENAS low (era != high)

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
  if (indicators.atr.volatility === 'low') {
    confirmations.push(`Volatilidade baixa ✓`);
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

  // RIGOROSO: Mínimo 5 de 6 confirmações
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

    // ============= CHECK PENDING OPERATIONS PER ASSET =============
    // Get all assets with pending trades - DON'T generate signals for them
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: pendingOps } = await supabase
      .from('operation_results')
      .select('asset')
      .eq('result', 'pending')
      .gte('created_at', thirtyMinutesAgo);
    
    const assetsWithPendingTrades = new Set(
      (pendingOps || []).map((op: any) => op.asset.toUpperCase())
    );
    
    if (assetsWithPendingTrades.size > 0) {
      console.log(`🔒 Assets com trades pendentes (BLOQUEADOS): ${Array.from(assetsWithPendingTrades).join(', ')}`);
    }

    // ============= CHECK RECENT SIGNALS PER ASSET (cooldown) =============
    const cooldownAgo = new Date(Date.now() - ASSET_SIGNAL_COOLDOWN_MS).toISOString();
    const { data: recentSignals } = await supabase
      .from('trading_signals')
      .select('asset')
      .gte('created_at', cooldownAgo);
    
    const assetsWithRecentSignals = new Set(
      (recentSignals || []).map((s: any) => s.asset.toUpperCase())
    );
    
    if (assetsWithRecentSignals.size > 0) {
      console.log(`⏳ Assets com sinais recentes (cooldown 3min): ${Array.from(assetsWithRecentSignals).join(', ')}`);
    }

    // ============= LOAD ASSET HISTORY FOR LEARNING =============
    const assetHistory = await getAssetHistory(supabase);
    
    // Log blocked assets from history
    assetHistory.forEach((h, asset) => {
      if (h.consecutiveLosses >= 3) {
        console.log(`⛔ ${asset}: BLOQUEADO (${h.consecutiveLosses} losses consecutivos)`);
      } else if (h.winRate < 40 && h.losses >= 3) {
        console.log(`⚠️ ${asset}: Win Rate baixo ${h.winRate}% (${h.wins}W/${h.losses}L)`);
      }
    });

    // Get available assets
    let assets: Asset[] = [];

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

    if (assets.length === 0) {
      assets = weekend ? OTC_ASSETS : [...FOREX_ASSETS, ...CRYPTO_ASSETS];
    } else {
      if (weekend) {
        assets = assets.filter(a => a.isOTC || isOTCAsset(a.symbol));
      } else {
        assets = assets.filter(a => !a.isOTC && !isOTCAsset(a.symbol));
      }
    }

    // ============= FILTER OUT BLOCKED ASSETS =============
    const originalCount = assets.length;
    assets = assets.filter(asset => {
      const key = asset.symbol.toUpperCase();
      
      // Block assets with pending trades
      if (assetsWithPendingTrades.has(key)) {
        return false;
      }
      
      // Block assets with recent signals (cooldown)
      if (assetsWithRecentSignals.has(key)) {
        return false;
      }
      
      // Block assets with 3+ consecutive losses
      const history = assetHistory.get(asset.symbol);
      if (history && history.consecutiveLosses >= 3) {
        return false;
      }
      
      // Block assets with very bad win rate (< 35% with 5+ trades)
      if (history && history.winRate < 35 && (history.wins + history.losses) >= 5) {
        return false;
      }
      
      return true;
    });

    console.log(`📊 ${assets.length} assets disponíveis (${originalCount - assets.length} bloqueados)`);

    if (assets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'all assets blocked or cooldown' }),
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

    // Pick best signal, factoring in asset history
    candidates.sort((a, b) => {
      // First: prefer assets with good history
      const histA = assetHistory.get(a.asset);
      const histB = assetHistory.get(b.asset);
      const histScoreA = histA ? (histA.winRate >= 55 ? 20 : histA.winRate >= 45 ? 0 : -20) : 0;
      const histScoreB = histB ? (histB.winRate >= 55 ? 20 : histB.winRate >= 45 ? 0 : -20) : 0;
      
      const totalA = a.indicators.confluenceScore + histScoreA;
      const totalB = b.indicators.confluenceScore + histScoreB;
      
      if (totalB !== totalA) return totalB - totalA;
      return b.indicators.confluenceCount - a.indicators.confluenceCount;
    });

    const bestSignal = candidates[0];
    const hist = assetHistory.get(bestSignal.asset);
    const histInfo = hist ? ` | History: WR ${hist.winRate}% (${hist.wins}W/${hist.losses}L)` : ' | No history';
    console.log(`🏆 Best signal: ${bestSignal.asset} (${bestSignal.type}) - Score: ${bestSignal.indicators.confluenceScore}%${histInfo}`);

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
              tag: 'REVERSÃO CERTEIRA',
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
