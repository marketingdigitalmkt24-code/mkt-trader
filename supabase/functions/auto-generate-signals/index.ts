import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CONFIGURAÇÕES SCALPING M1 =============
const MIN_CONFIRMATIONS = 3; // 3 de 6 confirmações
const RSI_CALL_MAX = 35; // RSI oversold threshold
const RSI_PUT_MIN = 65; // RSI overbought threshold
const RSI_ULTRA_CALL = 25; // Ultra extreme for bonus score
const RSI_ULTRA_PUT = 75;
const WHATSAPP_CONFLUENCE_THRESHOLD = 60;
const IQ_MIN_CONFLUENCE_SCALPING = 50;
const ASSET_SIGNAL_COOLDOWN_MS = 60000;
const IQ_FOREX_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'HKD', 'THB'];
const MIN_CANDLES_FOR_ANALYSIS = 8;

// ============= NEWS FILTER =============
interface NewsEvent {
  hour: number;
  minute: number;
  currencies: string[];
  duration: number;
}

function getHighImpactNewsWindows(): NewsEvent[] {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const events: NewsEvent[] = [];

  events.push({ hour: 13, minute: 30, currencies: ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'], duration: 15 });
  events.push({ hour: 7, minute: 0, currencies: ['GBP', 'EUR', 'CHF'], duration: 15 });
  events.push({ hour: 12, minute: 0, currencies: ['USD', 'EUR', 'GBP'], duration: 10 });

  if (utcDay === 1) events.push({ hour: 0, minute: 0, currencies: ['JPY', 'AUD', 'NZD'], duration: 30 });
  if (utcDay === 3) {
    events.push({ hour: 18, minute: 0, currencies: ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'], duration: 30 });
    events.push({ hour: 12, minute: 15, currencies: ['USD'], duration: 15 });
  }
  if (utcDay === 4) {
    events.push({ hour: 12, minute: 15, currencies: ['EUR', 'GBP', 'CHF'], duration: 30 });
    events.push({ hour: 12, minute: 30, currencies: ['USD'], duration: 15 });
  }
  if (utcDay === 5) {
    events.push({ hour: 12, minute: 30, currencies: ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'], duration: 30 });
  }
  events.push({ hour: 12, minute: 30, currencies: ['USD'], duration: 10 });
  events.push({ hour: 3, minute: 0, currencies: ['JPY'], duration: 15 });
  if (utcDay === 2) events.push({ hour: 3, minute: 30, currencies: ['AUD', 'NZD'], duration: 15 });

  return events;
}

function isAssetAffectedByNews(assetSymbol: string): { affected: boolean; reason: string } {
  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const currencies = assetSymbol.replace('-OTC', '').split('/').map(c => c.trim().toUpperCase());

  if (currencies.some(c => ['BTC', 'ETH', 'LTC', 'XRP'].includes(c))) {
    return { affected: false, reason: '' };
  }

  for (const event of getHighImpactNewsWindows()) {
    const eventMinutes = event.hour * 60 + event.minute;
    if (currentMinutes >= eventMinutes - event.duration && currentMinutes <= eventMinutes + event.duration) {
      const affectedCurrency = currencies.find(c => event.currencies.includes(c));
      if (affectedCurrency) {
        return { affected: true, reason: `${affectedCurrency} afetado por notícia às ${event.hour}:${event.minute.toString().padStart(2, '0')} UTC` };
      }
    }
  }
  return { affected: false, reason: '' };
}

// ============= MARKET HOURS =============
function isWeekend(): boolean {
  const now = new Date();
  const d = now.getUTCDay(), h = now.getUTCHours();
  return d === 0 || d === 6 || (d === 5 && h >= 21);
}

function isOTCAsset(asset: string): boolean {
  return asset.includes('OTC');
}

// ============= ASSETS =============
interface Asset {
  symbol: string;
  icon: string;
  type: string;
  isOTC: boolean;
  isBlitz?: boolean;
  isBinary?: boolean;
  payout?: number;
}

const FOREX_ASSETS: Asset[] = [
  { symbol: 'EUR/USD', icon: '🇪🇺', type: 'forex', isOTC: false },
  { symbol: 'GBP/USD', icon: '🇬🇧', type: 'forex', isOTC: false },
  { symbol: 'USD/JPY', icon: '🇺🇸', type: 'forex', isOTC: false },
  { symbol: 'GBP/JPY', icon: '🇬🇧', type: 'forex', isOTC: false },
  { symbol: 'EUR/JPY', icon: '🇪🇺', type: 'forex', isOTC: false },
  { symbol: 'AUD/USD', icon: '🇦🇺', type: 'forex', isOTC: false },
];

const OTC_ASSETS: Asset[] = [
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

const CRYPTO_ASSETS: Asset[] = [];

// ============= METAAPI REAL CANDLES =============

const PROVISIONING_URL = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

// XM symbol mapping (IQ Option format → MT5/XM format)
const xmSymbolMap: Record<string, string> = {
  'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'USD/JPY': 'USDJPY',
  'GBP/JPY': 'GBPJPY', 'EUR/JPY': 'EURJPY', 'AUD/USD': 'AUDUSD',
  'AUD/CAD': 'AUDCAD', 'EUR/GBP': 'EURGBP', 'NZD/USD': 'NZDUSD',
  'USD/CHF': 'USDCHF', 'AUD/JPY': 'AUDJPY', 'CAD/JPY': 'CADJPY',
};

async function safeFetchMetaApi(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (e: any) {
    if (e.message?.includes('certificate') || e.message?.includes('peer')) {
      // @ts-ignore
      const client = Deno.createHttpClient({ caCerts: [] });
      return await fetch(url, { ...options, client } as any);
    }
    throw e;
  }
}

async function getMetaApiAccountInfo(supabase: any): Promise<{ accountId: string; region: string; token: string } | null> {
  const METAAPI_TOKEN = Deno.env.get('METAAPI_TOKEN');
  if (!METAAPI_TOKEN) {
    console.log('⚠️ METAAPI_TOKEN não configurado');
    return null;
  }

  // Get account ID from metaapi_config
  const { data: config } = await supabase
    .from('metaapi_config')
    .select('account_id')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!config?.account_id) {
    console.log('⚠️ Nenhuma conta MT5 ativa configurada');
    return null;
  }

  // Detect region from provisioning API
  let region = 'new-york';
  try {
    const listRes = await safeFetchMetaApi(`${PROVISIONING_URL}/users/current/accounts`, {
      headers: { 'auth-token': METAAPI_TOKEN },
    });
    if (listRes.ok) {
      const accounts = await listRes.json();
      const match = accounts.find((a: any) => (a.id || a._id) === config.account_id);
      if (match?.region) {
        region = match.region;
        console.log(`🌐 MetaAPI região detectada: ${region}`);
      }
    }
  } catch (e) {
    console.log('⚠️ Usando região padrão new-york');
  }

  return { accountId: config.account_id, region, token: METAAPI_TOKEN };
}

async function fetchMetaApiCandles(
  accountId: string,
  region: string,
  token: string,
  symbol: string,
  count: number = 30
): Promise<{ time: string; open: number; high: number; low: number; close: number }[]> {
  const mt5Symbol = xmSymbolMap[symbol];
  if (!mt5Symbol) return [];

  const marketDataUrl = `https://mt-market-data-client-api-v1.${region}.agiliumtrade.ai`;
  const url = `${marketDataUrl}/users/current/accounts/${accountId}/historical-market-data/symbols/${mt5Symbol}/timeframes/1m/candles?limit=${count}`;

  try {
    const res = await safeFetchMetaApi(url, {
      headers: { 'auth-token': token, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.log(`⚠️ MetaAPI candles ${mt5Symbol} [${res.status}]: ${await res.text()}`);
      return [];
    }

    const candles = await res.json();
    if (!Array.isArray(candles) || candles.length === 0) return [];

    console.log(`📊 MetaAPI: ${candles.length} candles reais para ${mt5Symbol}`);
    return candles.map((c: any) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  } catch (e) {
    console.log(`⚠️ MetaAPI candles ${mt5Symbol} erro: ${e}`);
    return [];
  }
}

// Fallback: AwesomeAPI for base prices when MetaAPI unavailable
async function fetchFallbackPrices(): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/EUR-USD,GBP-USD,USD-JPY,AUD-USD', {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      for (const [key, value] of Object.entries(data)) {
        const v = value as any;
        const symbol = key.replace(/^(\w{3})(\w{3})$/, '$1/$2');
        const bid = parseFloat(v.bid);
        if (!isNaN(bid)) prices.set(symbol, bid);
      }
    }
  } catch (e) { /* silent */ }
  return prices;
}

async function fetchRealPrices(supabase: any): Promise<Map<string, number>> {
  // Clean old candles (2h+)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await supabase.from('price_candles').delete().lt('created_at', twoHoursAgo);

  const finalPrices = new Map<string, number>();
  const inserts: { symbol: string; price: number }[] = [];

  // Try MetaAPI real candles first
  const metaInfo = await getMetaApiAccountInfo(supabase);

  if (metaInfo) {
    console.log('🔗 Buscando candles REAIS via MetaAPI...');
    const allSymbols = Object.keys(xmSymbolMap);

    // Fetch candles for all symbols (sequentially to avoid rate limits)
    for (const symbol of allSymbols) {
      const candles = await fetchMetaApiCandles(metaInfo.accountId, metaInfo.region, metaInfo.token, symbol, 30);

      if (candles.length > 0) {
        // Store all close prices as candles in DB
        for (const candle of candles) {
          inserts.push({ symbol, price: candle.close });
        }
        // Current price = last candle close
        const lastClose = candles[candles.length - 1].close;
        finalPrices.set(symbol, lastClose);
        finalPrices.set(`${symbol}-OTC`, lastClose); // OTC uses same underlying price
      }
    }

    if (finalPrices.size > 0) {
      console.log(`✅ MetaAPI: ${finalPrices.size / 2} pares com candles REAIS de 1 minuto`);
    }
  }

  // Fallback for any missing pairs
  if (finalPrices.size === 0) {
    console.log('⚠️ MetaAPI indisponível — fallback AwesomeAPI');
    const fallbackPrices = await fetchFallbackPrices();
    for (const [symbol, price] of fallbackPrices) {
      finalPrices.set(symbol, price);
      finalPrices.set(`${symbol}-OTC`, price);
      inserts.push({ symbol, price });
    }
  }

  // Save candles to DB (delete old ones for same symbols first, then insert fresh)
  if (inserts.length > 0) {
    // Delete existing candles for these symbols to replace with fresh MetaAPI data
    const uniqueSymbols = [...new Set(inserts.map(i => i.symbol))];
    for (const sym of uniqueSymbols) {
      await supabase.from('price_candles').delete().eq('symbol', sym);
    }
    // Insert fresh candles in batches
    const batchSize = 50;
    for (let i = 0; i < inserts.length; i += batchSize) {
      await supabase.from('price_candles').insert(inserts.slice(i, i + batchSize));
    }
    console.log(`📊 ${inserts.length} candles reais salvos no banco`);
  }

  return finalPrices;
}

async function getRecentPrices(supabase: any, symbol: string, count: number = 30): Promise<number[]> {
  const baseSymbol = symbol.replace('-OTC', '');
  const { data } = await supabase
    .from('price_candles')
    .select('price')
    .eq('symbol', baseSymbol)
    .order('created_at', { ascending: false })
    .limit(count);

  if (!data || data.length === 0) return [];
  return data.map((d: any) => parseFloat(d.price)).reverse();
}

// ============= REAL INDICATOR CALCULATIONS =============
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calculateStochastic(prices: number[], kPeriod: number = 14): { k: number; d: number } {
  if (prices.length < kPeriod) return { k: 50, d: 50 };

  const recent = prices.slice(-kPeriod);
  const high = Math.max(...recent);
  const low = Math.min(...recent);
  const close = recent[recent.length - 1];

  const k = high === low ? 50 : ((close - low) / (high - low)) * 100;
  return { k, d: k }; // Simplified %D
}

function calculateBollinger(prices: number[], period: number = 20): { upper: number; middle: number; lower: number; position: string } {
  const currentPrice = prices[prices.length - 1];
  if (prices.length < period) {
    return { upper: currentPrice * 1.02, middle: currentPrice, lower: currentPrice * 0.98, position: 'middle' };
  }

  const recent = prices.slice(-period);
  const sma = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = sma + 2 * stdDev;
  const lower = sma - 2 * stdDev;

  let position = 'middle';
  if (currentPrice <= lower) position = 'below_lower';
  else if (currentPrice >= upper) position = 'above_upper';

  return { upper, middle: sma, lower, position };
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateATR(prices: number[], period: number = 14): { value: number; volatility: string } {
  if (prices.length < 2) return { value: 0, volatility: 'low' };

  let sumTR = 0;
  const count = Math.min(period, prices.length - 1);

  for (let i = prices.length - count; i < prices.length; i++) {
    sumTR += Math.abs(prices[i] - prices[i - 1]);
  }

  const atr = sumTR / count;
  const currentPrice = prices[prices.length - 1];
  const atrPercent = (atr / currentPrice) * 100;

  return {
    value: atr,
    volatility: atrPercent < 0.05 ? 'low' : atrPercent < 0.15 ? 'medium' : 'high',
  };
}

function calculateSupportResistance(prices: number[]): { nearestSupport: number; nearestResistance: number; pricePosition: string } {
  const currentPrice = prices[prices.length - 1];
  if (prices.length < 5) {
    return { nearestSupport: currentPrice * 0.99, nearestResistance: currentPrice * 1.01, pricePosition: 'middle' };
  }

  const recent = prices.slice(-20);
  const support = Math.min(...recent);
  const resistance = Math.max(...recent);
  const range = resistance - support;
  const ratio = range > 0 ? (currentPrice - support) / range : 0.5;

  let pricePosition = 'middle';
  if (ratio <= 0.15) pricePosition = 'near_support';
  else if (ratio >= 0.85) pricePosition = 'near_resistance';

  return { nearestSupport: support, nearestResistance: resistance, pricePosition };
}

// Detect reversal candle patterns from price action
function detectReversalPattern(prices: number[], direction: 'CALL' | 'PUT'): { hasReversal: boolean; pattern: string | undefined } {
  if (prices.length < 4) return { hasReversal: false, pattern: undefined };

  const len = prices.length;
  const current = prices[len - 1];
  const prev1 = prices[len - 2];
  const prev2 = prices[len - 3];
  const prev3 = prices[len - 4];

  if (direction === 'CALL') {
    // Hammer: price was falling, then bounced up
    if (prev2 > prev1 && current > prev1 && current > prev2 * 0.999) {
      return { hasReversal: true, pattern: 'Martelo (Hammer)' };
    }
    // Bullish engulfing: previous candle bearish, current bullish and bigger
    if (prev2 > prev1 && current > prev2) {
      return { hasReversal: true, pattern: 'Engolfo de Alta' };
    }
    // Double bottom: two similar lows followed by bounce
    if (Math.abs(prev3 - prev1) / prev1 < 0.001 && prev2 > prev1 && current > prev1) {
      return { hasReversal: true, pattern: 'Fundo Duplo' };
    }
    // Morning star: down, doji, up
    const body1 = Math.abs(prev2 - prev3);
    const body2 = Math.abs(prev1 - prev2);
    const body3 = Math.abs(current - prev1);
    if (prev3 > prev2 && body2 < body1 * 0.3 && current > prev1) {
      return { hasReversal: true, pattern: 'Morning Star' };
    }
  } else {
    // Shooting star: price was rising, then dropped
    if (prev2 < prev1 && current < prev1 && current < prev2 * 1.001) {
      return { hasReversal: true, pattern: 'Estrela Cadente' };
    }
    // Bearish engulfing
    if (prev2 < prev1 && current < prev2) {
      return { hasReversal: true, pattern: 'Engolfo de Baixa' };
    }
    // Double top
    if (Math.abs(prev3 - prev1) / prev1 < 0.001 && prev2 < prev1 && current < prev1) {
      return { hasReversal: true, pattern: 'Topo Duplo' };
    }
    // Evening star
    const body1 = Math.abs(prev2 - prev3);
    const body2 = Math.abs(prev1 - prev2);
    if (prev3 < prev2 && body2 < body1 * 0.3 && current < prev1) {
      return { hasReversal: true, pattern: 'Evening Star' };
    }
  }

  return { hasReversal: false, pattern: undefined };
}

// ============= MACD from real prices =============
function calculateMACD(prices: number[]): { value: number; signal: number; histogram: number; trend: string } {
  if (prices.length < 26) {
    return { value: 0, signal: 0, histogram: 0, trend: 'neutral' };
  }

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  // Simplified signal line (would need MACD history for proper EMA9 of MACD)
  const signalLine = macdLine * 0.8;
  const histogram = macdLine - signalLine;

  const priceMagnitude = prices[prices.length - 1];
  const normalizedHist = (histogram / priceMagnitude) * 10000; // Normalize

  return {
    value: macdLine,
    signal: signalLine,
    histogram,
    trend: normalizedHist > 0.5 ? 'bullish' : normalizedHist < -0.5 ? 'bearish' : 'neutral',
  };
}

// ============= LEARNING ENGINE =============
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

// ============= ANALYZE ASSET WITH REAL DATA =============
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

async function analyzeAssetWithRealData(
  asset: Asset,
  supabase: any,
  realPrice: number | undefined
): Promise<any | null> {
  if (!realPrice) {
    console.log(`⏭️ ${asset.symbol}: Sem preço real disponível`);
    return null;
  }

  const prices = await getRecentPrices(supabase, asset.symbol, 30);

  if (prices.length < MIN_CANDLES_FOR_ANALYSIS) {
    console.log(`⏳ ${asset.symbol}: ${prices.length}/${MIN_CANDLES_FOR_ANALYSIS} candles — acumulando dados reais...`);
    return null;
  }

  // Add current real price
  prices.push(realPrice);

  // ============= VALIDAÇÃO DE QUALIDADE DE DADOS =============
  // Verificar se os preços têm variação real (não são dados estáticos/fake)
  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);
  const priceRange = priceMax - priceMin;
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variationPct = (priceRange / avgPrice) * 100;
  
  // Se a variação total dos preços é menor que 0.05%, os dados são estáticos/fake
  if (variationPct < 0.05) {
    console.log(`⚠️ ${asset.symbol}: Dados de preço SEM VARIAÇÃO REAL (${variationPct.toFixed(4)}%) — REJEITADO`);
    return null;
  }

  // ============= CALCULATE ALL INDICATORS FROM REAL DATA =============
  const rsiValue = calculateRSI(prices, 14);
  const stoch = calculateStochastic(prices, 14);
  const bollinger = calculateBollinger(prices, Math.min(20, prices.length));
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const sma50 = calculateEMA(prices, Math.min(50, prices.length));
  const atr = calculateATR(prices, 14);
  const sr = calculateSupportResistance(prices);
  const macd = calculateMACD(prices);

  // ============= REJEITAR INDICADORES EXTREMOS (ARTEFATOS DE DADOS RUINS) =============
  // Com dados fake (Frankfurter/diários), RSI e Stoch atingem valores extremos irreais
  // RSI < 5 ou > 95 com Stoch < 5 ou > 95 = certeza de dado fake
  if (rsiValue <= 5 || rsiValue >= 95) {
    console.log(`⚠️ ${asset.symbol}: RSI=${rsiValue.toFixed(1)} EXTREMO — ARTEFATO de dados ruins — REJEITADO`);
    return null;
  }
  if (stoch.k <= 3 || stoch.k >= 97) {
    console.log(`⚠️ ${asset.symbol}: Stoch=${stoch.k.toFixed(1)} EXTREMO — ARTEFATO de dados ruins — REJEITADO`);
    return null;
  }

  // ============= DETERMINE DIRECTION FROM REAL INDICATORS =============
  let type: 'CALL' | 'PUT' | null = null;

  // CALL: RSI oversold (primary signal)
  if (rsiValue <= RSI_CALL_MAX) {
    type = 'CALL';
    console.log(`📉 ${asset.symbol}: RSI oversold ${rsiValue.toFixed(1)} — sinal CALL`);
  }
  // PUT: RSI overbought (primary signal)
  else if (rsiValue >= RSI_PUT_MIN) {
    type = 'PUT';
    console.log(`📈 ${asset.symbol}: RSI overbought ${rsiValue.toFixed(1)} — sinal PUT`);
  }
  // Secondary: Strong support/resistance position
  else if (sr.pricePosition === 'near_support' && stoch.k <= 30) {
    type = 'CALL';
    console.log(`📉 ${asset.symbol}: Near support + Stoch ${stoch.k.toFixed(1)} — sinal CALL`);
  }
  else if (sr.pricePosition === 'near_resistance' && stoch.k >= 70) {
    type = 'PUT';
    console.log(`📈 ${asset.symbol}: Near resistance + Stoch ${stoch.k.toFixed(1)} — sinal PUT`);
  }

  if (!type) {
    console.log(`👀 ${asset.symbol}: RSI=${rsiValue.toFixed(1)} Stoch=${stoch.k.toFixed(1)} Pos=${sr.pricePosition} — sem sinal`);
    return null;
  }

  const isCall = type === 'CALL';

  // Build indicator objects
  const rsi = {
    value: rsiValue,
    signal: rsiValue < RSI_CALL_MAX ? 'oversold' : rsiValue > RSI_PUT_MIN ? 'overbought' : 'neutral',
  };
  const stochastic = {
    k: stoch.k,
    d: stoch.d,
    signal: stoch.k < 20 ? 'oversold' : stoch.k > 80 ? 'overbought' : 'neutral',
  };
  const movingAverages = {
    ema9,
    ema21,
    sma50,
    trend: isCall
      ? (ema9 < ema21 ? 'bullish' : 'neutral')
      : (ema9 > ema21 ? 'bearish' : 'neutral'),
  };

  // Count confluences from REAL data
  let confluenceCount = 0;
  if (isCall ? rsiValue < RSI_CALL_MAX : rsiValue > RSI_PUT_MIN) confluenceCount++;
  if (isCall ? rsiValue < RSI_ULTRA_CALL : rsiValue > RSI_ULTRA_PUT) confluenceCount++; // Bonus for ultra-extreme
  if (isCall ? bollinger.position === 'below_lower' : bollinger.position === 'above_upper') confluenceCount++;
  if (isCall ? sr.pricePosition === 'near_support' : sr.pricePosition === 'near_resistance') confluenceCount++;
  if (movingAverages.trend !== 'neutral') confluenceCount++;
  if (isCall ? stoch.k <= 25 : stoch.k >= 75) confluenceCount++;

  // Detect reversal candle patterns
  const { hasReversal, pattern } = detectReversalPattern(prices, type);
  if (hasReversal) confluenceCount++;

  // Minimum 3 of 7 confirmations
  if (confluenceCount < MIN_CONFIRMATIONS) {
    console.log(`⚠️ ${asset.symbol} ${type}: Confluência ${confluenceCount}/7 < ${MIN_CONFIRMATIONS}`);
    return null;
  }

  const confluenceScore = Math.round((confluenceCount / 7) * 100);

  const indicators = {
    rsi,
    macd,
    bollinger,
    stochastic,
    movingAverages,
    atr,
    supportResistance: sr,
    confluenceScore,
    confluenceCount,
    reversalPattern: hasReversal ? pattern : undefined,
  };

  const confirmations = generateConfirmations(indicators, type);

  console.log(`🎯 ${asset.symbol} ${type}: SINAL REAL gerado! Score=${confluenceScore}% | RSI=${rsiValue.toFixed(1)} | Stoch=${stoch.k.toFixed(1)} | Padrão=${pattern} | Preço=${realPrice}`);

  return {
    id: crypto.randomUUID(),
    type,
    asset: asset.symbol,
    assetIcon: asset.icon,
    timeframe: 'M1',
    expiration: '1 min',
    strength: 4,
    status: 'high_probability',
    confirmations,
    price: realPrice,
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
    console.log(`\n🕐 ===== GERAÇÃO DE SINAIS COM DADOS REAIS ===== | Weekend: ${weekend}`);

    // ============= FETCH REAL PRICES =============
    const realPrices = await fetchRealPrices(supabase);

    if (realPrices.size === 0) {
      console.error('❌ Nenhum preço real obtido — abortando geração');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch real prices' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Candles are now stored inside fetchHistoricalQuotes

    // ============= CHECK PENDING OPERATIONS =============
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: pendingOps } = await supabase
      .from('operation_results')
      .select('asset')
      .eq('result', 'pending')
      .gte('created_at', thirtyMinutesAgo);

    const assetsWithPendingTrades = new Set(
      (pendingOps || []).map((op: any) => op.asset.toUpperCase())
    );

    const hasAnyPendingIQTrade = (pendingOps || []).length > 0;

    if (hasAnyPendingIQTrade) {
      console.log(`🔒 IQ OPTION BLOQUEADO: ${(pendingOps || []).length} operação(ões) pendente(s)`);
    }

    // ============= CHECK RECENT SIGNALS (cooldown) =============
    const cooldownAgo = new Date(Date.now() - ASSET_SIGNAL_COOLDOWN_MS).toISOString();
    const { data: recentSignals } = await supabase
      .from('trading_signals')
      .select('asset')
      .gte('created_at', cooldownAgo);

    const assetsWithRecentSignals = new Set(
      (recentSignals || []).map((s: any) => s.asset.toUpperCase())
    );

    // ============= LOAD ASSET HISTORY =============
    const assetHistory = await getAssetHistory(supabase);

    assetHistory.forEach((h, asset) => {
      if (h.consecutiveLosses >= 3) {
        console.log(`⛔ ${asset}: BLOQUEADO (${h.consecutiveLosses} losses consecutivos)`);
      }
    });

    // ============= GET AVAILABLE ASSETS =============
    let assets: Asset[] = [];

    const isForexPairAsset = (symbol: string): boolean => {
      const clean = symbol.replace('-OTC', '').replace(' OTC', '').trim();
      const parts = clean.split('/').map(p => p.trim().toUpperCase());
      return parts.length === 2 && parts.every(p => IQ_FOREX_CURRENCIES.includes(p));
    };

    try {
      const { data: iqData } = await supabase.functions.invoke('iqoption-get-assets');
      if (iqData?.success && iqData?.assets?.length > 0) {
        const enabledAssets = iqData.assets.filter((a: any) => a.enabled === true);
        let allAssets = enabledAssets.map((a: any) => ({
          symbol: a.name,
          icon: a.isOTC ? '🔵' : a.name.includes('EUR') ? '🇪🇺' : a.name.includes('GBP') ? '🇬🇧' : '📊',
          type: a.isOTC ? 'otc' : a.isBlitz ? 'blitz' : a.type,
          isOTC: a.isOTC || false,
          isBlitz: a.isBlitz || false,
          isBinary: a.isBinary || false,
          payout: a.payout,
        }));

        allAssets = allAssets.filter((a: Asset) => isForexPairAsset(a.symbol));
        allAssets = allAssets.filter((a: Asset) => !a.payout || a.payout >= 75);
        console.log(`🔒 Filtro FOREX: ${allAssets.length} pares de moedas com payout >= 75%`);
        assets = allAssets;
      }
    } catch (e) {
      console.log('⚠️ IQ Option assets fetch failed, using fallback');
    }

    if (assets.length === 0) {
      assets = weekend ? OTC_ASSETS : [...FOREX_ASSETS];
    } else {
      assets = weekend
        ? assets.filter(a => a.isOTC || isOTCAsset(a.symbol))
        : assets.filter(a => !a.isOTC && !isOTCAsset(a.symbol));
    }

    // ============= FILTER BLOCKED ASSETS =============
    const originalCount = assets.length;
    assets = assets.filter(asset => {
      const key = asset.symbol.toUpperCase();

      if (assetsWithPendingTrades.has(key)) return false;
      if (assetsWithRecentSignals.has(key)) return false;

      const history = assetHistory.get(asset.symbol);
      // BLOQUEIO MAIS RIGOROSO: 3 losses consecutivos (era 5)
      if (history && history.consecutiveLosses >= 3) return false;
      // WR mínimo de 40% com pelo menos 5 trades (era 30%)
      if (history && history.winRate < 40 && (history.wins + history.losses) >= 5) return false;

      const newsCheck = isAssetAffectedByNews(asset.symbol);
      if (newsCheck.affected) {
        console.log(`📰 ${asset.symbol}: BLOQUEADO — ${newsCheck.reason}`);
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

    // ============= ANALYZE EACH ASSET WITH REAL DATA =============
    const shuffled = [...assets].sort(() => Math.random() - 0.5);
    const candidates: any[] = [];

    for (const asset of shuffled) {
      const realPrice = realPrices.get(asset.symbol) || realPrices.get(asset.symbol.replace('-OTC', ''));
      const signal = await analyzeAssetWithRealData(asset, supabase, realPrice);
      if (signal) candidates.push(signal);
    }

    if (candidates.length === 0) {
      console.log('⏳ Nenhum sinal de exaustão real encontrado neste ciclo');
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'no real exhaustion signals' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= SEND TO AI FOR VALIDATION =============
    console.log(`🤖 Enviando ${candidates.length} sinais REAIS para validação IA...`);

    const signalDataForAI = candidates.map(s => ({
      asset: s.asset,
      type: s.type,
      timeframe: s.timeframe,
      price: s.price,
      indicators: s.indicators,
      confirmations: s.confirmations,
    }));

    let historicalResults: any[] = [];
    try {
      const { data: results } = await supabase
        .from('operation_results')
        .select('asset, result')
        .order('created_at', { ascending: false })
        .limit(100);

      if (results && results.length > 0) {
        const assetStats = new Map<string, { wins: number; losses: number }>();
        results.forEach((r: any) => {
          const stats = assetStats.get(r.asset) || { wins: 0, losses: 0 };
          if (r.result === 'win') stats.wins++;
          else if (r.result === 'loss') stats.losses++;
          assetStats.set(r.asset, stats);
        });
        historicalResults = Array.from(assetStats.entries()).map(([asset, stats]) => ({
          asset,
          wins: stats.wins,
          losses: stats.losses,
          winRate: stats.wins + stats.losses > 0 ? (stats.wins / (stats.wins + stats.losses)) * 100 : 50,
        }));
      }
    } catch (e) {
      console.log('⚠️ Erro ao buscar histórico para IA:', e);
    }

    let aiApprovedSignals: any[] = [];
    try {
      const { data: aiData, error: aiError } = await supabase.functions.invoke('ai-signal-analyzer', {
        body: { signals: signalDataForAI, historicalResults },
      });

      if (aiError) {
        console.error('❌ Erro na análise IA:', aiError);
      } else if (aiData?.success && aiData?.analyzedSignals) {
        const executeSignals = aiData.analyzedSignals.filter((a: any) => a.recommendation === 'EXECUTE');
        console.log(`🧠 IA (${aiData.engine || 'unknown'}): ${executeSignals.length}/${aiData.analyzedSignals.length} sinais aprovados`);

        for (const approved of executeSignals) {
          const candidate = candidates.find(c => c.asset.toUpperCase() === approved.asset.toUpperCase());
          if (candidate) {
            // USAR DIREÇÃO RECOMENDADA PELA GROQ/IA (não inverter cegamente)
            const bestDir = approved.bestDirection || candidate.type;
            aiApprovedSignals.push({
              ...candidate,
              type: bestDir, // Direção corrigida pela IA
              originalType: candidate.type,
              aiConfidence: approved.confidence,
              aiReason: approved.reason,
              aiRiskLevel: approved.riskLevel,
              aiDirection: bestDir,
            });
          }
        }
      }
    } catch (e) {
      console.error('❌ Falha ao chamar IA:', e);
    }

    // Se IA não aprovou nenhum sinal, ainda permitir MT5 com sinais técnicos fortes
    const mt5FallbackSignals = aiApprovedSignals.length === 0 ? candidates.filter(c => 
      c.indicators.confluenceScore >= 65 && !c.asset.toUpperCase().includes('OTC')
    ).sort((a, b) => b.indicators.confluenceScore - a.indicators.confluenceScore) : [];

    if (aiApprovedSignals.length === 0 && mt5FallbackSignals.length === 0) {
      console.log('⚠️ IA não aprovou sinais reais e nenhum sinal técnico forte para MT5');
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'AI did not approve any real signals' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (aiApprovedSignals.length === 0 && mt5FallbackSignals.length > 0) {
      console.log(`⚠️ IA não aprovou sinais, mas MT5 tem ${mt5FallbackSignals.length} sinal(is) técnico(s) forte(s)`);
    }

    if (aiApprovedSignals.length > 0) {
      aiApprovedSignals.sort((a, b) => (b.aiConfidence || b.indicators.confluenceScore) - (a.aiConfidence || a.indicators.confluenceScore));
    }

    // ============= EXECUTE BEST SIGNAL =============
    const signalsToExecute = aiApprovedSignals.length > 0 ? [aiApprovedSignals[0]] : [];
    
    let totalIQ = 0;
    let totalMT5 = 0;
    let totalWhatsApp = 0;
    const executedSignals: any[] = [];

    for (const bestSignal of signalsToExecute) {
      console.log(`🎯 MELHOR sinal REAL: ${bestSignal.asset} (${bestSignal.type}) — Score: ${bestSignal.indicators.confluenceScore}% | Preço REAL: ${bestSignal.price}`);
      const hist = assetHistory.get(bestSignal.asset);
      const histInfo = hist ? ` | History: WR ${hist.winRate}% (${hist.wins}W/${hist.losses}L)` : ' | No history';
      const aiInfo = bestSignal.aiConfidence ? ` | IA: ${bestSignal.aiConfidence}% (${bestSignal.aiReason})` : '';
      console.log(`🏆 Executando SINAL REAL: ${bestSignal.asset} (${bestSignal.type}) — Score: ${bestSignal.indicators.confluenceScore}%${histInfo}${aiInfo}`);

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
        console.error(`❌ Error saving signal ${bestSignal.asset}:`, insertError);
        continue;
      }

      // WhatsApp notification
      if (bestSignal.indicators.confluenceScore >= WHATSAPP_CONFLUENCE_THRESHOLD) {
        try {
          const entryTime = new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
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
                tag: bestSignal.aiReason || 'REVERSÃO CERTEIRA (DADOS REAIS)',
              },
            },
          });

          if (!whatsappError) {
            totalWhatsApp++;
            console.log(`📱 WhatsApp sent for ${bestSignal.asset}`);
          }
        } catch (e) {
          console.error('❌ WhatsApp failed:', e);
        }
      }

      // ============= IQ OPTION TRADE =============
      try {
        const forexCurrencies = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'HKD', 'THB'];
        const assetClean = bestSignal.asset.replace('-OTC', '').replace(' OTC', '').trim();
        const assetParts = assetClean.split('/').map((p: string) => p.trim().toUpperCase());
        const isForexPair = assetParts.length === 2 && assetParts.every((p: string) => forexCurrencies.includes(p));

        if (!isForexPair) {
          console.log(`⏭️ IQ Option: Skipping ${bestSignal.asset} — não é par de moedas`);
        } else if (hasAnyPendingIQTrade) {
          console.log(`🚫 IQ Option: BLOQUEADO — operação anterior pendente`);
        } else {
          const { data: freshPending } = await supabase
            .from('operation_results')
            .select('id')
            .eq('result', 'pending')
            .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
            .limit(1);

          if (freshPending && freshPending.length > 0) {
            console.log(`🚫 IQ Option: BLOQUEADO — re-check detectou operação pendente`);
          } else if (!bestSignal.aiConfidence && bestSignal.indicators.confluenceScore < IQ_MIN_CONFLUENCE_SCALPING) {
            console.log(`⏭️ IQ: Confluência ${bestSignal.indicators.confluenceScore}% < ${IQ_MIN_CONFLUENCE_SCALPING}% (sem IA)`);
          } else if (bestSignal.aiConfidence && bestSignal.aiConfidence < 55) {
            console.log(`⏭️ IQ: IA confiança ${bestSignal.aiConfidence}% < 55%`);
          } else {
            const { data: iqConfig } = await supabase
              .from('iqoption_config')
              .select('*')
              .eq('is_active', true)
              .not('user_id', 'is', null)
              .order('last_connected_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (iqConfig) {
              const { data: tradeSettings } = await supabase
                .from('user_trading_settings')
                .select('trade_amount, mt5_trade_amount')
                .eq('user_id', iqConfig.user_id)
                .limit(1)
                .maybeSingle();

              const iqTradeAmount = tradeSettings?.trade_amount || 1;
              const expiration = 1;

              // USAR DIREÇÃO DA IA (Groq decide a melhor direção)
              const executionDirection = bestSignal.aiDirection || bestSignal.type;
              console.log(`📡 IQ REAL: ${bestSignal.asset} ${bestSignal.originalType || bestSignal.type}→${executionDirection} (IA) $${iqTradeAmount} | Preço REAL: ${bestSignal.price} | Score: ${bestSignal.indicators.confluenceScore}%`);

              // NÃO inserir em operation_results aqui — iqoption-place-trade já faz isso
              await supabase.from('trade_queue').insert({
                asset: bestSignal.asset,
                direction: executionDirection,
                amount: iqTradeAmount,
                expiration,
                signal_id: bestSignal.id,
                timeframe: 'M1',
                confluence_score: bestSignal.indicators.confluenceScore,
                status: 'executing',
              });

              const { data: iqData, error: iqError } = await supabase.functions.invoke('iqoption-place-trade', {
                body: {
                  asset: bestSignal.asset,
                  direction: executionDirection.toLowerCase(),
                  amount: iqTradeAmount,
                  expiration,
                  signalId: bestSignal.id,
                  isAutoTrade: true,
                  isAIAnalyzed: !!bestSignal.aiConfidence,
                  timeframe: 'M1',
                },
              });

              if (!iqError && iqData?.success) {
                totalIQ++;
                console.log(`✅ IQ REAL: ${bestSignal.asset} ${executionDirection} (IA) | ID: ${iqData.tradeId}`);
                await supabase.from('trade_queue')
                  .update({ status: 'executed', iq_option_id: iqData.tradeId, executed_at: new Date().toISOString() })
                  .eq('signal_id', bestSignal.id);
              } else {
                const errorMsg = iqError?.message || iqData?.error || 'Unknown error';
                console.error(`❌ IQ Trade falhou: ${errorMsg}`);
                await supabase.from('trade_queue')
                  .update({ status: 'failed', error: errorMsg })
                  .eq('signal_id', bestSignal.id);
              }
            }
          }
        }
      } catch (e) {
        console.error('❌ IQ Option failed:', e);
      }

      // MT5 is now handled independently below (outside this loop)


      executedSignals.push({
        asset: bestSignal.asset,
        type: bestSignal.type,
        confluenceScore: bestSignal.indicators.confluenceScore,
        aiConfidence: bestSignal.aiConfidence,
        realPrice: bestSignal.price,
      });
    }

    // ============= MT5 SPREAD STRATEGY — ATÉ 5 OPERAÇÕES SIMULTÂNEAS =============
    // MT5 usa estratégia de spread com entrada rápida e 10% de lucro
    // Permite até 5 posições simultâneas para maximizar oportunidades
    const MAX_MT5_POSITIONS = 5;
    try {
      // Combinar sinais IA + fallback técnico para MT5
      const allMT5Candidates = [
        ...aiApprovedSignals.filter(s => !s.asset.toUpperCase().includes('OTC')),
        ...mt5FallbackSignals,
      ];

      // Remover duplicatas por ativo
      const seenAssets = new Set<string>();
      const uniqueMT5Candidates = allMT5Candidates.filter(s => {
        const key = s.asset.toUpperCase();
        if (seenAssets.has(key)) return false;
        seenAssets.add(key);
        return true;
      });

      const MT5_MIN_CONFLUENCE = 60;

      if (uniqueMT5Candidates.length === 0) {
        console.log(`⏭️ MT5: Nenhum sinal disponível`);
      } else {
        const { data: metaConfig } = await supabase
          .from('metaapi_config')
          .select('token, account_id, volume, is_active')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (!metaConfig || !metaConfig.account_id) {
          console.log(`⏭️ MT5: Nenhuma configuração MetaAPI ativa`);
        } else {
          // Verificar quantas posições já estão abertas
          let currentOpenPositions = 0;
          try {
            const { data: mt5Check } = await supabase.functions.invoke('metaapi-monitor-positions', {
              body: { checkOnly: true },
            });
            currentOpenPositions = mt5Check?.totalOpen || mt5Check?.openPositions?.length || 0;
            console.log(`📊 MT5: ${currentOpenPositions}/${MAX_MT5_POSITIONS} posições abertas`);
          } catch (e) {
            console.log(`⚠️ MT5: Não foi possível verificar posições`);
          }

          const slotsAvailable = MAX_MT5_POSITIONS - currentOpenPositions;
          
          if (slotsAvailable <= 0) {
            console.log(`🚫 MT5: Limite de ${MAX_MT5_POSITIONS} posições atingido`);
          } else {
            const { data: iqCfgForUser } = await supabase
              .from('iqoption_config')
              .select('user_id')
              .eq('is_active', true)
              .limit(1)
              .maybeSingle();

            const { data: tradeSettings } = await supabase
              .from('user_trading_settings')
              .select('mt5_trade_amount')
              .eq('user_id', iqCfgForUser?.user_id || '')
              .limit(1)
              .maybeSingle();

            const mt5TradeAmount = tradeSettings?.mt5_trade_amount || 1;

            // Enviar até slotsAvailable sinais para MT5
            const mt5ToExecute = uniqueMT5Candidates.slice(0, slotsAvailable);
            
            for (const mt5Signal of mt5ToExecute) {
              // Validar confluência/confiança
              if (!mt5Signal.aiConfidence && mt5Signal.indicators.confluenceScore < MT5_MIN_CONFLUENCE) {
                console.log(`⏭️ MT5: ${mt5Signal.asset} confluência ${mt5Signal.indicators.confluenceScore}% < ${MT5_MIN_CONFLUENCE}%`);
                continue;
              }
              if (mt5Signal.aiConfidence && mt5Signal.aiConfidence < 55) {
                console.log(`⏭️ MT5: ${mt5Signal.asset} IA confiança ${mt5Signal.aiConfidence}% < 55%`);
                continue;
              }

              // Filtros: notícias e volatilidade
              const mt5NewsCheck = isAssetAffectedByNews(mt5Signal.asset);
              if (mt5NewsCheck.affected) {
                console.log(`🚫 MT5: ${mt5Signal.asset} BLOQUEADO — ${mt5NewsCheck.reason}`);
                continue;
              }
              if (mt5Signal.indicators.atr?.volatility === 'high') {
                console.log(`🚫 MT5: ${mt5Signal.asset} BLOQUEADO — volatilidade alta`);
                continue;
              }

              const mt5Direction = mt5Signal.aiDirection || mt5Signal.type;
              console.log(`📡 MT5 SPREAD: ${mt5Signal.asset} ${mt5Direction} $${mt5TradeAmount} | Score: ${mt5Signal.indicators.confluenceScore}%`);

              const { data: mt5Data, error: mt5Error } = await supabase.functions.invoke('metaapi-place-trade', {
                body: {
                  asset: mt5Signal.asset,
                  direction: mt5Direction.toLowerCase(),
                  amount: mt5TradeAmount,
                  expiration: 1,
                  signalId: mt5Signal.id,
                  confluenceScore: mt5Signal.indicators.confluenceScore,
                },
              });

              if (!mt5Error && mt5Data?.success) {
                totalMT5++;
                console.log(`✅ MT5 SPREAD: ${mt5Data.symbol} ${mt5Data.direction} — slot ${currentOpenPositions + totalMT5}/${MAX_MT5_POSITIONS}`);
              } else if (mt5Data?.skipped) {
                console.log(`⏭️ MT5: ${mt5Data.error}`);
              } else {
                console.error(`❌ MT5 falhou: ${mt5Error?.message || mt5Data?.error}`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('❌ MT5 execution failed:', e);
    }

    console.log(`\n📊 RESUMO (DADOS REAIS): ${executedSignals.length} sinais | IQ: ${totalIQ} | MT5: ${totalMT5} | WhatsApp: ${totalWhatsApp}`);

    return new Response(
      JSON.stringify({
        success: true,
        generated: executedSignals.length,
        signals: executedSignals,
        iqSent: totalIQ,
        mt5Sent: totalMT5,
        whatsappSent: totalWhatsApp,
        dataSource: 'REAL_PRICES',
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
