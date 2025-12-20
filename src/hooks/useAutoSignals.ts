import { useState, useEffect, useCallback } from 'react';
import { TradingSignal, Timeframe, MarketType, TradingAsset } from '@/types/trading';
import { getAvailableAssets, isOTCMarketOpen, isForexMarketOpen } from '@/utils/marketHours';

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
  // Base prices for different pairs
  if (symbol.includes('JPY')) {
    return 150 + (Math.random() - 0.5) * 5;
  }
  if (symbol.includes('BTC')) {
    return 67000 + (Math.random() - 0.5) * 2000;
  }
  if (symbol.includes('ETH')) {
    return 3500 + (Math.random() - 0.5) * 200;
  }
  // Most forex pairs
  return 1.0 + Math.random() * 0.5;
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

function generateSignal(asset: TradingAsset, forceHighProbability: boolean = false): TradingSignal {
  const type: 'CALL' | 'PUT' = Math.random() > 0.5 ? 'CALL' : 'PUT';
  const timeframe: Timeframe = Math.random() > 0.5 ? 'M1' : 'M5';
  
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
    marketType: asset.type,
  };
}

function generateSignals(): TradingSignal[] {
  const availableAssets = getAvailableAssets();
  
  if (availableAssets.length === 0) {
    return [];
  }

  const hotCount = 1 + Math.floor(Math.random() * 2); // 1-2 hot signals
  const signals: TradingSignal[] = [];
  const usedAssets = new Set<string>();

  // Shuffle available assets to get random selection
  const shuffledAssets = [...availableAssets].sort(() => Math.random() - 0.5);

  // Generate high probability HOT signals
  for (let i = 0; i < hotCount && i < shuffledAssets.length; i++) {
    const asset = shuffledAssets[i];
    signals.push(generateSignal(asset, true));
    usedAssets.add(asset.symbol);
  }

  // Add moderate signals from remaining assets
  const moderateCount = 2 + Math.floor(Math.random() * 2);
  for (let i = hotCount; i < hotCount + moderateCount && i < shuffledAssets.length; i++) {
    const asset = shuffledAssets[i];
    if (!usedAssets.has(asset.symbol)) {
      signals.push(generateSignal(asset, false));
      usedAssets.add(asset.symbol);
    }
  }

  // Sort: HOT first, then by strength
  return signals.sort((a, b) => {
    if (a.isHot !== b.isHot) return b.isHot ? 1 : -1;
    return b.strength - a.strength;
  });
}

export interface MarketStatus {
  otcOpen: boolean;
  forexOpen: boolean;
  cryptoOpen: boolean; // Always true
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
    
    // Update market status
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

  // Update market status every minute
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
