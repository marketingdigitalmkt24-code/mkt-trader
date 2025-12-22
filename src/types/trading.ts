export type SignalType = 'CALL' | 'PUT';
export type Timeframe = 'M1' | 'M5';
export type SignalStrength = 2 | 3 | 4;
export type SignalStatus = 'high_probability' | 'moderate';
export type MarketType = 'forex' | 'crypto' | 'otc' | 'blitz';
export type SignalResult = 'win' | 'loss' | 'pending' | 'tie';

export interface TradingAsset {
  symbol: string;
  icon: string;
  type: MarketType;
  isOTC?: boolean;
  isBlitz?: boolean;
  isBinary?: boolean;
  iqOptionId?: number;
  payout?: number;
}

// Technical Indicators
export interface RSIIndicator {
  value: number;
  signal: 'oversold' | 'overbought' | 'neutral';
}

export interface MACDIndicator {
  value: number;
  signal: number;
  histogram: number;
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  position: 'above_upper' | 'below_lower' | 'middle';
}

export interface StochasticIndicator {
  k: number;
  d: number;
  signal: 'oversold' | 'overbought' | 'neutral';
}

export interface MovingAverages {
  ema9: number;
  ema21: number;
  sma50: number;
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface ATRIndicator {
  value: number;
  volatility: 'low' | 'medium' | 'high';
}

export interface SupportResistance {
  nearestSupport: number;
  nearestResistance: number;
  pricePosition: 'near_support' | 'near_resistance' | 'middle';
}

export interface TechnicalIndicators {
  rsi: RSIIndicator;
  macd: MACDIndicator;
  bollinger: BollingerBands;
  stochastic: StochasticIndicator;
  movingAverages: MovingAverages;
  atr: ATRIndicator;
  supportResistance: SupportResistance;
  confluenceScore: number; // 0-100
  confluenceCount: number; // Number of indicators agreeing
}

export interface TradingSignal {
  id: string;
  type: SignalType;
  asset: string;
  assetIcon: string;
  timeframe: Timeframe;
  expiration: string;
  strength: SignalStrength;
  status: SignalStatus;
  confirmations: string[];
  price: number;
  timestamp: Date;
  isHot: boolean;
  marketType: MarketType;
  indicators: TechnicalIndicators;
  result?: SignalResult;
  resultPrice?: number;
  profit?: number;
  resultTime?: Date;
}

export interface SignalHistory {
  id: string;
  signal: TradingSignal;
  result: SignalResult;
  entryPrice: number;
  exitPrice?: number;
  profit: number;
  timestamp: Date;
  resultTimestamp?: Date;
}

export interface TradingStats {
  totalSignals: number;
  wins: number;
  losses: number;
  ties: number;
  pending: number;
  winRate: number;
  totalProfit: number;
  streak: number;
  streakType: 'win' | 'loss' | 'none';
}

export interface AssetPerformance {
  asset: string;
  icon: string;
  winRate: number;
  totalSignals: number;
  profit: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface BankManagement {
  balance: number;
  riskPerTrade: number;
  consecutiveLosses: number;
  dailyProfit: number;
  todayTrades: number;
  maxDailyTrades: number;
}

export interface SafetyFilter {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  icon: string;
}
