import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CONFIGURAÇÕES SCALPING M1 TURBO - ULTRA RIGOROSA =============
const MIN_CONFIRMATIONS = 5; // 5 de 6 confirmações
const RSI_CALL_MAX = 25; // Mais extremo
const RSI_PUT_MIN = 75; // Mais extremo
const WHATSAPP_CONFLUENCE_THRESHOLD = 85;
const IQ_MIN_CONFLUENCE_SCALPING = 83;
const ASSET_SIGNAL_COOLDOWN_MS = 180000; // 3 minutos de cooldown POR ATIVO
const IQ_FOREX_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'HKD', 'THB'];
const MIN_CANDLES_FOR_ANALYSIS = 15; // Mínimo de candles para calcular indicadores

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

// ============= REAL PRICE DATA - MULTI-SOURCE WITH ROTATION =============

const PAIR_GROUPS = [
  ['EUR-USD', 'GBP-USD', 'USD-JPY', 'AUD-USD'],
  ['EUR-JPY', 'GBP-JPY', 'AUD-CAD', 'EUR-GBP'],
  ['NZD-USD', 'USD-CHF', 'AUD-JPY', 'CAD-JPY'],
];

function getCurrentPairGroup(): string[] {
  // Rotate groups every minute to reduce API load
  const minuteOfHour = new Date().getUTCMinutes();
  const groupIndex = minuteOfHour % PAIR_GROUPS.length;
  return PAIR_GROUPS[groupIndex];
}

// Source 1: AwesomeAPI with rotation (only 4 pairs per call)
async function fetchFromAwesomeAPI(): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const group = getCurrentPairGroup();
  const pairsStr = group.join(',');
  
  try {
    const response = await fetch(`https://economia.awesomeapi.com.br/json/last/${pairsStr}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    for (const [key, value] of Object.entries(data)) {
      const v = value as any;
      const symbol = key.replace(/^(\w{3})(\w{3})$/, '$1/$2');
      const bid = parseFloat(v.bid);
      const ask = parseFloat(v.ask);
      if (!isNaN(bid)) {
        // Use mid price between bid and ask for more accurate tick
        const midPrice = !isNaN(ask) ? (bid + ask) / 2 : bid;
        prices.set(symbol, midPrice);
        prices.set(`${symbol}-OTC`, midPrice);
      }
    }
    console.log(`💹 AwesomeAPI (grupo ${getCurrentPairGroup().length} pares): ${prices.size / 2} obtidos`);
  } catch (e) {
    console.log(`⚠️ AwesomeAPI falhou: ${e}`);
  }
  return prices;
}

// Source 2: Try remaining pairs from AwesomeAPI individually
async function fetchRemainingPairsFromAwesome(existing: Map<string, number>): Promise<Map<string, number>> {
  const allPairs = PAIR_GROUPS.flat();
  const missing = allPairs.filter(p => {
    const sym = p.replace('-', '/');
    return !existing.has(sym);
  });
  
  if (missing.length === 0) return existing;
  
  // Fetch missing pairs one group at a time with delay
  for (const group of PAIR_GROUPS) {
    const groupMissing = group.filter(p => !existing.has(p.replace('-', '/')));
    if (groupMissing.length === 0) continue;
    
    try {
      await new Promise(r => setTimeout(r, 300)); // Rate limit delay
      const response = await fetch(`https://economia.awesomeapi.com.br/json/last/${groupMissing.join(',')}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) break; // Stop if rate limited
      const data = await response.json();
      for (const [key, value] of Object.entries(data)) {
        const v = value as any;
        const symbol = key.replace(/^(\w{3})(\w{3})$/, '$1/$2');
        const bid = parseFloat(v.bid);
        const ask = parseFloat(v.ask);
        if (!isNaN(bid)) {
          const midPrice = !isNaN(ask) ? (bid + ask) / 2 : bid;
          existing.set(symbol, midPrice);
          existing.set(`${symbol}-OTC`, midPrice);
        }
      }
    } catch (e) {
      break; // Stop on any error
    }
  }
  
  return existing;
}

