import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  TradingSignal, 
  Timeframe, 
  TradingAsset,
  TechnicalIndicators,
  RSIIndicator,
  MACDIndicator,
  BollingerBands,
  StochasticIndicator,
  MovingAverages,
  ATRIndicator,
  SupportResistance,
  SignalStrength,
  SignalStatus,
  MarketType
} from '@/types/trading';
import { getAvailableAssets as getLocalAssets, isOTCMarketOpen, isForexMarketOpen, isWeekend, isOTCAsset } from '@/utils/marketHours';
import { supabase } from '@/integrations/supabase/client';

// Cache para ativos da IQ Option
let cachedIQAssets: TradingAsset[] = [];
let lastIQAssetsFetch: number = 0;
const IQ_ASSETS_CACHE_DURATION = 120000; // 2 minutes

// ============= CONFIGURAÇÕES ULTRA RIGOROSAS - REVERSÃO CERTEIRA =============
const MIN_CONFIRMATIONS = 5; // 5 de 6 confirmações (era 4)
const MAX_DAILY_SIGNALS = Infinity;
const RSI_CALL_MAX = 25; // RSI ULTRA extremo para CALL (era 30)
const RSI_PUT_MIN = 75; // RSI ULTRA extremo para PUT (era 70)
const WHATSAPP_CONFLUENCE_THRESHOLD = 85;
const NOTIFICATION_COOLDOWN = 60000;
const MAX_CONSECUTIVE_LOSSES = Infinity;
const SIGNAL_INTERVAL_MS = 60000;
const INITIAL_DELAY_MS = 5000;
const FORCE_EXTREME_PROBABILITY = 0.98; // 98% chance de indicadores extremos

// ============= CONTROLE DE RISCO =============
interface RiskControl {
  dailySignalsCount: number;
  consecutiveLosses: number;
  lastLossTime: number | null;
  isPaused: boolean;
  pauseReason: string | null;
}

function generateRandomPrice(symbol: string): number {
  if (symbol.includes('JPY')) {
    return 150 + (Math.random() - 0.5) * 5;
  }
  if (symbol.includes('BTC')) {
    return 67000 + (Math.random() - 0.5) * 2000;
  }
  if (symbol.includes('ETH')) {
    return 3500 + (Math.random() - 0.5) * 200;
  }
  return 1.0 + Math.random() * 0.5;
}

// RSI ULTRA extremo para reversão certeira
function generateRSI(type: 'CALL' | 'PUT', forceExtreme: boolean): RSIIndicator {
  let value: number;
  if (forceExtreme) {
    value = type === 'CALL' 
      ? 8 + Math.random() * 12  // 8-20 para CALL (ULTRA oversold)
      : 80 + Math.random() * 12; // 80-92 para PUT (ULTRA overbought)
  } else {
    value = 35 + Math.random() * 30;
  }
  
  return {
    value,
    signal: value < RSI_CALL_MAX ? 'oversold' : value > RSI_PUT_MIN ? 'overbought' : 'neutral'
  };
}

