import { useState, useEffect, useCallback } from 'react';
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

function generateRSI(type: 'CALL' | 'PUT', forceStrong: boolean): RSIIndicator {
  let value: number;
  if (forceStrong) {
    value = type === 'CALL' ? 15 + Math.random() * 15 : 70 + Math.random() * 15;
  } else {
    value = 30 + Math.random() * 40;
  }
  
  return {
    value,
    signal: value < 30 ? 'oversold' : value > 70 ? 'overbought' : 'neutral'
  };
}

function generateMACD(type: 'CALL' | 'PUT', forceStrong: boolean): MACDIndicator {
  const isBullish = type === 'CALL';
  const histogram = forceStrong 
    ? (isBullish ? 0.001 + Math.random() * 0.003 : -(0.001 + Math.random() * 0.003))
    : (Math.random() - 0.5) * 0.004;

  return {
    value: histogram * 2,
    signal: histogram * 1.5,
    histogram,
    trend: histogram > 0.0005 ? 'bullish' : histogram < -0.0005 ? 'bearish' : 'neutral'
  };
}

function generateBollinger(price: number, type: 'CALL' | 'PUT', forceStrong: boolean): BollingerBands {
  const range = price * 0.02;
  const middle = price;
  const upper = middle + range;
  const lower = middle - range;
  
  let position: 'above_upper' | 'below_lower' | 'middle';
  if (forceStrong) {
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
      k = 10 + Math.random() * 15;
      d = k + Math.random() * 5;
    } else {
      k = 75 + Math.random() * 15;
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

function generateMovingAverages(price: number, type: 'CALL' | 'PUT', forceStrong: boolean): MovingAverages {
  const variation = price * 0.005;
  const ema9 = price + (Math.random() - 0.5) * variation;
  const ema21 = price + (Math.random() - 0.5) * variation * 2;
  const sma50 = price + (Math.random() - 0.5) * variation * 3;
  
  let trend: 'bullish' | 'bearish' | 'neutral';
  if (forceStrong) {
    trend = type === 'CALL' ? 'bullish' : 'bearish';
  } else {
    trend = ema9 > ema21 ? 'bullish' : ema9 < ema21 ? 'bearish' : 'neutral';
  }

  return { ema9, ema21, sma50, trend };
}

function generateATR(price: number): ATRIndicator {
  const atrPercent = Math.random() * 3;
  const value = price * atrPercent / 100;
  
  return {
    value,
    volatility: atrPercent < 1 ? 'low' : atrPercent < 2 ? 'medium' : 'high'
  };
}

function generateSupportResistance(price: number, type: 'CALL' | 'PUT', forceStrong: boolean): SupportResistance {
  const range = price * 0.01;
  const nearestSupport = price - range - Math.random() * range;
  const nearestResistance = price + range + Math.random() * range;
  
  let pricePosition: 'near_support' | 'near_resistance' | 'middle';
  if (forceStrong) {
    pricePosition = type === 'CALL' ? 'near_support' : 'near_resistance';
  } else {
    pricePosition = 'middle';
  }

  return { nearestSupport, nearestResistance, pricePosition };
}

function generateIndicators(price: number, type: 'CALL' | 'PUT', forceStrong: boolean): TechnicalIndicators {
  const rsi = generateRSI(type, forceStrong);
  const macd = generateMACD(type, forceStrong);
  const bollinger = generateBollinger(price, type, forceStrong);
  const stochastic = generateStochastic(type, forceStrong);
  const movingAverages = generateMovingAverages(price, type, forceStrong);
  const atr = generateATR(price);
  const supportResistance = generateSupportResistance(price, type, forceStrong);

  // Calculate confluence
  let confluenceCount = 0;
  const isCall = type === 'CALL';

  // RSI confluence
  if ((isCall && rsi.signal === 'oversold') || (!isCall && rsi.signal === 'overbought')) {
    confluenceCount++;
  }

  // MACD confluence
  if ((isCall && macd.trend === 'bullish') || (!isCall && macd.trend === 'bearish')) {
    confluenceCount++;
  }

  // Bollinger confluence
  if ((isCall && bollinger.position === 'below_lower') || (!isCall && bollinger.position === 'above_upper')) {
    confluenceCount++;
  }

  // Stochastic confluence
  if ((isCall && stochastic.signal === 'oversold') || (!isCall && stochastic.signal === 'overbought')) {
    confluenceCount++;
  }

  // Moving Averages confluence
  if ((isCall && movingAverages.trend === 'bullish') || (!isCall && movingAverages.trend === 'bearish')) {
    confluenceCount++;
  }

  // Volatility confluence (medium is ideal)
  if (atr.volatility === 'medium') {
    confluenceCount++;
  }

  // Support/Resistance confluence
  if ((isCall && supportResistance.pricePosition === 'near_support') || 
      (!isCall && supportResistance.pricePosition === 'near_resistance')) {
    confluenceCount++;
  }

  const confluenceScore = Math.round((confluenceCount / 7) * 100);

  return {
    rsi,
    macd,
    bollinger,
    stochastic,
    movingAverages,
    atr,
    supportResistance,
    confluenceScore,
    confluenceCount
  };
}

function generateConfirmations(indicators: TechnicalIndicators, type: 'CALL' | 'PUT'): string[] {
  const confirmations: string[] = [];
  const isCall = type === 'CALL';

  // RSI
  if (indicators.rsi.signal !== 'neutral') {
    confirmations.push(`RSI ${indicators.rsi.value.toFixed(1)} (${isCall ? 'sobrevendido' : 'sobrecomprado'})`);
  }

  // Stochastic
  if (indicators.stochastic.signal !== 'neutral') {
    confirmations.push(`Stoch ${indicators.stochastic.k.toFixed(0)}/${indicators.stochastic.d.toFixed(0)}`);
  }

  // MACD
  if (indicators.macd.trend !== 'neutral') {
    confirmations.push(`MACD ${indicators.macd.trend === 'bullish' ? 'bullish' : 'bearish'}`);
  }

  // Bollinger
  if (indicators.bollinger.position !== 'middle') {
    confirmations.push(`Bollinger ${isCall ? 'inferior' : 'superior'}`);
  }

  // EMAs
  if (indicators.movingAverages.trend !== 'neutral') {
    confirmations.push(`EMA9 ${indicators.movingAverages.trend === 'bullish' ? '>' : '<'} EMA21`);
  }

  // Support/Resistance
  if (indicators.supportResistance.pricePosition !== 'middle') {
    confirmations.push(isCall ? 'Próximo ao suporte' : 'Próximo à resistência');
  }

  return confirmations;
}

function generateSignal(asset: TradingAsset, forceHighProbability: boolean = false): TradingSignal {
  const type: 'CALL' | 'PUT' = Math.random() > 0.5 ? 'CALL' : 'PUT';
  const timeframe: Timeframe = Math.random() > 0.5 ? 'M1' : 'M5';
  const price = generateRandomPrice(asset.symbol);
  
  const indicators = generateIndicators(price, type, forceHighProbability);
  const confirmations = generateConfirmations(indicators, type);
  
  const strength = Math.min(4, Math.max(2, Math.round(indicators.confluenceScore / 25))) as 2 | 3 | 4;
  const isHighProb = forceHighProbability || indicators.confluenceScore >= 70;

  return {
    id: crypto.randomUUID(),
    type,
    asset: asset.symbol,
    assetIcon: asset.icon,
    timeframe,
    expiration: timeframe === 'M1' ? `${1 + Math.floor(Math.random() * 2)} min` : '5 min',
    strength,
    status: isHighProb ? 'high_probability' : 'moderate',
    confirmations,
    price,
    timestamp: new Date(),
    isHot: isHighProb,
    marketType: asset.type,
    indicators,
  };
}

function generateSignals(): TradingSignal[] {
  const availableAssets = getAvailableAssets();
  
  if (availableAssets.length === 0) {
    return [];
  }

  const hotCount = 1 + Math.floor(Math.random() * 2);
  const signals: TradingSignal[] = [];
  const usedAssets = new Set<string>();

  const shuffledAssets = [...availableAssets].sort(() => Math.random() - 0.5);

  // Generate high probability HOT signals with strong indicator confluence
  for (let i = 0; i < hotCount && i < shuffledAssets.length; i++) {
    const asset = shuffledAssets[i];
    signals.push(generateSignal(asset, true));
    usedAssets.add(asset.symbol);
  }

  // Add moderate signals
  const moderateCount = 2 + Math.floor(Math.random() * 2);
  for (let i = hotCount; i < hotCount + moderateCount && i < shuffledAssets.length; i++) {
    const asset = shuffledAssets[i];
    if (!usedAssets.has(asset.symbol)) {
      signals.push(generateSignal(asset, false));
      usedAssets.add(asset.symbol);
    }
  }

  return signals.sort((a, b) => {
    if (a.isHot !== b.isHot) return b.isHot ? 1 : -1;
    return b.indicators.confluenceScore - a.indicators.confluenceScore;
  });
}

export interface MarketStatus {
  otcOpen: boolean;
  forexOpen: boolean;
  cryptoOpen: boolean;
}

export function useAutoSignals(refreshInterval: number = 30000) {
  const [signals, setSignals] = useState<TradingSignal[]>(() => generateSignals());
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [nextUpdate, setNextUpdate] = useState<number>(refreshInterval / 1000);
  const [isLoading, setIsLoading] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>({
    otcOpen: isOTCMarketOpen(),
    forexOpen: isForexMarketOpen(),
    cryptoOpen: true,
  });

  const refreshSignals = useCallback(() => {
    setIsLoading(true);
    
    setMarketStatus({
      otcOpen: isOTCMarketOpen(),
      forexOpen: isForexMarketOpen(),
      cryptoOpen: true,
    });
    
    setTimeout(() => {
      setSignals(generateSignals());
      setLastUpdate(new Date());
      setNextUpdate(refreshInterval / 1000);
      setIsLoading(false);
    }, 500);
  }, [refreshInterval]);

  useEffect(() => {
    const countdown = setInterval(() => {
      setNextUpdate((prev) => {
        if (prev <= 1) {
          return refreshInterval / 1000;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [refreshInterval]);

  useEffect(() => {
    const interval = setInterval(refreshSignals, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshSignals, refreshInterval]);

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
    nextUpdate,
    isLoading,
    refreshSignals,
    marketStatus,
  };
}
