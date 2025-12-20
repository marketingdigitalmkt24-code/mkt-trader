import { TradingSignal, AssetPerformance, BankManagement, SafetyFilter, TechnicalIndicators } from '@/types/trading';

const createMockIndicators = (type: 'CALL' | 'PUT', confluenceScore: number): TechnicalIndicators => ({
  rsi: {
    value: type === 'CALL' ? 25 : 75,
    signal: type === 'CALL' ? 'oversold' : 'overbought'
  },
  macd: {
    value: type === 'CALL' ? 0.002 : -0.002,
    signal: type === 'CALL' ? 0.001 : -0.001,
    histogram: type === 'CALL' ? 0.001 : -0.001,
    trend: type === 'CALL' ? 'bullish' : 'bearish'
  },
  bollinger: {
    upper: 1.1,
    middle: 1.0,
    lower: 0.9,
    position: type === 'CALL' ? 'below_lower' : 'above_upper'
  },
  stochastic: {
    k: type === 'CALL' ? 15 : 85,
    d: type === 'CALL' ? 20 : 80,
    signal: type === 'CALL' ? 'oversold' : 'overbought'
  },
  movingAverages: {
    ema9: 1.0,
    ema21: type === 'CALL' ? 0.99 : 1.01,
    sma50: 1.0,
    trend: type === 'CALL' ? 'bullish' : 'bearish'
  },
  atr: {
    value: 0.015,
    volatility: 'medium'
  },
  supportResistance: {
    nearestSupport: 0.98,
    nearestResistance: 1.02,
    pricePosition: type === 'CALL' ? 'near_support' : 'near_resistance'
  },
  confluenceScore,
  confluenceCount: Math.round(confluenceScore / 15)
});

export const mockSignals: TradingSignal[] = [
  {
    id: '1',
    type: 'CALL',
    asset: 'EUR/USD',
    assetIcon: '🇪🇺',
    timeframe: 'M5',
    expiration: '5 min',
    strength: 4,
    status: 'high_probability',
    confirmations: ['RSI < 30 (28.5)', 'Suporte tocado', 'Martelo confirmado', 'EMA 9 > EMA 21'],
    price: 1.0876,
    timestamp: new Date(),
    isHot: true,
    marketType: 'forex',
    indicators: createMockIndicators('CALL', 85),
  },
  {
    id: '2',
    type: 'PUT',
    asset: 'BTC/USD',
    assetIcon: '₿',
    timeframe: 'M1',
    expiration: '2 min',
    strength: 3,
    status: 'high_probability',
    confirmations: ['RSI > 70 (74.2)', 'Banda superior tocada', 'Estrela cadente'],
    price: 67432.50,
    timestamp: new Date(Date.now() - 60000),
    isHot: true,
    marketType: 'crypto',
    indicators: createMockIndicators('PUT', 75),
  },
  {
    id: '3',
    type: 'CALL',
    asset: 'GBP/JPY',
    assetIcon: '🇬🇧',
    timeframe: 'M5',
    expiration: '5 min',
    strength: 3,
    status: 'moderate',
    confirmations: ['RSI < 35 (33.1)', 'Suporte dinâmico', 'Pin bar'],
    price: 192.45,
    timestamp: new Date(Date.now() - 120000),
    isHot: false,
    marketType: 'forex',
    indicators: createMockIndicators('CALL', 60),
  },
  {
    id: '4',
    type: 'PUT',
    asset: 'ETH/USD',
    assetIcon: 'Ξ',
    timeframe: 'M1',
    expiration: '1 min',
    strength: 4,
    status: 'high_probability',
    confirmations: ['RSI > 70 (78.3)', 'Resistência forte', 'Engolfo de baixa', 'Volume alto'],
    price: 3521.80,
    timestamp: new Date(Date.now() - 180000),
    isHot: true,
    marketType: 'crypto',
    indicators: createMockIndicators('PUT', 90),
  },
  {
    id: '5',
    type: 'CALL',
    asset: 'USD/JPY',
    assetIcon: '🇺🇸',
    timeframe: 'M5',
    expiration: '5 min',
    strength: 2,
    status: 'moderate',
    confirmations: ['RSI < 35', 'Suporte próximo'],
    price: 154.32,
    timestamp: new Date(Date.now() - 300000),
    isHot: false,
    marketType: 'forex',
    indicators: createMockIndicators('CALL', 45),
  },
];

export const mockAssetPerformance: AssetPerformance[] = [
  { asset: 'EUR/USD', icon: '🇪🇺', winRate: 78, totalSignals: 45, profit: 1250, trend: 'up' },
  { asset: 'BTC/USD', icon: '₿', winRate: 72, totalSignals: 38, profit: 980, trend: 'up' },
  { asset: 'GBP/JPY', icon: '🇬🇧', winRate: 68, totalSignals: 32, profit: 640, trend: 'neutral' },
  { asset: 'ETH/USD', icon: 'Ξ', winRate: 65, totalSignals: 28, profit: 520, trend: 'down' },
  { asset: 'USD/JPY', icon: '🇺🇸', winRate: 62, totalSignals: 25, profit: 380, trend: 'neutral' },
];

export const mockBankManagement: BankManagement = {
  balance: 5000,
  riskPerTrade: 2,
  consecutiveLosses: 0,
  dailyProfit: 245.50,
  todayTrades: 8,
  maxDailyTrades: 15,
};

export const safetyFilters: SafetyFilter[] = [
  {
    id: '1',
    name: 'Mercado Lateral',
    description: 'Bloqueia sinais em mercados sem direção clara',
    isActive: true,
    icon: '📊',
  },
  {
    id: '2',
    name: 'Alta Volatilidade',
    description: 'Evita entradas durante notícias importantes',
    isActive: true,
    icon: '📰',
  },
  {
    id: '3',
    name: 'Spikes Detectados',
    description: 'Filtra candles com movimento excessivo',
    isActive: true,
    icon: '⚡',
  },
  {
    id: '4',
    name: 'Anti-Loss Consecutivo',
    description: 'Bloqueia ativo após 2 perdas seguidas',
    isActive: true,
    icon: '🛡️',
  },
];