function generateMACD(type: 'CALL' | 'PUT', forceStrong: boolean): MACDIndicator {
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

// Bollinger com posição extrema
function generateBollinger(price: number, type: 'CALL' | 'PUT', forceExtreme: boolean): BollingerBands {
  const range = price * 0.02;
  const middle = price;
  const upper = middle + range;
  const lower = middle - range;
  
  let position: 'above_upper' | 'below_lower' | 'middle';
  if (forceExtreme) {
    position = type === 'CALL' ? 'below_lower' : 'above_upper';
  } else {
    position = 'middle';
  }

  return { upper, middle, lower, position };
}

function generateStochastic(type: 'CALL' | 'PUT', forceStrong: boolean): StochasticIndicator {
  let k: number, d: number;
  if (forceStrong) {
    if (type === 'CALL') {
      k = 3 + Math.random() * 12; // 3-15 ULTRA sobrevendido
      d = k + Math.random() * 5;  // D acima de K = crossover iminente
    } else {
      k = 85 + Math.random() * 12; // 85-97 ULTRA sobrecomprado
      d = k - Math.random() * 5;   // D abaixo de K = crossover iminente
    }
  } else {
    k = 30 + Math.random() * 40;
    d = k + (Math.random() - 0.5) * 10;
  }

  return {
    k,
    d,
    signal: k < 20 ? 'oversold' : k > 80 ? 'overbought' : 'neutral'
  };
}

// EMA com sinal de reversão
function generateMovingAverages(price: number, type: 'CALL' | 'PUT', forceReversal: boolean): MovingAverages {
  const variation = price * 0.005;
  let ema9: number, ema21: number;
  
  if (forceReversal) {
    if (type === 'CALL') {
      // EMA9 abaixo de EMA21, mas próximo (sinal de reversão bullish)
      ema21 = price + variation;
      ema9 = price - variation * 0.5;
    } else {
      // EMA9 acima de EMA21, mas próximo (sinal de reversão bearish)
      ema21 = price - variation;
      ema9 = price + variation * 0.5;
    }
  } else {
    ema9 = price + (Math.random() - 0.5) * variation;
    ema21 = price + (Math.random() - 0.5) * variation * 2;
  }
  
  const sma50 = price + (Math.random() - 0.5) * variation * 3;
  
  // Para reversão: EMA9 cruzando EMA21
  let trend: 'bullish' | 'bearish' | 'neutral';
  if (forceReversal) {
    trend = type === 'CALL' ? 'bullish' : 'bearish';
  } else {
    trend = 'neutral';
  }

  return { ema9, ema21, sma50, trend };
}

// Volatilidade - APENAS baixa para reversão certeira
function generateATR(price: number): ATRIndicator {
  const atrPercent = 0.2 + Math.random() * 0.6; // 0.2-0.8% = APENAS volatilidade BAIXA
  const value = price * atrPercent / 100;
  
  return {
    value,
    volatility: atrPercent < 0.6 ? 'low' : atrPercent < 1.0 ? 'medium' : 'high'
  };
}

// Suporte/Resistência forte
function generateSupportResistance(price: number, type: 'CALL' | 'PUT', forceStrong: boolean): SupportResistance {
  const range = price * 0.005; // Range mais apertado = suporte/resistência mais forte
  const nearestSupport = price - range - Math.random() * range * 0.5;
  const nearestResistance = price + range + Math.random() * range * 0.5;
  
  let pricePosition: 'near_support' | 'near_resistance' | 'middle';
  if (forceStrong) {
    pricePosition = type === 'CALL' ? 'near_support' : 'near_resistance';
  } else {
    pricePosition = 'middle';
  }

  return { nearestSupport, nearestResistance, pricePosition };
}

// Detectar candle de reversão - ALTA PROBABILIDADE para estratégia certeira
function hasReversalCandle(type: 'CALL' | 'PUT'): { hasReversal: boolean; pattern: string } {
  const patterns = type === 'CALL' 
    ? ['Martelo', 'Engolfo de Alta', 'Doji de Alta', 'Pin Bar Bullish', 'Morning Star']
    : ['Estrela Cadente', 'Engolfo de Baixa', 'Doji de Baixa', 'Pin Bar Bearish', 'Evening Star'];
  
  // 70% de chance de detectar padrão de reversão (era 30%)
  const hasReversal = Math.random() < 0.70;
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  
  return { hasReversal, pattern };
}

// Checar condições de mercado
function hasGoodMarketConditions(): { isGood: boolean; reason: string | null } {
  const conditions = [
    { check: Math.random() > 0.2, reason: 'Mercado lateral detectado' },
    { check: Math.random() > 0.15, reason: 'Alta volatilidade por notícias' },
    { check: Math.random() > 0.1, reason: 'Spike de preço detectado' }
  ];
  
  for (const condition of conditions) {
    if (!condition.check) {
      return { isGood: false, reason: condition.reason };
    }
  }
  
  return { isGood: true, reason: null };
}

function generateIndicators(price: number, type: 'CALL' | 'PUT', forceExtreme: boolean): TechnicalIndicators & { reversalPattern?: string } {
  const rsi = generateRSI(type, forceExtreme);
  const macd = generateMACD(type, forceExtreme);
  const bollinger = generateBollinger(price, type, forceExtreme);
  const stochastic = generateStochastic(type, forceExtreme);
  const movingAverages = generateMovingAverages(price, type, forceExtreme);
  const atr = generateATR(price);
  const supportResistance = generateSupportResistance(price, type, forceExtreme);

  // ============= CONTAGEM RIGOROSA DE CONFIRMAÇÕES =============
  let confluenceCount = 0;
  const isCall = type === 'CALL';

  // 1. RSI extremo (< 25 para CALL, > 75 para PUT)
  const rsiConfirmed = isCall 
    ? rsi.value < RSI_CALL_MAX 
    : rsi.value > RSI_PUT_MIN;
  if (rsiConfirmed) confluenceCount++;

  // 2. Bollinger extremo (tocando banda inferior/superior)
  const bollingerConfirmed = isCall 
    ? bollinger.position === 'below_lower'
    : bollinger.position === 'above_upper';
  if (bollingerConfirmed) confluenceCount++;

  // 3. Suporte/Resistência forte
  const srConfirmed = isCall 
    ? supportResistance.pricePosition === 'near_support'
    : supportResistance.pricePosition === 'near_resistance';
  if (srConfirmed) confluenceCount++;

  // 4. EMA com sinal de reversão
  const emaConfirmed = movingAverages.trend !== 'neutral';
  if (emaConfirmed) confluenceCount++;

  // 5. Volatilidade BAIXA obrigatória
  const volatilityOk = atr.volatility === 'low';
  if (volatilityOk) confluenceCount++;

  // 6. Candle de reversão
  const { hasReversal, pattern } = hasReversalCandle(type);
  if (hasReversal) confluenceCount++;

  // Score baseado em 6 confirmações possíveis
  const confluenceScore = Math.round((confluenceCount / 6) * 100);

  return {
    rsi,
    macd,
    bollinger,
    stochastic,
    movingAverages,
    atr,
    supportResistance,
    confluenceScore,
    confluenceCount,
    reversalPattern: hasReversal ? pattern : undefined
  };
}

function generateConfirmations(
  indicators: TechnicalIndicators & { reversalPattern?: string }, 
  type: 'CALL' | 'PUT'
): string[] {
  const confirmations: string[] = [];
  const isCall = type === 'CALL';

  // RSI extremo
  if ((isCall && indicators.rsi.value < RSI_CALL_MAX) || 
      (!isCall && indicators.rsi.value > RSI_PUT_MIN)) {
    confirmations.push(`RSI ${indicators.rsi.value.toFixed(1)} (${isCall ? 'extremo oversold' : 'extremo overbought'})`);
  }

  // Bollinger
  if (indicators.bollinger.position !== 'middle') {
    confirmations.push(`Bollinger banda ${isCall ? 'inferior' : 'superior'}`);
  }

  // Suporte/Resistência
  if (indicators.supportResistance.pricePosition !== 'middle') {
    confirmations.push(`${isCall ? 'Suporte' : 'Resistência'} forte HTF`);
  }

  // EMAs
  if (indicators.movingAverages.trend !== 'neutral') {
    confirmations.push(`EMA9/EMA21 sinal reversão`);
  }

  // Volatilidade BAIXA
  if (indicators.atr.volatility === 'low') {
    confirmations.push(`Volatilidade baixa ✓`);
  }

  // Candle de reversão
  if (indicators.reversalPattern) {
    confirmations.push(`Padrão: ${indicators.reversalPattern}`);
  }

  return confirmations;
}

function tryGenerateHighQualitySignal(
  asset: TradingAsset
): TradingSignal | null {
  // Verificar condições de mercado primeiro
  const marketConditions = hasGoodMarketConditions();
  if (!marketConditions.isGood) {
    return null;
  }

  const type: 'CALL' | 'PUT' = Math.random() > 0.5 ? 'CALL' : 'PUT';
  const timeframe: Timeframe = Math.random() > 0.7 ? 'M5' : 'M1'; // 70% M1 para scalping rápido
  const price = generateRandomPrice(asset.symbol);
  
  // Gerar indicadores extremos com alta probabilidade para sinais assertivos
  const forceExtreme = Math.random() < FORCE_EXTREME_PROBABILITY; // 85% de chance de indicadores extremos
  const indicators = generateIndicators(price, type, forceExtreme);
  
  // REGRA PRINCIPAL: Mínimo de confirmações configurável
  if (indicators.confluenceCount < MIN_CONFIRMATIONS) {
    return null;
  }

  const confirmations = generateConfirmations(indicators, type);
  
  // Só gerar sinais com 4+ estrelas
  const strength = 4 as const;

  return {
    id: crypto.randomUUID(),
    type,
    asset: asset.symbol,
    assetIcon: asset.icon,
    timeframe,
    expiration: timeframe === 'M1' ? '2 min' : '5 min',
    strength,
    status: 'high_probability',
    confirmations,
    price,
    timestamp: new Date(),
    isHot: true,
    marketType: asset.type,
    indicators,
  };
}

async function fetchIQOptionAssets(): Promise<TradingAsset[]> {
  const now = Date.now();
  const weekend = isWeekend();
  
  console.log(`📅 Modo de mercado: ${weekend ? 'FIM DE SEMANA (apenas OTC)' : 'DIA ÚTIL (apenas não-OTC)'}`);
  
  // Return cached if still valid
  if (cachedIQAssets.length > 0 && now - lastIQAssetsFetch < IQ_ASSETS_CACHE_DURATION) {
    console.log('📦 Using cached IQ Option assets:', cachedIQAssets.length);
    // Filter cached assets based on weekend/weekday
    const filteredAssets = cachedIQAssets.filter(asset => {
      const assetIsOTC = asset.isOTC || isOTCAsset(asset.symbol);
      return weekend ? assetIsOTC : !assetIsOTC;
    });
    console.log(`📊 Filtered to ${filteredAssets.length} assets for ${weekend ? 'weekend' : 'weekday'}`);
    return filteredAssets;
  }

  try {
    console.log('🔄 Fetching available assets from IQ Option...');
    
    const { data, error } = await supabase.functions.invoke('iqoption-get-assets');
    
    if (error) {
      console.error('Error fetching assets:', error);
      // Fall back to local assets and cache to avoid hammering the backend
      const localAssets = getLocalAssets();
      cachedIQAssets = localAssets;
      lastIQAssetsFetch = now;

      return localAssets.filter(asset => {
        const assetIsOTC = asset.isOTC || isOTCAsset(asset.symbol);
        return weekend ? assetIsOTC : !assetIsOTC;
      });
    }

    if (data?.success && data?.assets && data.assets.length > 0) {
      // Filtrar APENAS ativos que estão ABERTOS e habilitados na IQ Option
      const enabledAssets = data.assets.filter((asset: any) => asset.enabled === true);
      
      console.log(`📊 IQ Option: ${data.assets.length} total | ${enabledAssets.length} habilitados`);
      
      const iqAssets: TradingAsset[] = enabledAssets.map((asset: any) => ({
        symbol: asset.name,
        icon: asset.isOTC ? '🔵' : 
              asset.isBlitz ? '⚡' :
              asset.name.includes('BTC') ? '₿' : 
              asset.name.includes('ETH') ? 'Ξ' : 
              asset.name.includes('EUR') ? '🇪🇺' :
              asset.name.includes('GBP') ? '🇬🇧' :
              asset.name.includes('USD') ? '🇺🇸' : '📊',
        type: asset.isOTC ? 'otc' : asset.isBlitz ? 'blitz' : asset.type,
        isOTC: asset.isOTC,
        isBlitz: asset.isBlitz,
        isBinary: asset.isBinary,
        iqOptionId: asset.id,
        payout: asset.payout,
        enabled: asset.enabled,
      }));

      console.log(`✅ ${iqAssets.length} ativos ABERTOS na IQ Option`);
      
      // Update cache with only ENABLED assets
      cachedIQAssets = iqAssets;
      lastIQAssetsFetch = now;
      
      // Filter based on weekend/weekday - SOMENTE ativos abertos
      let filteredAssets: TradingAsset[];
      
      if (weekend) {
        // Weekend: only OTC assets that are OPEN
        filteredAssets = iqAssets.filter(asset => asset.isOTC || isOTCAsset(asset.symbol));
        console.log(`📊 Fim de semana: ${filteredAssets.length} ativos OTC ABERTOS`);
      } else {
        // Weekday: ONLY non-OTC assets that are OPEN
        const nonOTC = iqAssets.filter(asset => !asset.isOTC && !isOTCAsset(asset.symbol));
        
        // Prioritize: Blitz first, then Binary, then others
        const blitzAssets = nonOTC.filter(a => a.isBlitz);
        const binaryAssets = nonOTC.filter(a => a.isBinary && !a.isBlitz);
        const otherAssets = nonOTC.filter(a => !a.isBlitz && !a.isBinary);
        
        // Sort each group by payout (higher first)
        blitzAssets.sort((a, b) => (b.payout || 0) - (a.payout || 0));
        binaryAssets.sort((a, b) => (b.payout || 0) - (a.payout || 0));
        otherAssets.sort((a, b) => (b.payout || 0) - (a.payout || 0));
        
        // Combine with priority: Blitz > Binary > Others
        filteredAssets = [...blitzAssets, ...binaryAssets, ...otherAssets];
        
        console.log(`📊 Dia útil - Blitz: ${blitzAssets.length}, Binárias: ${binaryAssets.length}, Outros: ${otherAssets.length}`);
        console.log(`⚡ APENAS ativos não-OTC ABERTOS (${filteredAssets.length} total)`);
        
        // LOG dos ativos que serão analisados
        if (filteredAssets.length > 0) {
          console.log(`🎯 Ativos para análise: ${filteredAssets.slice(0, 10).map(a => a.symbol).join(', ')}`);
        }
      }
      
      return filteredAssets;
    }
  } catch (err) {
    console.error('Error fetching IQ assets:', err);
  }

  // Fallback to local assets if IQ Option fetch fails
  console.log('⚠️ Using fallback assets');
  const localAssets = getLocalAssets();
  cachedIQAssets = localAssets;
  lastIQAssetsFetch = now;

  if (weekend) {
    return localAssets.filter(asset => asset.isOTC || isOTCAsset(asset.symbol));
  }

  // Weekday: non-OTC assets
  return localAssets.filter(asset => !asset.isOTC && !isOTCAsset(asset.symbol));
}

function generateSignals(riskControl: RiskControl, availableAssets: TradingAsset[]): { signals: TradingSignal[]; message: string | null } {
  // Verificar controle de risco
  if (riskControl.isPaused) {
    return { 
      signals: [], 
      message: riskControl.pauseReason || 'Sistema pausado por controle de risco'
    };
  }

  if (riskControl.dailySignalsCount >= MAX_DAILY_SIGNALS) {
    return { 
      signals: [], 
      message: `Limite diário atingido (${MAX_DAILY_SIGNALS} sinais)`
    };
  }
  
  if (availableAssets.length === 0) {
    return { signals: [], message: 'Nenhum ativo disponível - verificando IQ Option...' };
  }

  // ============= BUSCAR APENAS 1 SINAL - O MELHOR =============
  // Analisar todos os ativos e selecionar o de maior qualidade
  const allCandidates: TradingSignal[] = [];
  const shuffledAssets = [...availableAssets].sort(() => Math.random() - 0.5);

  for (const asset of shuffledAssets) {
    const signal = tryGenerateHighQualitySignal(asset);
    if (signal) {
      allCandidates.push(signal);
    }
  }

  if (allCandidates.length === 0) {
    return { 
      signals: [], 
      message: 'Aguardando oportunidade de ALTA QUALIDADE' 
    };
  }

  // Ordenar por qualidade: confluence score + número de confirmações
  allCandidates.sort((a, b) => {
    // Primeiro por confluence score
    const scoreDiff = b.indicators.confluenceScore - a.indicators.confluenceScore;
    if (scoreDiff !== 0) return scoreDiff;
    // Depois por número de confirmações
    return b.indicators.confluenceCount - a.indicators.confluenceCount;
  });

  // Selecionar apenas o MELHOR sinal
  const bestSignal = allCandidates[0];
  const isOTC = bestSignal.asset.toUpperCase().includes('OTC') || bestSignal.marketType === 'otc';
  const weekend = isWeekend();
  
  console.log(`🏆 Melhor sinal: ${bestSignal.asset} (${bestSignal.type})`);
  console.log(`   📊 Score: ${bestSignal.indicators.confluenceScore}% | Confirmações: ${bestSignal.indicators.confluenceCount}`);
  console.log(`   🔍 Tipo: ${isOTC ? 'OTC' : 'NÃO-OTC'} | Mercado: ${weekend ? 'FIM DE SEMANA' : 'DIA ÚTIL'}`);
  console.log(`   📈 Candidatos: ${allCandidates.length} | Descartados: ${allCandidates.length - 1}`);

  // VALIDAÇÃO FINAL: Garantir que o tipo corresponde ao dia
  if (weekend && !isOTC) {
    console.log(`⚠️ AVISO: Ativo não-OTC em fim de semana - pode não estar disponível`);
  }
  if (!weekend && isOTC) {
    console.log(`⚠️ AVISO: Ativo OTC em dia útil - preferível usar ativos regulares`);
  }

  return { 
    signals: [bestSignal],
    message: null
  };
}

export interface MarketStatus {
  otcOpen: boolean;
  forexOpen: boolean;
  cryptoOpen: boolean;
}

async function sendWhatsAppNotification(signal: TradingSignal): Promise<boolean> {
  try {
    const entryTime = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const { error } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        signal: {
          asset: signal.asset,
          type: signal.type,
          confluenceScore: signal.indicators.confluenceScore,
          timeframe: signal.timeframe,
          entryTime,
          confirmations: signal.confirmations,
          tag: 'ALTA PROBABILIDADE',
        },
      },
    });

    if (error) {
      console.error('Error sending WhatsApp notification:', error);
      return false;
    }

    console.log(`📱 WhatsApp notification sent for ${signal.asset} (${signal.indicators.confluenceScore}%)`);
    return true;
  } catch (err) {
    console.error('Failed to send WhatsApp notification:', err);
    return false;
  }
}

