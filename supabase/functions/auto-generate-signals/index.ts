import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= CONFIGURAÇÕES SCALPING M1 =============
const MIN_CONFIRMATIONS = 4; // 4 de 7 confirmações — entradas mais assertivas
const RSI_CALL_MAX = 30; // RSI oversold threshold (era 35)
const RSI_PUT_MIN = 70; // RSI overbought threshold (era 65)
const RSI_ULTRA_CALL = 20; // Ultra extreme for bonus score (era 25)
const RSI_ULTRA_PUT = 80;
const WHATSAPP_CONFLUENCE_THRESHOLD = 60;
const IQ_MIN_CONFLUENCE_SCALPING = 85; // Apenas sinais de alta qualidade (era 60)
const IQ_MIN_AI_CONFIDENCE = 60; // mínimo 60% — evita ficar em espera
const IQ_COOLOFF_AFTER_LOSSES = 2; // Reduz stake após N perdas seguidas
const IQ_COOLOFF_STAKE_MULTIPLIER = 0.5; // -50% no stake durante cooling-off
const MT5_MIN_AI_CONFIDENCE = 50; // MT5 aceita sinais a partir de 50%
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
    const win = Math.max(event.duration, 30); // janela ampliada: 30 min antes/depois de notícia forte
    if (currentMinutes >= eventMinutes - win && currentMinutes <= eventMinutes + win) {
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
  return d === 6 || (d === 0 && h < 21) || (d === 5 && h >= 21);
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
  { symbol: 'EUR/USD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'GBP/USD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'USD/JPY', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'GBP/JPY', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'EUR/JPY', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'AUD/USD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'AUD/CAD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'EUR/GBP', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'NZD/USD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'USD/CHF', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'AUD/JPY', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'CAD/JPY', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'USD/CAD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'EUR/AUD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'EUR/CAD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'EUR/CHF', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'GBP/AUD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'GBP/CAD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'GBP/CHF', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'CHF/JPY', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'NZD/JPY', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'AUD/CHF', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'AUD/NZD', icon: '💱', type: 'forex', isOTC: false },
  { symbol: 'EUR/NZD', icon: '💱', type: 'forex', isOTC: false },
];

