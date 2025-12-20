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
 * Check if OTC market is currently available
 * OTC is available from Friday 21:00 UTC to Sunday 21:00 UTC
 */
export function isOTCMarketOpen(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
  const utcHour = now.getUTCHours();

  // Saturday (all day)
  if (utcDay === 6) return true;
  
  // Sunday (until 21:00 UTC)
  if (utcDay === 0 && utcHour < 21) return true;
  
  // Friday (after 21:00 UTC)
  if (utcDay === 5 && utcHour >= 21) return true;

  return false;
}

/**
 * Check if regular Forex market is open
 * Forex is available Monday 00:00 UTC to Friday 21:00 UTC
 */
export function isForexMarketOpen(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();

  // Saturday and Sunday - closed
  if (utcDay === 0 || utcDay === 6) return false;
  
  // Friday after 21:00 - closed
  if (utcDay === 5 && utcHour >= 21) return false;

  return true;
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
 * Get time until OTC market opens/closes
 */
export function getOTCMarketStatus(): {
  isOpen: boolean;
  nextChange: Date;
  timeUntilChange: string;
} {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const isOpen = isOTCMarketOpen();

  let nextChange = new Date(now);

  if (isOpen) {
    // Find when it closes (Sunday 21:00 UTC)
    const daysUntilSunday = (7 - utcDay) % 7;
    nextChange.setUTCDate(now.getUTCDate() + daysUntilSunday);
    nextChange.setUTCHours(21, 0, 0, 0);
    
    if (utcDay === 0 && utcHour >= 21) {
      // Already past Sunday 21:00, next is next Sunday
      nextChange.setUTCDate(nextChange.getUTCDate() + 7);
    }
  } else {
    // Find when it opens (Friday 21:00 UTC)
    let daysUntilFriday = (5 - utcDay + 7) % 7;
    if (daysUntilFriday === 0 && utcHour >= 21) {
      // Already past this Friday, wait for next
      daysUntilFriday = 7;
    }
    nextChange.setUTCDate(now.getUTCDate() + daysUntilFriday);
    nextChange.setUTCHours(21, 0, 0, 0);
  }

  const diff = nextChange.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let timeUntilChange = '';
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    timeUntilChange = `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    timeUntilChange = `${hours}h ${minutes}m`;
  } else {
    timeUntilChange = `${minutes}m`;
  }

  return { isOpen, nextChange, timeUntilChange };
}