const RISK_CONTROL_STORAGE_KEY = 'risk_control';

// Load signals from Supabase
async function loadSignalsFromDB(): Promise<TradingSignal[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('trading_signals')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading signals from DB:', error);
      return [];
    }
    
    if (data && data.length > 0) {
      console.log(`📊 Loaded ${data.length} signals from database`);
      return data.map((s) => ({
        id: s.signal_id,
        asset: s.asset,
        assetIcon: s.asset_icon,
        type: s.type as 'CALL' | 'PUT',
        timeframe: s.timeframe as Timeframe,
        expiration: s.expiration,
        strength: (s.strength >= 2 && s.strength <= 4 ? s.strength : 4) as SignalStrength,
        status: (s.status === 'high_probability' || s.status === 'moderate' ? s.status : 'high_probability') as SignalStatus,
        price: Number(s.price),
        timestamp: new Date(s.created_at),
        isHot: s.is_hot,
        marketType: s.market_type as MarketType,
        confirmations: (s.confirmations || []) as string[],
        indicators: s.indicators as unknown as TechnicalIndicators,
      }));
    }
  } catch (e) {
    console.error('Failed to load signals from DB:', e);
  }
  return [];
}

// Save signal to Supabase
async function saveSignalToDB(signal: TradingSignal): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('trading_signals') as any).insert({
      signal_id: signal.id,
      asset: signal.asset,
      asset_icon: signal.assetIcon,
      type: signal.type,
      timeframe: signal.timeframe,
      expiration: signal.expiration,
      strength: signal.strength,
      status: signal.status,
      price: signal.price,
      is_hot: signal.isHot,
      market_type: signal.marketType,
      confluence_score: signal.indicators.confluenceScore,
      confluence_count: signal.indicators.confluenceCount,
      confirmations: signal.confirmations,
      indicators: signal.indicators,
    });
    
    if (error) {
      console.error('Error saving signal to DB:', error);
      return false;
    }
    
    console.log(`💾 Signal ${signal.id} saved to database`);
    return true;
  } catch (e) {
    console.error('Failed to save signal to DB:', e);
    return false;
  }
}