const OTC_ASSETS: Asset[] = [
  { symbol: 'EUR/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'USD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/CAD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/GBP-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'NZD/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'USD/CHF-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'CAD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'USD/CAD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/AUD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/CAD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/CHF-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/AUD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/CAD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/CHF-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'CHF/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'NZD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/CHF-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/NZD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/NZD-OTC', icon: '🔵', type: 'otc', isOTC: true },
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
  'USD/CAD': 'USDCAD', 'EUR/AUD': 'EURAUD', 'EUR/CAD': 'EURCAD',
  'EUR/CHF': 'EURCHF', 'GBP/AUD': 'GBPAUD', 'GBP/CAD': 'GBPCAD',
  'GBP/CHF': 'GBPCHF', 'CHF/JPY': 'CHFJPY', 'NZD/JPY': 'NZDJPY',
  'AUD/CHF': 'AUDCHF', 'AUD/NZD': 'AUDNZD', 'EUR/NZD': 'EURNZD',
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

const CRYPTO_CODES = ['BTC', 'ETH', 'LTC', 'XRP', 'SOL', 'DOGE', 'ADA', 'BNB', 'DOT', 'TRX', 'MATIC', 'LINK', 'AVAX', 'BCH', 'EOS', 'XLM', 'SHIB', 'TON', 'ATOM', 'UNI', 'NEAR', 'PEPE'];
const STOCK_NAME_MAP: Record<string, string> = {
  APPLE: 'AAPL', AMAZON: 'AMZN', GOOGLE: 'GOOGL', ALPHABET: 'GOOGL', TESLA: 'TSLA', MICROSOFT: 'MSFT',
  META: 'META', FACEBOOK: 'META', NVIDIA: 'NVDA', NETFLIX: 'NFLX', ALIBABA: 'BABA', MCDONALDS: 'MCD',
  NIKE: 'NKE', COCACOLA: 'KO', DISNEY: 'DIS', INTEL: 'INTC', AMD: 'AMD', BOEING: 'BA', PAYPAL: 'PYPL',
  UBER: 'UBER', SNAP: 'SNAP', TWITTER: 'X', CITIGROUP: 'C', JPMORGAN: 'JPM', PFIZER: 'PFE', ZOOM: 'ZM',
  SPOTIFY: 'SPOT', MCDON: 'MCD', MCDONALD: 'MCD', COKE: 'KO', GOLDMAN: 'GS', MORGANSTANLEY: 'MS', BERKSHIRE: 'BRK-B', WALMART: 'WMT', VISA: 'V', MASTERCARD: 'MA', ORACLE: 'ORCL', ADOBE: 'ADBE', SALESFORCE: 'CRM', IBM: 'IBM', CISCO: 'CSCO', QUALCOMM: 'QCOM', STARBUCKS: 'SBUX', PEPSICO: 'PEP', EXXON: 'XOM', CHEVRON: 'CVX', AIRBNB: 'ABNB', COINBASE: 'COIN', PALANTIR: 'PLTR', GAMESTOP: 'GME', AMC: 'AMC',
};

function assetKind(symbol: string): 'forex' | 'crypto' | 'stock' {
  const s = symbol.replace(/[-\s]*OTC$/i, '').toUpperCase();
  const parts = s.split('/');
  if (parts.length === 2 && CRYPTO_CODES.includes(parts[0])) return 'crypto';
  if (CRYPTO_CODES.some(c => s === c || s === `${c}USD` || s === `${c}USDT`)) return 'crypto';
  if (parts.length === 2 && parts.every(p => IQ_FOREX_CURRENCIES.includes(p))) return 'forex';
  return 'stock';
}

// Converte símbolo da IQ Option para ticker Yahoo Finance (null = sem cotação disponível)
function yahooTicker(symbol: string): string | null {
  const s = symbol.replace(/[-\s]*OTC$/i, '').replace(/^FRONT\./, '').toUpperCase().trim();
  const kind = assetKind(s);
  if (kind === 'forex') return s.replace('/', '') + '=X';
  if (kind === 'crypto') {
    const code = s.includes('/') ? s.split('/')[0] : CRYPTO_CODES.find(c => s.startsWith(c))!;
    return `${code}-USD`;
  }
  const idx = s.replace(/:.*$/, '').replace(/[^A-Z0-9]/g, '');
  const INDEX_MAP: Record<string, string> = { US30: '^DJI', DJ30: '^DJI', US500: '^GSPC', SPX500: '^GSPC', SP500: '^GSPC', US100: '^NDX', NAS100: '^NDX', USTEC: '^NDX', US2000: '^RUT', GER30: '^GDAXI', GER40: '^GDAXI', DE40: '^GDAXI', UK100: '^FTSE', JP225: '^N225', FRA40: '^FCHI', EU50: '^STOXX50E', HK50: '^HSI', AUS200: '^AXJO' };
  if (INDEX_MAP[idx]) return INDEX_MAP[idx];
  const clean = s.replace(/[^A-Z.]/g, '');
  if (STOCK_NAME_MAP[clean]) return STOCK_NAME_MAP[clean];
  if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(clean) && !s.includes('/')) return clean;
  return null;
}

// Últimas velas OHLC FECHADAS por símbolo (para pavio / pin bar)
const otcOnlySymbols = new Set<string>();
const iqCandles = new Map<string, { t: number; o: number; h: number; l: number; c: number }[]>();
const lastCandles = new Map<string, { o: number; h: number; l: number; c: number }>();
const bt24Map = new Map<string, { CALL: { w: number; l: number }; PUT: { w: number; l: number }; n: number }>();

// Entrada GRÁFICO 24H: só vale se a vela atual repete o setup testado (tendência + vela a favor)
// e esse setup foi lucrativo nas últimas 24h do mesmo ativo/direção.
function chartMomentumBacktest(symbol: string, direction: 'CALL' | 'PUT'): { w: number; l: number } {
  const key = symbol.replace('-OTC', '');
  const bt = bt24Map.get(symbol) || bt24Map.get(key);
  const k = lastCandles.get(key);
  if (!bt || !k) return { w: 0, l: 0 };
  const inDir = direction === 'CALL' ? k.c > k.o : k.c < k.o;
  return inDir ? bt[direction] : { w: 0, l: 0 };
}

// Estratégia do pavio: vela com pavio longo inferior (CALL) ou superior (PUT)
function detectWickRejection(symbol: string, direction: 'CALL' | 'PUT'): { ok: boolean; strong: boolean; ratio: number } {
  const k = lastCandles.get(symbol.replace('-OTC', ''));
  if (!k) return { ok: false, strong: false, ratio: 0 };
  const range = k.h - k.l;
  if (range <= 0) return { ok: false, strong: false, ratio: 0 };
  const body = Math.max(Math.abs(k.c - k.o), range * 0.02);
  const lower = Math.min(k.o, k.c) - k.l;
  const upper = k.h - Math.max(k.o, k.c);
  const wick = direction === 'CALL' ? lower : upper;
  const other = direction === 'CALL' ? upper : lower;
  const closePos = (k.c - k.l) / range; // 1 = fechou na máxima
  const ratio = wick / body;
  const ok = ratio >= 2 && wick >= range * 0.55 && other <= range * 0.25 &&
    (direction === 'CALL' ? closePos >= 0.6 : closePos <= 0.4);
  return { ok, strong: ok && ratio >= 3, ratio };
}

// Pavio leve (filtro obrigatório): pavio a favor ≥ 1x corpo e ≥ 35% da vela
function hasLightWick(symbol: string, direction: 'CALL' | 'PUT'): boolean {
  const k = lastCandles.get(symbol.replace('-OTC', ''));
  if (!k) return false;
  const range = k.h - k.l;
  if (range <= 0) return false;
  const body = Math.max(Math.abs(k.c - k.o), range * 0.02);
  const wick = direction === 'CALL' ? Math.min(k.o, k.c) - k.l : k.h - Math.max(k.o, k.c);
  return wick >= body && wick >= range * 0.35;
}

// PULLBACK + PAVIO: nas velas anteriores o preço recuou até a EMA9/EMA21 (retração)
// e a última vela fechada tem pavio longo de rejeição a favor da tendência → entrada prioritária
function detectPullbackWick(symbol: string, direction: 'CALL' | 'PUT', ema9: number, ema21: number): { ok: boolean; ratio: number } {
  const candles = iqCandles.get(symbol.replace('-OTC', ''));
  const wick = detectWickRejection(symbol, direction);
  if (!candles || candles.length < 4 || !wick.ok) return { ok: false, ratio: wick.ratio };
  // Retração: alguma das 5 velas ANTERIORES à última tocou/cruzou a EMA9 ou EMA21 contra a tendência
  const prev = candles.slice(-6, -1);
  const ref = Math.min(Math.abs(ema9), Math.abs(ema21)) || 1;
  const touched = prev.some(k => direction === 'CALL'
    ? k.l <= Math.max(ema9, ema21) + ref * 0.0005 // recuou até as médias
    : k.h >= Math.min(ema9, ema21) - ref * 0.0005);
  return { ok: touched, ratio: wick.ratio };
}

// TESTE NO PRÓPRIO GRÁFICO DA IQ OPTION (sem depender de operações feitas):
// em cada vela passada com pavio de rejeição a favor + tendência (EMA9 vs EMA21) na mesma direção,
// confere se a vela SEGUINTE fechou a favor. Retorna wins/losses dessa entrada no gráfico do ativo.
function chartBacktest(symbol: string, direction: 'CALL' | 'PUT'): { w: number; l: number } {
  const cs = (iqCandles.get(symbol.replace('-OTC', '')) || []).slice(0, -1)
    .filter(k => [k.o, k.h, k.l, k.c].every(v => typeof v === 'number'));
  let w = 0, l = 0;
  if (cs.length < 25) return { w, l };
  const ema = (p: number) => { const a = 2 / (p + 1); const out: number[] = []; cs.forEach((k, i) => out.push(i ? k.c * a + out[i - 1] * (1 - a) : k.c)); return out; };
  const e9 = ema(9), e21 = ema(21);
  for (let i = 21; i < cs.length - 1; i++) {
    const k = cs[i], n = cs[i + 1];
    const range = k.h - k.l; if (range <= 0) continue;
    const body = Math.max(Math.abs(k.c - k.o), range * 0.02);
    const wick = direction === 'CALL' ? Math.min(k.o, k.c) - k.l : k.h - Math.max(k.o, k.c);
    const trendOk = direction === 'CALL' ? e9[i] > e21[i] : e9[i] < e21[i];
    if (!trendOk || wick < body || wick < range * 0.35) continue;
    const win = direction === 'CALL' ? n.c > n.o : n.c < n.o;
    if (n.c === n.o) continue;
    if (win) w++; else l++;
  }
  return { w, l };
}


async function fetchRealPrices(supabase: any, extraSymbols?: string[]): Promise<Map<string, number>> {
  // Clean old candles (2h+)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await supabase.from('price_candles').delete().lt('created_at', twoHoursAgo);

  const finalPrices = new Map<string, number>();
  const inserts: { symbol: string; price: number }[] = [];

  // Try MetaAPI real candles first
  const metaInfo = null as any; // MT5/MetaAPI desativado — usar Yahoo Finance

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

  // 1) Velas da PRÓPRIA IQ Option (mesmo preço em que a operação é executada — obrigatório p/ OTC)
  for (const [symbol, cs] of iqCandles) {
    const closed = cs.slice(0, -1).filter(k => [k.o, k.h, k.l, k.c].every(v => typeof v === 'number'));
    if (closed.length < 20) continue;
    const k = closed[closed.length - 1];
    lastCandles.set(symbol, { o: k.o, h: k.h, l: k.l, c: k.c });
    for (const x of closed.slice(-30)) inserts.push({ symbol, price: x.c, created_at: new Date(x.t * 1000).toISOString() } as any);
    finalPrices.set(symbol, k.c);
    finalPrices.set(`${symbol}-OTC`, k.c);
  }
  if (finalPrices.size > 0) console.log(`🕯️ IQ Option: ${finalPrices.size / 2} ativos com velas próprias da corretora`);
  const missing = (extraSymbols || []).filter(s => !finalPrices.has(s));

  // 2) Yahoo Finance só para o que faltou (nunca para OTC — preço OTC é sintético)
  if (missing.length > 0 || finalPrices.size === 0) {
    console.log('🔗 Buscando candles REAIS via Yahoo Finance...');
    const syms = (missing.length > 0 ? missing.filter(s => !otcOnlySymbols.has(s)) : (finalPrices.size === 0 ? Object.keys(xmSymbolMap) : []))
      .filter(s => !!yahooTicker(s)).slice(0, 120);
    const results = await Promise.all(syms.map(async (symbol) => {
      try {
        const y = encodeURIComponent(yahooTicker(symbol)!);
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${y}?interval=1m&range=1d`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) return null;
        const j = await r.json();
        const res = j?.chart?.result?.[0];
        const ts: number[] = res?.timestamp || [];
        const q = res?.indicators?.quote?.[0] || {};
        const closes: (number | null)[] = q.close || [];
        // penúltima vela = última FECHADA
        for (let i = ts.length - 2; i >= 0; i--) {
          if ([q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]].every((v: any) => typeof v === 'number')) {
            lastCandles.set(symbol, { o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
            break;
          }
        }
        const pts = ts.map((t, i) => ({ t, c: closes[i] })).filter(p => typeof p.c === 'number').slice(-30);
        return pts.length ? { symbol, pts } : null;
      } catch { return null; }
    }));
    for (const r of results) {
      if (!r) continue;
      for (const p of r.pts) inserts.push({ symbol: r.symbol, price: p.c as number, created_at: new Date(p.t * 1000).toISOString() } as any);
      const last = r.pts[r.pts.length - 1].c as number;
      finalPrices.set(r.symbol, last);
      finalPrices.set(`${r.symbol}-OTC`, last);
    }
    if (finalPrices.size > 0) console.log(`✅ Yahoo: ${finalPrices.size / 2} pares com candles reais`);
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
    const uniqueSymbols = [...new Set(inserts.map(i => i.symbol))];
    for (let i = 0; i < uniqueSymbols.length; i += 50) {
      await supabase.from('price_candles').delete().in('symbol', uniqueSymbols.slice(i, i + 50));
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
  realPrice: number | undefined,
  forceOpportunity = false
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
  if (variationPct < 0.015) {
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
  // RSI < 3 ou > 97 = certeza de dado fake (relaxado — em M1 real, Stoch pode atingir 100)
  if (rsiValue <= 3 || rsiValue >= 97) {
    console.log(`⚠️ ${asset.symbol}: RSI=${rsiValue.toFixed(1)} EXTREMO — ARTEFATO de dados ruins — REJEITADO`);
    return null;
  }
  // Stochastic 100 ou 0 é LEGÍTIMO em tendência forte de M1 — NÃO rejeitar
  // Apenas rejeitar se RSI TAMBÉM for extremo (ambos extremos = dado fake)

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
  // Secondary: Stochastic extremo (mesmo sem RSI extremo)
  else if (stoch.k <= 15) {
    type = 'CALL';
    console.log(`📉 ${asset.symbol}: Stoch extremo ${stoch.k.toFixed(1)} — sinal CALL`);
  }
  else if (stoch.k >= 85) {
    type = 'PUT';
    console.log(`📈 ${asset.symbol}: Stoch extremo ${stoch.k.toFixed(1)} — sinal PUT`);
  }
  // Tertiary: Strong support/resistance position
  else if (sr.pricePosition === 'near_support' && stoch.k <= 35) {
    type = 'CALL';
    console.log(`📉 ${asset.symbol}: Near support + Stoch ${stoch.k.toFixed(1)} — sinal CALL`);
  }
  else if (sr.pricePosition === 'near_resistance' && stoch.k >= 65) {
    type = 'PUT';
    console.log(`📈 ${asset.symbol}: Near resistance + Stoch ${stoch.k.toFixed(1)} — sinal PUT`);
  }
  // MACD trend signal (broader opportunity capture)
  else if (macd.trend === 'bullish' && bollinger.position === 'below_lower') {
    type = 'CALL';
    console.log(`📉 ${asset.symbol}: MACD bullish + Bollinger lower — sinal CALL`);
  }
  else if (macd.trend === 'bearish' && bollinger.position === 'above_upper') {
    type = 'PUT';
    console.log(`📈 ${asset.symbol}: MACD bearish + Bollinger upper — sinal PUT`);
  }

  // Tendência maior: entrar SEMPRE a favor dela (continuação), nunca contra
  {
    const px = prices[prices.length - 1];
    const tDown = ema21 < sma50 && px < sma50;
    const tUp = ema21 > sma50 && px > sma50;
    if (type === 'CALL' && tDown) { type = 'PUT'; console.log(`↪️ ${asset.symbol}: tendência de baixa → PUT a favor`); }
    else if (type === 'PUT' && tUp) { type = 'CALL'; console.log(`↪️ ${asset.symbol}: tendência de alta → CALL a favor`); }
    else if (!type && tUp && macd.trend === 'bullish') { type = 'CALL'; console.log(`📈 ${asset.symbol}: tendência de alta + MACD → CALL`); }
    else if (!type && tDown && macd.trend === 'bearish') { type = 'PUT'; console.log(`📉 ${asset.symbol}: tendência de baixa + MACD → PUT`); }
  }

  if (!type) {
    // SÓ IA: sem gatilho, propõe a direção do MACD e deixa a IA decidir
    type = macd.trend === 'bearish' ? 'PUT' : 'CALL';
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
  // Pontos por estar A FAVOR da tendência (continuação)
  {
    const px2 = prices[prices.length - 1];
    if (isCall ? (ema21 > sma50 && px2 > sma50) : (ema21 < sma50 && px2 < sma50)) confluenceCount += 2;
    if (isCall ? macd.trend === 'bullish' : macd.trend === 'bearish') confluenceCount++;
    if (isCall ? ema9 > ema21 : ema9 < ema21) confluenceCount++;
  }

  // ESTRATÉGIAS INTERCALADAS: EDGE SCANNER / PAVIO / ANÁLISE IA
  const wick = detectWickRejection(asset.symbol, type);
  // EDGE SCANNER (estilo IQ Option): vela fechada com pavio de rejeição (≥1,5x corpo) a favor,
  // fechando na direção, com preço do lado certo da EMA21 e SMA50 e médias alinhadas → BUY/SELL
  const edge = (() => {
    const k = lastCandles.get(asset.symbol.replace('-OTC', ''));
    if (!k) return false;
    const range = k.h - k.l;
    if (range <= 0) return false;
    const body = Math.max(Math.abs(k.c - k.o), range * 0.02);
    const lower = Math.min(k.o, k.c) - k.l;
    const upper = k.h - Math.max(k.o, k.c);
    const px = prices[prices.length - 1];
    return isCall
      ? lower >= body * 1.5 && lower >= range * 0.4 && k.c >= k.o && ema21 > sma50 && px > ema21
      : upper >= body * 1.5 && upper >= range * 0.4 && k.c <= k.o && ema21 < sma50 && px < ema21;
  })();
  const pullbackWick = detectPullbackWick(asset.symbol, type, ema9, ema21);
  // GRÁFICO 24H: a mesma entrada (tendência + vela a favor) testada nas velas das últimas 24h do ativo
  const chart24 = chartMomentumBacktest(asset.symbol, type as 'CALL' | 'PUT');
  const chartOk = chart24.w + chart24.l >= 10 && chart24.w / (chart24.w + chart24.l) >= 0.58;
  if (chartOk) console.log(`📊 ${asset.symbol} ${type}: gráfico 24h lucrativo ${chart24.w}W/${chart24.l}L`);
  // SÓ IA: todas as estratégias e filtros (Edge, pavio, tendência) desligados — a IA decide
  const strategy: 'EDGE' | 'PULLBACK' | 'WICK' | 'AI' | 'CHART' = 'AI';
  if (wick.ok) confluenceCount++;
  if (edge) confluenceCount += 2;
  if (pullbackWick.ok) confluenceCount += 2;
  if (chartOk) confluenceCount++;
  const expMinutes = 1;

  // Sem bloqueio por confirmações: a decisão final é da IA (Groq) + estratégia do pavio
  console.log(`🧠 ${asset.symbol} ${type}: estratégia ${strategy}, confluência ${confluenceCount}/7 → enviado para IA`);

  const confluenceScore = Math.min(100, Math.round((confluenceCount / 7) * 100));

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
    strategy,
    reversalPattern: strategy === 'EDGE'
      ? `Edge Scanner ${isCall ? 'BUY' : 'SELL'}`
      : strategy === 'PULLBACK'
      ? `Pullback + Pavio ${isCall ? 'inferior' : 'superior'} ${pullbackWick.ratio.toFixed(1)}x (retração às médias)`
      : strategy === 'WICK'
      ? `Pavio ${isCall ? 'inferior' : 'superior'} ${wick.ratio.toFixed(1)}x corpo` + (hasReversal ? ` + ${pattern}` : '')
      : `IA ${hasReversal ? pattern : 'confluência'}`,
  };

  const confirmations = generateConfirmations(indicators, type);

  console.log(`🎯 ${asset.symbol} ${type}: SINAL REAL gerado! Score=${confluenceScore}% | RSI=${rsiValue.toFixed(1)} | Stoch=${stoch.k.toFixed(1)} | Padrão=${pattern} | Preço=${realPrice}`);

  return {
    id: crypto.randomUUID(),
    type,
    asset: asset.symbol,
    assetIcon: asset.icon,
    timeframe: expMinutes === 5 ? 'M5' : 'M1',
    expiration: `${expMinutes} min`,
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

    // ============= ATIVOS ABERTOS NA IQ OPTION (moedas, ações, cripto) =============
    const openIqAssets: Asset[] = [];
    iqCandles.clear(); otcOnlySymbols.clear(); lastCandles.clear();
    try {
      const { data: iqData } = await supabase.functions.invoke('iqoption-get-assets', { body: { withCandles: true } });
      if (iqData?.success && iqData?.assets?.length > 0) {
        const seen = new Set<string>();
        const normalForexOpen = iqData.assets.filter((a: any) => a.enabled === true && a.schedule?.open !== false && !a.isOTC && !/OTC|BLITZ/i.test(a.name) && assetKind(String(a.name).trim()) === 'forex' && yahooTicker(String(a.name).trim())).length;
        const realOpenBases = new Set<string>(iqData.assets.filter((a: any) => a.enabled === true && a.schedule?.open !== false && !a.isOTC && !/OTC/i.test(a.name)).map((a: any) => String(a.name).replace(/[-\s]*BLITZ/i, '').trim()));
        for (const a of iqData.assets) {
          if (a.enabled !== true || a.schedule?.open === false) continue;
          // Blitz: mesmo par de moedas — analisado junto (executa na modalidade com melhor payout)
          const isOtc = !!a.isOTC || /OTC/i.test(a.name);
          const base = String(a.name).replace(/[-\s]*BLITZ/i, '').replace(/[-\s]*OTC$/i, '').trim();
          const symbol = isOtc ? `${base}-OTC` : base;
          if (seen.has(symbol) || !yahooTicker(base)) continue;
          // Dias úteis: TODOS os ativos reais abertos (moedas, ações e cripto) — a IA nunca fica em espera
          // Fim de semana: OTC (moedas e ações)
          // Dias úteis: OTC só quando praticamente não há pares reais abertos
          // Todos os pares disponíveis no horário (reais + OTC) — o gráfico 24h decide quais são lucrativos.
          // Par OTC cujo par real já está aberto é pulado (mesmo gráfico base, evitaria misturar preços).
          if (isOtc && realOpenBases.has(base)) continue;
          if (weekend && !isOtc) continue;
          // Cripto OTC da IQ tem preço sintético que diverge do mercado real (Yahoo) — gerava perdas
          if (isOtc && assetKind(base) === 'crypto') continue;
          seen.add(symbol);
          if (Array.isArray(a.candles) && a.candles.length > 0) iqCandles.set(base, a.candles);
          if (a.bt24) bt24Map.set(symbol, a.bt24);
          if (isOtc) otcOnlySymbols.add(base);
          const kind = assetKind(base);
          openIqAssets.push({
            symbol,
            icon: kind === 'crypto' ? '🪙' : kind === 'stock' ? '📈' : isOtc ? '🔵' : '💱',
            type: isOtc ? 'otc' : kind,
            isOTC: isOtc,
          } as Asset);
        }
      }
    } catch (e) {
      console.log('⚠️ Falha ao verificar ativos abertos na IQ Option:', e);
    }
    if (openIqAssets.length === 0) {
      console.log('⛔ Não foi possível confirmar ativos abertos na IQ Option — ciclo ignorado');
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'IQ Option open assets not verified' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const kinds = openIqAssets.reduce((m: any, a) => { const k = assetKind(a.symbol.replace('-OTC', '')); m[k] = (m[k] || 0) + 1; return m; }, {});
    console.log(`🟢 IQ Option: ${openIqAssets.length} ativos ABERTOS (${JSON.stringify(kinds)})`);

    // ============= FETCH REAL PRICES =============
    const baseSymbols = [...new Set(openIqAssets.map(a => a.symbol.replace('-OTC', '')))];
    const realPrices = await fetchRealPrices(supabase, baseSymbols);

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

    // ============= ASSETS (já verificados na IQ Option antes da busca de preços) =============
    let assets: Asset[] = openIqAssets;

    // ============= FILTER BLOCKED ASSETS =============
    const originalCount = assets.length;
    assets = assets.filter(asset => {
      const key = asset.symbol.toUpperCase();

      if (assetsWithPendingTrades.has(key)) return false;
      if (assetsWithRecentSignals.has(key)) return false;

      // SÓ IA: sem filtro de notícias (pedido do usuário)

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

    // ===== NUNCA FICAR EM ESPERA =====
    // Se nenhum gatilho forte disparou, roda uma 2ª passada em modo oportunidade:
    // aceita tendência alinhada + MACD e deixa a IA decidir o melhor candidato.
    {
      console.log('🔎 2ª passada em MODO OPORTUNIDADE (ações/cripto sempre + demais se vazio)...');
      const have = new Set(candidates.map((c: any) => c.asset.toUpperCase()));
      const pri = [...shuffled].sort((a, b) => (assetKind(b.symbol.replace('-OTC','')) !== 'forex' ? 1 : 0) - (assetKind(a.symbol.replace('-OTC','')) !== 'forex' ? 1 : 0));
      for (const asset of pri) {
        if (have.has(asset.symbol.toUpperCase())) continue;
        const nonFx = assetKind(asset.symbol.replace('-OTC','')) !== 'forex';
        if (!nonFx && candidates.length > 0) continue;
        const realPrice = realPrices.get(asset.symbol) || realPrices.get(asset.symbol.replace('-OTC', ''));
        const signal = await analyzeAssetWithRealData(asset, supabase, realPrice, true);
        if (signal) candidates.push(signal);
        if (candidates.length >= 8) break; // limita envio à IA
      }
    }

    if (candidates.length === 0) {
      console.log('⏳ Nenhum sinal de exaustão real encontrado neste ciclo');
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'no real exhaustion signals' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // SÓ IA: envia à IA os 10 ativos com mais confluência (limite de tamanho da análise)
    candidates.sort((a: any, b: any) => (b.indicators?.confluenceScore || 0) - (a.indicators?.confluenceScore || 0));
    candidates.splice(10);

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
    // Aprendizado contínuo: desempenho por ativo+direção nas últimas operações
    const learnedStats = new Map<string, { wins: number; losses: number; profit: number }>();
    try {
      const { data: results } = await supabase
        .from('operation_results')
        .select('asset, result, direction, profit')
        .neq('timeframe', 'MT5')
        .order('created_at', { ascending: false })
        .limit(300);

      if (results && results.length > 0) {
        const assetStats = new Map<string, { wins: number; losses: number }>();
        results.forEach((r: any) => {
          const stats = assetStats.get(r.asset) || { wins: 0, losses: 0 };
          if (r.result === 'win') stats.wins++;
          else if (r.result === 'loss') stats.losses++;
          assetStats.set(r.asset, stats);
          const k = `${String(r.asset).toUpperCase()}|${String(r.direction || '').toUpperCase()}`;
          const ls = learnedStats.get(k) || { wins: 0, losses: 0, profit: 0 };
          if (r.result === 'win') ls.wins++;
          else if (r.result === 'loss') ls.losses++;
          ls.profit += Number(r.profit) || 0;
          learnedStats.set(k, ls);
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
        let executeSignals = aiData.analyzedSignals.filter((a: any) => a.recommendation === 'EXECUTE');
        console.log(`🧠 IA (${aiData.engine || 'unknown'}): ${executeSignals.length}/${aiData.analyzedSignals.length} sinais aprovados`);
        // Sem espera: se a IA não aprovou nenhum, usa a MELHOR entrada analisada por ela (a favor da tendência)
        if (executeSignals.length === 0 && aiData.analyzedSignals.length > 0) {
          const best = [...aiData.analyzedSignals].sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))[0];
          console.log(`🎯 SÓ IA (sem confiança mínima): melhor análise ${best.asset} ${best.bestDirection || ''} ${best.confidence}% — ${best.reason || ''}`);
          executeSignals = [...aiData.analyzedSignals].sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0)).slice(0, 5);
        }

        for (const approved of executeSignals) {
          const candidate = candidates.find(c => c.asset.toUpperCase() === approved.asset.toUpperCase());
          if (candidate) {
            // A IA decide a direção livremente
            const bestDir = String(approved.bestDirection || candidate.type).toUpperCase();
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

    // MT5 SÓ opera com aprovação da IA — sem fallback técnico
    if (aiApprovedSignals.length === 0) {
      console.log('⚠️ IA não aprovou nenhum sinal — MT5 e IQ bloqueados (somente sinais aprovados pela IA)');
      return new Response(
        JSON.stringify({ success: true, generated: 0, reason: 'AI did not approve any signals' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // APRENDIZADO CONTÍNUO: ativo+direção que já deu win sobe; o que deu mais loss desce para o fim.
    // Nunca fica em espera — se todos forem ruins, entra no menos ruim.
    const learnScore = (s: any) => {
      const k = `${String(s.asset).toUpperCase()}|${String(s.aiDirection || s.type).toUpperCase()}`;
      const st = learnedStats.get(k);
      if (!st) return { score: s.aiConfidence || 0, bad: false, info: 'sem histórico' };
      const diff = st.wins - st.losses;
      const bad = st.losses > st.wins && (st.wins + st.losses) >= 3;
      return { score: (s.aiConfidence || 0) + diff * 10, bad, info: `${st.wins}W/${st.losses}L` };
    };
    aiApprovedSignals.forEach(s => { const l = learnScore(s); s.learnScore = l.score; s.learnBad = l.bad; s.learnInfo = l.info; });
    aiApprovedSignals.sort((a, b) => (Number(a.learnBad) - Number(b.learnBad)) || (b.learnScore - a.learnScore));
    console.log(`📚 Aprendizado: ${aiApprovedSignals.map(s => `${s.asset} ${s.aiDirection || s.type} [${s.learnInfo}${s.learnBad ? ' ⛔' : ''}]`).join(' | ')}`);

    // BLOQUEIO POR APRENDIZADO: ativo+direção com mais losses que wins (mín. 3 ops) fica de fora.
    // Só entra no "menos ruim" se TODOS os candidatos estiverem bloqueados (nunca fica em espera).
    const cleanSignals = aiApprovedSignals.filter(s => !s.learnBad);
    const pool = cleanSignals.length > 0 ? cleanSignals : aiApprovedSignals;
    if (cleanSignals.length < aiApprovedSignals.length) {
      console.log(`🧹 Filtro de aprendizado: ${aiApprovedSignals.length - cleanSignals.length} candidato(s) bloqueado(s) por histórico negativo`);
    }

    // ============= EXECUTE BEST SIGNAL (IQ: 1, MT5: até 20) =============
    const signalsToExecute = pool.length > 0 ? [pool[0]] : [];
    
    // Salvar TODOS os sinais aprovados pela IA no banco (não só o melhor)
    for (let i = 1; i < aiApprovedSignals.length; i++) {
      const extraSignal = aiApprovedSignals[i];
      await supabase.from('trading_signals').insert({
        signal_id: extraSignal.id,
        asset: extraSignal.asset,
        asset_icon: extraSignal.assetIcon,
        type: extraSignal.type,
        timeframe: extraSignal.timeframe,
        expiration: extraSignal.expiration,
        strength: extraSignal.strength,
        status: extraSignal.status,
        price: extraSignal.price,
        is_hot: extraSignal.isHot,
        market_type: extraSignal.marketType,
        confluence_score: extraSignal.indicators.confluenceScore,
        confluence_count: extraSignal.indicators.confluenceCount,
        confirmations: extraSignal.confirmations,
        indicators: extraSignal.indicators,
      });
    }
    
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

      // ============= FOREX IMEDIATO — sem confirmações, TP x1000 =============
      try {
        const fxParts = bestSignal.asset.split('/').map((p: string) => p.trim().toUpperCase());
        const fxCur = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
        const isFx = !/OTC|BLITZ/i.test(bestSignal.asset) && fxParts.length === 2 && fxParts.every((p: string) => fxCur.includes(p));
        if (isFx) {
          const { data: fxOpen } = await supabase.from('operation_results')
            .select('id').eq('timeframe', 'FOREX').eq('result', 'open').eq('asset', bestSignal.asset).limit(1);
          if (!fxOpen || fxOpen.length === 0) {
            const { data: fxCfg } = await supabase.from('iqoption_config').select('user_id')
              .eq('is_active', true).not('user_id', 'is', null)
              .order('last_connected_at', { ascending: false }).limit(1).maybeSingle();
            const { data: fxSet } = fxCfg ? await supabase.from('user_trading_settings')
              .select('trade_amount').eq('user_id', fxCfg.user_id).limit(1).maybeSingle() : { data: null };
            const fxAmount = Number(fxSet?.trade_amount) || 1;
            const fxDir = (bestSignal.aiDirection || bestSignal.type).toLowerCase();
            const { data: fxData } = await supabase.functions.invoke('iqoption-place-trade', {
              body: {
                asset: bestSignal.asset, direction: fxDir, amount: fxAmount, expiration: 1,
                signalId: `fx-${bestSignal.id}`, isAutoTrade: true, isAIAnalyzed: !!bestSignal.aiConfidence, mode: 'forex',
              },
            });
            console.log(`💱 FOREX IMEDIATO ${bestSignal.asset} ${fxDir}: ${fxData?.success ? 'aberto ' + fxData.tradeId : 'falhou ' + fxData?.error}`);
          } else {
            console.log(`💱 FOREX ${bestSignal.asset}: já existe posição aberta`);
          }
        }
      } catch (e) {
        console.error('❌ FOREX imediato falhou:', e);
      }

      // ============= IQ OPTION TRADE =============
      try {
        const forexCurrencies = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'HKD', 'THB'];
        const assetClean = bestSignal.asset.replace('-OTC', '').replace(' OTC', '').trim();
        const assetParts = assetClean.split('/').map((p: string) => p.trim().toUpperCase());
        const isForexPair = assetParts.length === 2 && assetParts.every((p: string) => forexCurrencies.includes(p));

        // Todos os ativos abertos na IQ (moedas, ações, cripto) podem operar opções
        if (hasAnyPendingIQTrade) {
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
                .select('trade_amount, mt5_trade_amount, use_dynamic_stake, iq_max_stake_pct, iq_stake_cap_usd, risk_per_trade, profit_target_type, profit_target_value')
                .eq('user_id', iqConfig.user_id)
                .limit(1)
                .maybeSingle();

              // ===== META DIÁRIA: PARAR SE JÁ ATINGIU =====
              if (tradeSettings?.profit_target_type && tradeSettings.profit_target_type !== 'none' && Number(tradeSettings.profit_target_value) > 0) {
                const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
                const { data: todayOps } = await supabase
                  .from('operation_results')
                  .select('profit, timeframe')
                  .gte('created_at', startOfDay.toISOString())
                  .neq('timeframe', 'MT5');
                const dailyProfit = (todayOps || []).reduce((acc: number, o: any) => acc + Number(o.profit || 0), 0);
                const target = Number(tradeSettings.profit_target_value);
                if (dailyProfit >= target) {
                  console.log(`🎯 IQ: META DIÁRIA atingida ($${dailyProfit.toFixed(2)} >= $${target}). Auto-trading pausado.`);
                  continue;
                }
              }

              // ===== STAKE DINÂMICO (% DA BANCA) =====
              let iqTradeAmount = Number(tradeSettings?.trade_amount) || 1;
              if (tradeSettings?.use_dynamic_stake) {
                try {
                  const { data: balData } = await supabase.functions.invoke('iqoption-get-balance', {
                    body: { userId: iqConfig.user_id },
                  });
                  const balance = Number(balData?.balance) || 0;
                  if (balance > 0) {
                    const pct = Number(tradeSettings.iq_max_stake_pct ?? tradeSettings.risk_per_trade ?? 2);
                    const cap = Number(tradeSettings.iq_stake_cap_usd ?? 200);
                    const dynamicAmount = Math.min(balance * (pct / 100), cap);
                    iqTradeAmount = Math.max(1, Math.floor(dynamicAmount * 100) / 100);
                    console.log(`💰 Stake dinâmico: banca $${balance.toFixed(2)} × ${pct}% = $${iqTradeAmount} (cap $${cap})`);
                  }
                } catch (e) {
                  console.warn('⚠️ Stake dinâmico falhou, usando valor fixo:', e);
                }
              }

              // Proteção diária removida a pedido do usuário — sem pausa por lucro/perda do dia

              // SÓ IA: sem gale, sem filtro de exaustão, sem filtro OTC (pedido do usuário)
              const expiration = 1; // sempre 1 minuto
              const executionDirection = bestSignal.aiDirection || bestSignal.type;

              // Sincronização de entrada (2s antes da vela) é feita em iqoption-place-trade
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

              // FOREX agora é aberto no bloco imediato (antes das opções)

              if (!iqError && iqData?.success) {
                totalIQ++;
                console.log(`✅ IQ REAL (${iqData.mode}): ${bestSignal.asset} ${executionDirection} (IA) | ID: ${iqData.tradeId}`);
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
    const MAX_MT5_POSITIONS = 20;
    const MT5_ENABLED = false; // MT5 desativado — somente IQ Option
    if (MT5_ENABLED) try {
      // MT5 SOMENTE com sinais aprovados pela IA (sem fallback técnico)
      const allMT5Candidates = aiApprovedSignals.filter(s => !s.asset.toUpperCase().includes('OTC'));

      // Remover duplicatas por ativo
      const seenAssets = new Set<string>();
      const uniqueMT5Candidates = allMT5Candidates.filter(s => {
        const key = s.asset.toUpperCase();
        if (seenAssets.has(key)) return false;
        seenAssets.add(key);
        return true;
      });

      const MT5_MIN_CONFLUENCE = 50; // Reduzido de 60 para 50 (IA já valida)

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

            // Enviar até slotsAvailable sinais para MT5 EM PARALELO
            const mt5ToExecute = uniqueMT5Candidates.slice(0, slotsAvailable);
            
            // Preparar trades válidos
            const validMT5Trades = mt5ToExecute.filter(mt5Signal => {
              if (!mt5Signal.aiConfidence && mt5Signal.indicators.confluenceScore < MT5_MIN_CONFLUENCE) {
                console.log(`⏭️ MT5: ${mt5Signal.asset} confluência ${mt5Signal.indicators.confluenceScore}% < ${MT5_MIN_CONFLUENCE}%`);
                return false;
              }
              if (mt5Signal.aiConfidence && mt5Signal.aiConfidence < MT5_MIN_AI_CONFIDENCE) {
                console.log(`⏭️ MT5: ${mt5Signal.asset} IA confiança ${mt5Signal.aiConfidence}% < ${MT5_MIN_AI_CONFIDENCE}%`);
                return false;
              }
              const mt5NewsCheck = isAssetAffectedByNews(mt5Signal.asset);
              if (mt5NewsCheck.affected) {
                console.log(`🚫 MT5: ${mt5Signal.asset} BLOQUEADO — ${mt5NewsCheck.reason}`);
                return false;
              }
              // MT5 PREFERE volatilidade alta — mais movimento = TP mais rápido
              if (mt5Signal.indicators.atr?.volatility === 'high') {
                console.log(`🔥 MT5: ${mt5Signal.asset} ALTA VOLATILIDADE — PRIORIZANDO para spread rápido`);
              }
              return true;
            });

            console.log(`🚀 MT5: Enviando ${validMT5Trades.length} trades em PARALELO (slots: ${slotsAvailable})`);

            // Executar TODOS os trades MT5 em paralelo
            const mt5Promises = validMT5Trades.map(async (mt5Signal) => {
              const mt5Direction = mt5Signal.aiDirection || mt5Signal.type;
              console.log(`📡 MT5 SPREAD: ${mt5Signal.asset} ${mt5Direction} $${mt5TradeAmount} | Score: ${mt5Signal.indicators.confluenceScore}%`);

              try {
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
                  console.log(`✅ MT5 SPREAD: ${mt5Data.symbol} ${mt5Data.direction} — OK`);
                  return { success: true, symbol: mt5Data.symbol };
                } else if (mt5Data?.skipped) {
                  console.log(`⏭️ MT5: ${mt5Data.error}`);
                  return { success: false, skipped: true };
                } else {
                  console.error(`❌ MT5 falhou: ${mt5Error?.message || mt5Data?.error}`);
                  return { success: false };
                }
              } catch (e) {
                console.error(`❌ MT5 ${mt5Signal.asset} erro:`, e);
                return { success: false };
              }
            });

            const mt5Results = await Promise.all(mt5Promises);
            totalMT5 = mt5Results.filter(r => r.success).length;
            console.log(`📊 MT5 PARALELO: ${totalMT5}/${validMT5Trades.length} trades executados com sucesso`);
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
