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
  SupportResistance
} from '@/types/trading';
import { getAvailableAssets, isOTCMarketOpen, isForexMarketOpen } from '@/utils/marketHours';
import { supabase } from '@/integrations/supabase/client';

// ============= CONFIGURAÇÕES EXTREMAS =============
const MIN_CONFIRMATIONS = 4; // Mínimo de 4 confirmações obrigatórias
const MAX_DAILY_SIGNALS = 6; // Máximo de sinais por dia
const RSI_CALL_MAX = 25; // RSI máximo para CALL (sobrevendido extremo)
const RSI_PUT_MIN = 75; // RSI mínimo para PUT (sobrecomprado extremo)
const WHATSAPP_CONFLUENCE_THRESHOLD = 90; // Threshold para notificação WhatsApp
const NOTIFICATION_COOLDOWN = 300000; // 5 minutos de cooldown
const MAX_CONSECUTIVE_LOSSES = 2; // Máximo de losses antes de pausar

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

// RSI extremo para CALL < 25, PUT > 75
function generateRSI(type: 'CALL' | 'PUT', forceExtreme: boolean): RSIIndicator {
  let value: number;
  if (forceExtreme) {
    // RSI extremamente sobrevendido para CALL, sobrecomprado para PUT
    value = type === 'CALL' 
      ? 15 + Math.random() * 10  // 15-25 para CALL
      : 75 + Math.random() * 10; // 75-85 para PUT
  } else {
    // Valores neutros (não vão gerar sinal)
    value = 35 + Math.random() * 30; // 35-65
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
      k = 5 + Math.random() * 15; // 5-20 extremamente sobrevendido
      d = k + Math.random() * 5;
    } else {
      k = 80 + Math.random() * 15; // 80-95 extremamente sobrecomprado
      d = k - Math.random() * 5;
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

// Volatilidade - evitar alta volatilidade
function generateATR(price: number): ATRIndicator {
  const atrPercent = 0.5 + Math.random() * 1.5; // Preferir volatilidade baixa-média
  const value = price * atrPercent / 100;
  
  return {
    value,
    volatility: atrPercent < 0.8 ? 'low' : atrPercent < 1.5 ? 'medium' : 'high'
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

// Detectar candle de reversão
function hasReversalCandle(type: 'CALL' | 'PUT'): { hasReversal: boolean; pattern: string } {
  const patterns = type === 'CALL' 
    ? ['Martelo', 'Engolfo de Alta', 'Doji de Alta', 'Pin Bar Bullish']
    : ['Estrela Cadente', 'Engolfo de Baixa', 'Doji de Baixa', 'Pin Bar Bearish'];
  
  // Simular detecção de padrão (30% de chance de detectar)
  const hasReversal = Math.random() < 0.3;
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

  // 5. Volatilidade adequada (não pode ser alta)
  const volatilityOk = atr.volatility !== 'high';
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

  // Volatilidade
  if (indicators.atr.volatility !== 'high') {
    confirmations.push(`Volatilidade ${indicators.atr.volatility}`);
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
  const timeframe: Timeframe = Math.random() > 0.6 ? 'M5' : 'M1'; // Preferir M5
  const price = generateRandomPrice(asset.symbol);
  
  // Tentar gerar indicadores extremos
  const forceExtreme = Math.random() > 0.6; // 40% de chance de indicadores extremos
  const indicators = generateIndicators(price, type, forceExtreme);
  
  // REGRA PRINCIPAL: Mínimo de 4 confirmações
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

function generateSignals(riskControl: RiskControl): { signals: TradingSignal[]; message: string | null } {
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

  const availableAssets = getAvailableAssets();
  
  if (availableAssets.length === 0) {
    return { signals: [], message: 'Nenhum mercado disponível' };
  }

  const signals: TradingSignal[] = [];
  const usedAssets = new Set<string>();
  const shuffledAssets = [...availableAssets].sort(() => Math.random() - 0.5);

  // Tentar gerar no máximo 2 sinais por ciclo
  const maxSignalsThisCycle = Math.min(2, MAX_DAILY_SIGNALS - riskControl.dailySignalsCount);

  for (let i = 0; i < shuffledAssets.length && signals.length < maxSignalsThisCycle; i++) {
    const asset = shuffledAssets[i];
    if (!usedAssets.has(asset.symbol)) {
      const signal = tryGenerateHighQualitySignal(asset);
      if (signal) {
        signals.push(signal);
        usedAssets.add(asset.symbol);
      }
    }
  }

  if (signals.length === 0) {
    return { 
      signals: [], 
      message: 'Aguardando oportunidade de ALTA QUALIDADE' 
    };
  }

  return { 
    signals: signals.sort((a, b) => b.indicators.confluenceScore - a.indicators.confluenceScore),
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

const SIGNALS_STORAGE_KEY = 'trading_signals';
const RISK_CONTROL_STORAGE_KEY = 'risk_control';

function loadStoredSignals(): TradingSignal[] {
  try {
    const stored = localStorage.getItem(SIGNALS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Check if it's from today
      const today = new Date().toDateString();
      if (parsed.date === today) {
        return parsed.signals.map((s: TradingSignal) => ({
          ...s,
          timestamp: new Date(s.timestamp)
        }));
      }
    }
  } catch (e) {
    console.error('Error loading stored signals:', e);
  }
  return [];
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
  const [signals, setSignals] = useState<TradingSignal[]>(() => loadStoredSignals());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(() => {
    const stored = loadStoredSignals();
    return stored.length > 0 ? new Date(stored[stored.length - 1].timestamp) : null;
  });
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

  // Persist signals to localStorage
  useEffect(() => {
    const today = new Date().toDateString();
    localStorage.setItem(SIGNALS_STORAGE_KEY, JSON.stringify({
      date: today,
      signals: signals
    }));
  }, [signals]);

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
        localStorage.removeItem(SIGNALS_STORAGE_KEY);
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
    
    const { signals: newSignals, message } = generateSignals(riskControl.current);
    
    if (newSignals.length > 0) {
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

  // Análise inicial
  useEffect(() => {
    setIsLoading(true);
    analyzeMarket().finally(() => setIsLoading(false));
  }, []);

  // Análise a cada 5 minutos (apenas se não atingiu limite)
  useEffect(() => {
    const interval = setInterval(() => {
      if (riskControl.current.dailySignalsCount < MAX_DAILY_SIGNALS && !riskControl.current.isPaused) {
        analyzeMarket();
      }
    }, 300000); // 5 minutos

    return () => clearInterval(interval);
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