// Source 3: Frankfurter API (ECB rates, free, updates hourly — better than ExchangeRate daily)
async function fetchFromFrankfurterAPI(): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  try {
    const response = await fetch('https://api.frankfurter.dev/v1/latest?base=USD', {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rates = data.rates || {};
    
    const currencies: Record<string, number> = { USD: 1 };
    for (const [cur, rate] of Object.entries(rates)) {
      if (['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'].includes(cur)) {
        currencies[cur] = rate as number;
      }
    }

    const pairsToGenerate = [
      ['EUR', 'USD'], ['GBP', 'USD'], ['USD', 'JPY'], ['AUD', 'USD'],
      ['EUR', 'JPY'], ['GBP', 'JPY'], ['AUD', 'CAD'], ['EUR', 'GBP'],
      ['NZD', 'USD'], ['USD', 'CHF'], ['AUD', 'JPY'], ['CAD', 'JPY'],
    ];

    for (const [base, quote] of pairsToGenerate) {
      if (currencies[base] && currencies[quote]) {
        const price = currencies[quote] / currencies[base];
        const symbol = `${base}/${quote}`;
        prices.set(symbol, price);
        prices.set(`${symbol}-OTC`, price);
      }
    }
    console.log(`💹 Frankfurter API: ${prices.size / 2} pares obtidos`);
  } catch (e) {
    console.log(`⚠️ Frankfurter API falhou: ${e}`);
  }
  return prices;
}

// Cached prices from DB (last 5 minutes)
async function fetchCachedPrices(supabase: any): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('price_candles')
      .select('symbol, price')
      .gte('created_at', fiveMinAgo)
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      const seen = new Set<string>();
      for (const row of data) {
        if (!seen.has(row.symbol)) {
          seen.add(row.symbol);
          prices.set(row.symbol, parseFloat(row.price));
          prices.set(`${row.symbol}-OTC`, parseFloat(row.price));
        }
      }
      console.log(`💹 Cache DB: ${prices.size / 2} pares obtidos (últimos 5min)`);
    }
  } catch (e) {
    console.log(`⚠️ Cache DB falhou: ${e}`);
  }
  return prices;
}

async function fetchRealPrices(supabase: any): Promise<Map<string, number>> {
  // Primary: AwesomeAPI with pair rotation
  let prices = await fetchFromAwesomeAPI();
  
  // Try to fill remaining pairs
  if (prices.size > 0 && prices.size < 24) {
    prices = await fetchRemainingPairsFromAwesome(prices);
  }

  // Fallback: Frankfurter API (fill gaps only)
  if (prices.size < 12) {
    console.log('🔄 Tentando Frankfurter API (fallback)...');
    const fallbackPrices = await fetchFromFrankfurterAPI();
    for (const [sym, price] of fallbackPrices) {
      if (!prices.has(sym)) prices.set(sym, price);
    }
  }

  // Last resort: cached prices from DB
  if (prices.size === 0) {
    console.log('🔄 Usando preços em cache do banco (último recurso)...');
    prices = await fetchCachedPrices(supabase);
  }

  return prices;
}

