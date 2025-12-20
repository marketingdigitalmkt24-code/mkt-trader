import { useState, useEffect, useCallback } from 'react';
import { TradingSignal, Timeframe } from '@/types/trading';

const ASSETS = [
  { symbol: 'EUR/USD', icon: '🇪🇺' },
  { symbol: 'GBP/USD', icon: '🇬🇧' },
  { symbol: 'USD/JPY', icon: '🇺🇸' },
  { symbol: 'GBP/JPY', icon: '🇬🇧' },
  { symbol: 'EUR/JPY', icon: '🇪🇺' },
  { symbol: 'AUD/USD', icon: '🇦🇺' },
  { symbol: 'BTC/USD', icon: '₿' },
  { symbol: 'ETH/USD', icon: 'Ξ' },
];

const CONFIRMATIONS_CALL = [
  'RSI < 30',
  'Suporte tocado',
  'Banda inferior tocada',
  'Martelo confirmado',
  'Engolfo de alta',
  'Pin bar bullish',
  'EMA 9 cruzando EMA 21',
  'Divergência bullish',
];

const CONFIRMATIONS_PUT = [
  'RSI > 70',
  'Resistência tocada',
  'Banda superior tocada',
  'Estrela cadente',
  'Engolfo de baixa',
  'Pin bar bearish',
  'EMA 9 abaixo EMA 21',
  'Divergência bearish',
];

function generateRandomPrice(symbol: string): number {
  const basePrices: Record<string, number> = {
    'EUR/USD': 1.0850 + (Math.random() - 0.5) * 0.01,
    'GBP/USD': 1.2650 + (Math.random() - 0.5) * 0.01,
    'USD/JPY': 154.50 + (Math.random() - 0.5) * 1,
    'GBP/JPY': 195.20 + (Math.random() - 0.5) * 1,
    'EUR/JPY': 167.80 + (Math.random() - 0.5) * 1,
    'AUD/USD': 0.6520 + (Math.random() - 0.5) * 0.005,
    'BTC/USD': 67000 + (Math.random() - 0.5) * 2000,
    'ETH/USD': 3500 + (Math.random() - 0.5) * 200,
  };
  return basePrices[symbol] || 1.0;
}

function generateRSIValue(type: 'CALL' | 'PUT'): string {
  if (type === 'CALL') {
    const value = 20 + Math.random() * 12;
    return `RSI < 30 (${value.toFixed(1)})`;
  } else {
    const value = 70 + Math.random() * 12;
    return `RSI > 70 (${value.toFixed(1)})`;
  }
}

function generateSignal(forceHighProbability: boolean = false): TradingSignal {
  const asset = ASSETS[Math.floor(Math.random() * ASSETS.length)];
  const type: 'CALL' | 'PUT' = Math.random() > 0.5 ? 'CALL' : 'PUT';
  const timeframe: Timeframe = Math.random() > 0.5 ? 'M1' : 'M5';
  
  // For high probability signals, always 4 confirmations
  const numConfirmations = forceHighProbability ? 4 : (2 + Math.floor(Math.random() * 2));
  const strength = Math.min(4, numConfirmations) as 2 | 3 | 4;
  
  const confirmationPool = type === 'CALL' ? CONFIRMATIONS_CALL : CONFIRMATIONS_PUT;
  const confirmations = [generateRSIValue(type)];
  
  const shuffled = [...confirmationPool].sort(() => Math.random() - 0.5);
  for (let i = 0; i < numConfirmations - 1 && i < shuffled.length; i++) {
    if (!shuffled[i].includes('RSI')) {
      confirmations.push(shuffled[i]);
    }
  }

  const isHighProb = forceHighProbability || strength >= 4;

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
    price: generateRandomPrice(asset.symbol),
    timestamp: new Date(),
    isHot: isHighProb,
  };
}

function generateSignals(): TradingSignal[] {
  // Generate only 1-2 high probability HOT signals
  const hotCount = 1 + Math.floor(Math.random() * 2); // 1 or 2
  const signals: TradingSignal[] = [];
  const usedAssets = new Set<string>();

  // First, generate high probability HOT signals (1-2 only)
  for (let i = 0; i < hotCount; i++) {
    let signal = generateSignal(true); // Force high probability
    let attempts = 0;
    
    while (usedAssets.has(signal.asset) && attempts < 10) {
      signal = generateSignal(true);
      attempts++;
    }
    
    usedAssets.add(signal.asset);
    signals.push(signal);
  }

  // Then add a few moderate signals (optional, for "outros sinais" section)
  const moderateCount = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < moderateCount; i++) {
    let signal = generateSignal(false);
    let attempts = 0;
    
    while (usedAssets.has(signal.asset) && attempts < 10) {
      signal = generateSignal(false);
      attempts++;
    }
    
    if (!usedAssets.has(signal.asset)) {
      usedAssets.add(signal.asset);
      signals.push(signal);
    }
  }

  // Sort: HOT first, then by strength
  return signals.sort((a, b) => {
    if (a.isHot !== b.isHot) return b.isHot ? 1 : -1;
    return b.strength - a.strength;
  });
}

export function useAutoSignals(refreshInterval: number = 30000) {
  const [signals, setSignals] = useState<TradingSignal[]>(() => generateSignals());
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [nextUpdate, setNextUpdate] = useState<number>(refreshInterval / 1000);
  const [isLoading, setIsLoading] = useState(false);

  const refreshSignals = useCallback(() => {
    setIsLoading(true);
    
    // Simulate network delay
    setTimeout(() => {
      setSignals(generateSignals());
      setLastUpdate(new Date());
      setNextUpdate(refreshInterval / 1000);
      setIsLoading(false);
    }, 500);
  }, [refreshInterval]);

  // Countdown timer
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

  // Auto refresh
  useEffect(() => {
    const interval = setInterval(refreshSignals, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshSignals, refreshInterval]);

  return {
    signals,
    lastUpdate,
    nextUpdate,
    isLoading,
    refreshSignals,
  };
}
