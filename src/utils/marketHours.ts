import { TradingAsset } from '@/types/trading';

// Regular Forex pairs (available Monday-Friday)
export const FOREX_ASSETS: TradingAsset[] = [
  { symbol: 'EUR/USD', icon: '🇪🇺', type: 'forex' },
  { symbol: 'GBP/USD', icon: '🇬🇧', type: 'forex' },
  { symbol: 'USD/JPY', icon: '🇺🇸', type: 'forex' },
  { symbol: 'GBP/JPY', icon: '🇬🇧', type: 'forex' },
  { symbol: 'EUR/JPY', icon: '🇪🇺', type: 'forex' },
  { symbol: 'AUD/USD', icon: '🇦🇺', type: 'forex' },
  { symbol: 'USD/CAD', icon: '🇺🇸', type: 'forex' },
  { symbol: 'EUR/GBP', icon: '🇪🇺', type: 'forex' },
];

// Crypto pairs (available 24/7)
export const CRYPTO_ASSETS: TradingAsset[] = [
  { symbol: 'BTC/USD', icon: '₿', type: 'crypto' },
  { symbol: 'ETH/USD', icon: 'Ξ', type: 'crypto' },
];

// OTC pairs from IQ Option (available weekends only)
export const OTC_ASSETS: TradingAsset[] = [
  { symbol: 'EUR/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'USD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/CAD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/GBP-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'NZD/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'USD/CHF-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'USD/CAD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'CAD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'EUR/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'GBP/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'AUD/USD-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'NZD/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
  { symbol: 'CHF/JPY-OTC', icon: '🔵', type: 'otc', isOTC: true },
];

/**
 * IQ Option Market Hours (based on official schedule):
 * 
 * FOREX (Binárias regulares):
 * - Segunda 00:00 UTC até Sexta 21:00 UTC
 * - Fechado: Sexta 21:00 UTC até Segunda 00:00 UTC
 * 
 * OTC (Over-the-Counter):
 * - Disponível 24/7 na IQ Option
 * - Especialmente útil quando Forex está fechado
 * 
 * CRYPTO:
 * - Disponível 24/7
 * 
 * BLITZ (Turbo/Rápido):
 * - Mesmo horário do Forex regular
 * - 5s, 15s, 30s, 60s de expiração
 */

/**
 * Check if it's currently weekend (Saturday or Sunday)
 */
export function isWeekend(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const utcHour = now.getUTCHours();
  
  // Sunday all day
  if (utcDay === 0) return true;
  
  // Saturday all day
  if (utcDay === 6) return true;
  
  // Friday after 21:00 UTC (market closed)
  if (utcDay === 5 && utcHour >= 21) return true;
  
  return false;
}

/**
 * Check if an asset is OTC based on its name
 */
export function isOTCAsset(asset: string): boolean {
  return asset.includes('OTC') || asset.includes('-OTC') || asset.toLowerCase().includes('otc');
}

/**
 * Check if OTC market is currently available
 * Na IQ Option, o mercado OTC está disponível 24/7
 */
export function isOTCMarketOpen(): boolean {
  return true;
}

/**
 * Check if regular Forex/Binary market is open
 * Forex/Binárias: Segunda 00:00 UTC até Sexta 21:00 UTC
 */
export function isForexMarketOpen(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  // Sunday - closed all day
  if (utcDay === 0) return false;
  
  // Saturday - closed all day  
  if (utcDay === 6) return false;
  
  // Friday after 21:00 UTC - closed
  if (utcDay === 5 && utcHour >= 21) return false;

  return true;
}

/**
 * Check if Blitz/Turbo market is open (same as Forex)
 */
export function isBlitzMarketOpen(): boolean {
  return isForexMarketOpen();
}

/**
 * Get available assets based on current market hours
 */
export function getAvailableAssets(): TradingAsset[] {
  const assets: TradingAsset[] = [...CRYPTO_ASSETS]; // Crypto always available

  if (isForexMarketOpen()) {
    assets.push(...FOREX_ASSETS);
  }

  if (isOTCMarketOpen()) {
    assets.push(...OTC_ASSETS);
  }

  return assets;
}

/**
 * Get detailed market status for display
 */
export interface MarketInfo {
  name: string;
  isOpen: boolean;
  schedule: string;
  scheduleDetail: string;
  timeInfo: string;
  nextChange: Date | null;
  type: 'forex' | 'otc' | 'crypto' | 'blitz';
}

/**
 * Calculate time until next market state change
 */
function formatTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  
  if (diff <= 0) return 'Agora';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Get next Forex market open time
 */
function getNextForexOpen(): Date {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  
  const nextOpen = new Date(now);
  
  if (utcDay === 0) {
    // Sunday - opens Monday 00:00 UTC
    nextOpen.setUTCDate(now.getUTCDate() + 1);
  } else if (utcDay === 6) {
    // Saturday - opens Monday 00:00 UTC
    nextOpen.setUTCDate(now.getUTCDate() + 2);
  } else if (utcDay === 5 && utcHour >= 21) {
    // Friday after close - opens Monday 00:00 UTC
    nextOpen.setUTCDate(now.getUTCDate() + 3);
  } else {
    // Already open
    return now;
  }
  
  nextOpen.setUTCHours(0, 0, 0, 0);
  return nextOpen;
}

/**
 * Get next Forex market close time
 */
function getNextForexClose(): Date {
  const now = new Date();
  const utcDay = now.getUTCDay();
  
  const nextClose = new Date(now);
  
  // Find next Friday
  const daysUntilFriday = (5 - utcDay + 7) % 7;
  if (daysUntilFriday === 0 && now.getUTCHours() >= 21) {
    // Already past this Friday's close
    nextClose.setUTCDate(now.getUTCDate() + 7);
  } else {
    nextClose.setUTCDate(now.getUTCDate() + daysUntilFriday);
  }
  
  nextClose.setUTCHours(21, 0, 0, 0);
  return nextClose;
}

/**
 * Get all markets status info for IQ Option
 */
export function getAllMarketsStatus(): MarketInfo[] {
  const forexOpen = isForexMarketOpen();
  const otcOpen = isOTCMarketOpen();
  const blitzOpen = isBlitzMarketOpen();
  
  const nextForexChange = forexOpen ? getNextForexClose() : getNextForexOpen();
  
  return [
    {
      name: 'Forex / Binárias',
      isOpen: forexOpen,
      schedule: 'Seg 00:00 - Sex 21:00 UTC',
      scheduleDetail: 'Segunda-feira 00:00 UTC até Sexta-feira 21:00 UTC',
      timeInfo: forexOpen 
        ? `Fecha em ${formatTimeUntil(nextForexChange)}`
        : `Abre em ${formatTimeUntil(nextForexChange)}`,
      nextChange: nextForexChange,
      type: 'forex',
    },
    {
      name: 'OTC (Fim de Semana)',
      isOpen: otcOpen,
      schedule: '24/7 disponível',
      scheduleDetail: 'Disponível 24 horas por dia, 7 dias por semana',
      timeInfo: 'Sempre disponível',
      nextChange: null,
      type: 'otc',
    },
    {
      name: 'Blitz / Turbo',
      isOpen: blitzOpen,
      schedule: 'Seg 00:00 - Sex 21:00 UTC',
      scheduleDetail: 'Mesmo horário do Forex (5s a 60s de expiração)',
      timeInfo: blitzOpen 
        ? `Fecha em ${formatTimeUntil(nextForexChange)}`
        : `Abre em ${formatTimeUntil(nextForexChange)}`,
      nextChange: nextForexChange,
      type: 'blitz',
    },
    {
      name: 'Criptomoedas',
      isOpen: true,
      schedule: '24/7 disponível',
      scheduleDetail: 'Bitcoin, Ethereum e outras - sempre disponível',
      timeInfo: 'Sempre disponível',
      nextChange: null,
      type: 'crypto',
    },
  ];
}

/**
 * Get OTC market status (legacy function)
 */
export function getOTCMarketStatus(): {
  isOpen: boolean;
  nextChange: Date;
  timeUntilChange: string;
} {
  const now = new Date();
  
  // OTC is always open
  return {
    isOpen: true,
    nextChange: now,
    timeUntilChange: 'Sempre aberto',
  };
}