async function storePriceCandle(supabase: any, prices: Map<string, number>) {
  const inserts: { symbol: string; price: number }[] = [];

  for (const [symbol, price] of prices) {
    if (symbol.includes('-OTC')) continue; // Store only base pairs
    inserts.push({ symbol, price });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('price_candles').insert(inserts);
    if (error) console.error('❌ Erro ao salvar candles:', error);
    else console.log(`📊 ${inserts.length} candles salvos`);
  }

  // Cleanup: delete candles older than 2 hours (we only need ~30 for analysis)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await supabase.from('price_candles').delete().lt('created_at', twoHoursAgo);
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
  return data.map((d: any) => parseFloat(d.price)).reverse(); // oldest first
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

  // ============= DETERMINE DIRECTION FROM REAL INDICATORS (NOT RANDOM!) =============
  let type: 'CALL' | 'PUT' | null = null;

  // CALL: RSI oversold + near support + stochastic oversold → exhaustion at bottom
  if (rsiValue <= RSI_CALL_MAX && sr.pricePosition === 'near_support' && stoch.k <= 25) {
    type = 'CALL';
    console.log(`📉 ${asset.symbol}: Exaustão REAL no FUNDO detectada — RSI=${rsiValue.toFixed(1)} Stoch=${stoch.k.toFixed(1)} Pos=${sr.pricePosition}`);
  }
  // PUT: RSI overbought + near resistance + stochastic overbought → exhaustion at top
  else if (rsiValue >= RSI_PUT_MIN && sr.pricePosition === 'near_resistance' && stoch.k >= 75) {
    type = 'PUT';
    console.log(`📈 ${asset.symbol}: Exaustão REAL no TOPO detectada — RSI=${rsiValue.toFixed(1)} Stoch=${stoch.k.toFixed(1)} Pos=${sr.pricePosition}`);
  }

  if (!type) {
    // Log why no signal (for debugging)
    if (rsiValue <= 35 || rsiValue >= 65) {
      console.log(`👀 ${asset.symbol}: RSI=${rsiValue.toFixed(1)} Stoch=${stoch.k.toFixed(1)} Pos=${sr.pricePosition} — aguardando exaustão completa`);
    }
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
      ? (ema9 < ema21 ? 'bullish' : 'neutral')  // Price below MAs = potential bullish reversal
      : (ema9 > ema21 ? 'bearish' : 'neutral'),   // Price above MAs = potential bearish reversal
  };

  // Count confluences from REAL data
  let confluenceCount = 0;
  if (isCall ? rsiValue < RSI_CALL_MAX : rsiValue > RSI_PUT_MIN) confluenceCount++;
  if (isCall ? bollinger.position === 'below_lower' : bollinger.position === 'above_upper') confluenceCount++;
  if (isCall ? sr.pricePosition === 'near_support' : sr.pricePosition === 'near_resistance') confluenceCount++;
  if (movingAverages.trend !== 'neutral') confluenceCount++;
  if (atr.volatility === 'low') confluenceCount++;

  // Detect REAL reversal candle patterns from price action
  const { hasReversal, pattern } = detectReversalPattern(prices, type);
  if (hasReversal) confluenceCount++;

  // RIGOROSO: Mínimo 5 de 6 confirmações
  if (confluenceCount < MIN_CONFIRMATIONS) {
    console.log(`⚠️ ${asset.symbol} ${type}: Confluência insuficiente ${confluenceCount}/6 (mínimo ${MIN_CONFIRMATIONS})`);
    return null;
  }

  // Exigir padrão de candle de reversão
  if (!hasReversal) {
    console.log(`⚠️ ${asset.symbol} ${type}: Sem padrão de reversão nos candles reais`);
    return null;
  }

  const confluenceScore = Math.round((confluenceCount / 6) * 100);

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

    // Store candle for history (builds up over time for indicator calculation)
    await storePriceCandle(supabase, realPrices);

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
      if (h.consecutiveLosses >= 5) {
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
      const isEurusd = asset.symbol === 'EUR/USD';

      if (isEurusd) {
        if (assetsWithPendingTrades.has(key) || assetsWithRecentSignals.has(key)) return false;
        console.log(`🎯 EUR/USD: LIBERADO (estratégia spread MT5)`);
        return true;
      }

      if (assetsWithPendingTrades.has(key)) return false;
      if (assetsWithRecentSignals.has(key)) return false;

      const history = assetHistory.get(asset.symbol);
      if (history && history.consecutiveLosses >= 5) return false;
      if (history && history.winRate < 30 && (history.wins + history.losses) >= 5) return false;

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
        console.log(`🧠 IA: ${executeSignals.length}/${aiData.analyzedSignals.length} sinais aprovados`);

        for (const approved of executeSignals) {
          const candidate = candidates.find(c => c.asset.toUpperCase() === approved.asset.toUpperCase());
          if (candidate) {
            aiApprovedSignals.push({
              ...candidate,
              aiConfidence: approved.confidence,
              aiReason: approved.reason,
              aiRiskLevel: approved.riskLevel,
            });
          }
        }
      }
    } catch (e) {
      console.error('❌ Falha ao chamar IA:', e);
    }

    if (aiApprovedSignals.length === 0) {
      console.log('⚠️ IA não aprovou sinais reais — NÃO operando');
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'AI did not approve any real signals' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    aiApprovedSignals.sort((a, b) => (b.aiConfidence || b.indicators.confluenceScore) - (a.aiConfidence || a.indicators.confluenceScore));

    // ============= EXECUTE BEST SIGNAL =============
    const signalsToExecute = [aiApprovedSignals[0]];
    console.log(`🎯 MELHOR sinal REAL: ${signalsToExecute[0].asset} (${signalsToExecute[0].type}) — Score: ${signalsToExecute[0].indicators.confluenceScore}% | Preço REAL: ${signalsToExecute[0].price}`);

    let totalIQ = 0;
    let totalMT5 = 0;
    let totalWhatsApp = 0;
    const executedSignals: any[] = [];

    for (const bestSignal of signalsToExecute) {
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
          } else if (bestSignal.indicators.confluenceScore < IQ_MIN_CONFLUENCE_SCALPING) {
            console.log(`⏭️ IQ: Confluência ${bestSignal.indicators.confluenceScore}% < ${IQ_MIN_CONFLUENCE_SCALPING}%`);
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

              console.log(`📡 IQ REAL: ${bestSignal.asset} ${bestSignal.type} $${iqTradeAmount} | Preço REAL: ${bestSignal.price} | Score: ${bestSignal.indicators.confluenceScore}%`);

              await supabase.from('operation_results').insert({
                signal_id: bestSignal.id,
                asset: bestSignal.asset,
                direction: bestSignal.type,
                result: 'pending',
                profit: 0,
                entry_price: iqTradeAmount,
                is_auto_trade: true,
                is_ai_analyzed: !!bestSignal.aiConfidence,
                timeframe: 'M1',
              });

              await supabase.from('trade_queue').insert({
                asset: bestSignal.asset,
                direction: bestSignal.type,
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
                  direction: bestSignal.type.toLowerCase(),
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
                console.log(`✅ IQ REAL: ${bestSignal.asset} ${bestSignal.type} | ID: ${iqData.tradeId}`);
                await supabase.from('trade_queue')
                  .update({ status: 'executed', iq_option_id: iqData.tradeId, executed_at: new Date().toISOString() })
                  .eq('signal_id', bestSignal.id);
              } else {
                const errorMsg = iqError?.message || iqData?.error || 'Unknown error';
                console.error(`❌ IQ Trade falhou: ${errorMsg}`);
                await supabase.from('operation_results')
                  .update({ result: 'expired', profit: 0 })
                  .eq('signal_id', bestSignal.id)
                  .eq('result', 'pending');
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

      // ============= MT5 TRADE (EURUSD ONLY) =============
      try {
        const assetNormalized = bestSignal.asset.replace('/', '').replace('-OTC', '').replace(' ', '').toUpperCase();
        const isEurusd = assetNormalized === 'EURUSD';
        const utcHour = new Date().getUTCHours();
        const isHighLiquiditySession = (utcHour >= 7 && utcHour <= 16);
        const MT5_MIN_CONFLUENCE = 95;

        if (!isEurusd) {
          // Skip silently for non-EURUSD
        } else if (!isHighLiquiditySession) {
          console.log(`⏭️ MT5: Fora da sessão (${utcHour}h UTC)`);
        } else if (bestSignal.indicators.confluenceScore < MT5_MIN_CONFLUENCE) {
          console.log(`⏭️ MT5: Confluência ${bestSignal.indicators.confluenceScore}% < ${MT5_MIN_CONFLUENCE}%`);
        } else {
          const { data: metaConfig } = await supabase
            .from('metaapi_config')
            .select('token, account_id, volume, is_active')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (metaConfig && metaConfig.account_id) {
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

            console.log(`📡 MT5 EURUSD REAL: ${bestSignal.type} $${mt5TradeAmount} | Score: ${bestSignal.indicators.confluenceScore}%`);

            const { data: mt5Data, error: mt5Error } = await supabase.functions.invoke('metaapi-place-trade', {
              body: {
                asset: bestSignal.asset,
                direction: bestSignal.type.toLowerCase(),
                amount: mt5TradeAmount,
                expiration: 1,
                signalId: bestSignal.id,
                confluenceScore: bestSignal.indicators.confluenceScore,
              },
            });

            if (!mt5Error && mt5Data?.success) {
              totalMT5++;
              console.log(`✅ MT5 REAL: ${mt5Data.symbol} ${mt5Data.direction}`);
            } else {
              console.error(`❌ MT5 falhou: ${mt5Error?.message || mt5Data?.error}`);
            }
          }
        }
      } catch (e) {
        console.error('❌ MT5 failed:', e);
      }

      executedSignals.push({
        asset: bestSignal.asset,
        type: bestSignal.type,
        confluenceScore: bestSignal.indicators.confluenceScore,
        aiConfidence: bestSignal.aiConfidence,
        realPrice: bestSignal.price,
      });
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
