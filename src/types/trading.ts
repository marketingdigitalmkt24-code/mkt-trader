export type SignalType = 'CALL' | 'PUT';
export type Timeframe = 'M1' | 'M5';
export type SignalStrength = 2 | 3 | 4;
export type SignalStatus = 'high_probability' | 'moderate';
export type MarketType = 'forex' | 'crypto' | 'otc';

export interface TradingAsset {
  symbol: string;
  icon: string;
  type: MarketType;
  isOTC?: boolean;
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