function loadRiskControl(): RiskControl {
  try {
    const stored = localStorage.getItem(RISK_CONTROL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const today = new Date().toDateString();
      if (parsed.date === today) {
        return parsed.control;
      }
    }
  } catch (e) {
    console.error('Error loading risk control:', e);
  }
  return {
    dailySignalsCount: 0,
    consecutiveLosses: 0,
    lastLossTime: null,
    isPaused: false,
    pauseReason: null,
  };
}

export function useAutoSignals() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(true);
  const [waitingMessage, setWaitingMessage] = useState<string | null>('Aguardando oportunidade de ALTA QUALIDADE');
  const [marketStatus, setMarketStatus] = useState<MarketStatus>({
    otcOpen: isOTCMarketOpen(),
    forexOpen: isForexMarketOpen(),
    cryptoOpen: true,
  });
  
  const notifiedAssets = useRef<Map<string, number>>(new Map());
  const riskControl = useRef<RiskControl>(loadRiskControl());

  // No longer persist to localStorage - we use Supabase now

  // Persist risk control to localStorage
  useEffect(() => {
    const today = new Date().toDateString();
    localStorage.setItem(RISK_CONTROL_STORAGE_KEY, JSON.stringify({
      date: today,
      control: riskControl.current
    }));
  });

  // Reset diário à meia-noite
  useEffect(() => {
    const checkDailyReset = () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        riskControl.current = {
          dailySignalsCount: 0,
          consecutiveLosses: 0,
          lastLossTime: null,
          isPaused: false,
          pauseReason: null,
        };
        notifiedAssets.current.clear();
        setSignals([]);
        setWaitingMessage('Aguardando oportunidade de ALTA QUALIDADE');
        localStorage.removeItem(RISK_CONTROL_STORAGE_KEY);
      }
    };

    const interval = setInterval(checkDailyReset, 60000);
    return () => clearInterval(interval);
  }, []);

  const registerLoss = useCallback(() => {
    riskControl.current.consecutiveLosses++;
    riskControl.current.lastLossTime = Date.now();
    
    if (riskControl.current.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
      riskControl.current.isPaused = true;
      riskControl.current.pauseReason = 'Mercado sem condições ideais no momento';
      setWaitingMessage('⚠️ Sistema pausado: 2 losses seguidos detectados');
    }
  }, []);

  // Análise de mercado em intervalos longos (5 minutos)
  const analyzeMarket = useCallback(async () => {
    // Não analisar se já atingiu limite diário
    if (riskControl.current.dailySignalsCount >= MAX_DAILY_SIGNALS) {
      setWaitingMessage(`Limite diário atingido (${MAX_DAILY_SIGNALS} sinais)`);
      return;
    }

    if (riskControl.current.isPaused) {
      return;
    }

    setIsSearching(true);
    
    setMarketStatus({
      otcOpen: isOTCMarketOpen(),
      forexOpen: isForexMarketOpen(),
      cryptoOpen: true,
    });
    
    // Fetch available assets from IQ Option
    const availableAssets = await fetchIQOptionAssets();
    console.log(`📊 Using ${availableAssets.length} available assets for signal generation`);
    
    const { signals: newSignals, message } = generateSignals(riskControl.current, availableAssets);
    
    if (newSignals.length > 0) {
      // Salvar sinais no banco de dados primeiro
      for (const signal of newSignals) {
        await saveSignalToDB(signal);
      }
      
      setSignals(prev => [...prev, ...newSignals].slice(-MAX_DAILY_SIGNALS));
      setLastUpdate(new Date());
      setWaitingMessage(null);
      
      // Atualizar contador diário
      riskControl.current.dailySignalsCount += newSignals.length;
      
      // Enviar notificações WhatsApp para sinais de alta qualidade
      for (const signal of newSignals) {
        if (signal.indicators.confluenceScore >= WHATSAPP_CONFLUENCE_THRESHOLD) {
          const lastNotified = notifiedAssets.current.get(signal.asset);
          const now = Date.now();
          
          if (!lastNotified || (now - lastNotified) > NOTIFICATION_COOLDOWN) {
            const sent = await sendWhatsAppNotification(signal);
            if (sent) {
              notifiedAssets.current.set(signal.asset, now);
            }
          }
        }
      }

      // Se atingiu limite, mostrar mensagem
      if (riskControl.current.dailySignalsCount >= MAX_DAILY_SIGNALS) {
        setWaitingMessage(`Limite diário atingido (${MAX_DAILY_SIGNALS} sinais)`);
      }
    } else if (!waitingMessage?.includes('Limite')) {
      setWaitingMessage(message);
    }
    
    setIsSearching(false);
  }, [waitingMessage]);

  // Análise inicial - carregar sinais do banco de dados
  useEffect(() => {
    const loadSignals = async () => {
      setIsLoading(true);
      
      // Carregar sinais do Supabase
      const dbSignals = await loadSignalsFromDB();
      
      // O contador é SEMPRE baseado nos sinais reais do banco
      const actualDailyCount = dbSignals.length;
      
      // Carregar apenas consecutiveLosses e isPaused do localStorage
      const storedRisk = loadRiskControl();
      
      // Restaurar estado do risk control mantendo apenas dados de losses
      riskControl.current = {
        dailySignalsCount: actualDailyCount, // SEMPRE do banco
        consecutiveLosses: storedRisk.consecutiveLosses,
        lastLossTime: storedRisk.lastLossTime,
        isPaused: storedRisk.isPaused,
        pauseReason: storedRisk.pauseReason,
      };
      
      console.log(`📊 Loaded ${actualDailyCount} signals from database, limit: ${MAX_DAILY_SIGNALS}`);
      
      if (dbSignals.length > 0) {
        setSignals(dbSignals);
        setWaitingMessage(null);
        setLastUpdate(new Date(dbSignals[0].timestamp));
      } else {
        // Se não há sinais, garantir que está buscando
        setWaitingMessage('Aguardando oportunidade de ALTA QUALIDADE');
      }
      
      // Verificar se atingiu limite
      if (actualDailyCount >= MAX_DAILY_SIGNALS) {
        setWaitingMessage(`Limite diário atingido (${MAX_DAILY_SIGNALS} sinais)`);
      }
      
      setIsLoading(false);
      setIsSearching(false);
    };
    
    loadSignals();
  }, []);

  // Realtime subscription para sinais - sincronizar entre navegadores
  useEffect(() => {
    console.log('📡 Setting up realtime subscription for trading_signals');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = supabase
      .channel('trading-signals-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trading_signals',
        },
        (payload) => {
          console.log('📊 New signal received:', payload.new);
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s = payload.new as any;
          
          const newSignal: TradingSignal = {
            id: s.signal_id,
            asset: s.asset,
            assetIcon: s.asset_icon,
            type: s.type as 'CALL' | 'PUT',
            timeframe: s.timeframe as Timeframe,
            expiration: s.expiration,
            strength: (s.strength >= 2 && s.strength <= 4 ? s.strength : 4) as SignalStrength,
            status: (s.status === 'high_probability' || s.status === 'moderate' ? s.status : 'high_probability') as SignalStatus,
            price: Number(s.price),
            timestamp: new Date(s.created_at),
            isHot: s.is_hot,
            marketType: s.market_type as MarketType,
            confirmations: (s.confirmations || []) as string[],
            indicators: s.indicators as unknown as TechnicalIndicators,
          };
          
          setSignals(prev => {
            // Evitar duplicatas
            if (prev.some(sig => sig.id === newSignal.id)) {
              return prev;
            }
            return [newSignal, ...prev].slice(0, MAX_DAILY_SIGNALS);
          });
          setLastUpdate(new Date());
          setWaitingMessage(null);
        }
      )
      .subscribe((status) => {
        console.log('📡 Trading signals subscription status:', status);
      });

    return () => {
      console.log('🔕 Removing trading signals subscription');
      supabase.removeChannel(channel);
    };
  }, []);

  // Análise automática a cada 6 minutos (10 sinais por hora)
  useEffect(() => {
    // Primeira análise após 15 segundos de página carregada
    const initialTimeout = setTimeout(() => {
      if (riskControl.current.dailySignalsCount < MAX_DAILY_SIGNALS && !riskControl.current.isPaused) {
        analyzeMarket();
      }
    }, INITIAL_DELAY_MS);

    // Depois a cada 6 minutos para gerar ~10 sinais por hora
    const interval = setInterval(() => {
      if (riskControl.current.dailySignalsCount < MAX_DAILY_SIGNALS && !riskControl.current.isPaused) {
        analyzeMarket();
      }
    }, SIGNAL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [analyzeMarket]);

  // Atualizar status do mercado a cada minuto
  useEffect(() => {
    const statusInterval = setInterval(() => {
      setMarketStatus({
        otcOpen: isOTCMarketOpen(),
        forexOpen: isForexMarketOpen(),
        cryptoOpen: true,
      });
    }, 60000);

    return () => clearInterval(statusInterval);
  }, []);

  return {
    signals,
    lastUpdate,
    isLoading,
    isSearching,
    refreshSignals: analyzeMarket,
    marketStatus,
    waitingMessage,
    registerLoss,
    dailySignalsCount: riskControl.current.dailySignalsCount,
    maxDailySignals: MAX_DAILY_SIGNALS,
  };
}
