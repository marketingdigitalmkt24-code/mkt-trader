import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingAsset } from '@/types/trading';
import { iqOptionClient } from '@/services/IQOptionClient';

interface IQAsset {
  id: number;
  name: string;
  type: string;
  isOTC: boolean;
  enabled: boolean;
  payout?: number;
}

interface UseAvailableAssetsReturn {
  assets: TradingAsset[];
  otcAssets: TradingAsset[];
  forexAssets: TradingAsset[];
  cryptoAssets: TradingAsset[];
  blitzAssets: TradingAsset[];
  isLoading: boolean;
  lastUpdate: Date | null;
  error: string | null;
  refresh: () => Promise<void>;
}

// Default/fallback assets when API is not available
// Based on common IQ Option assets
const DEFAULT_OTC_ASSETS: TradingAsset[] = [
  { symbol: 'EUR/USD-OTC', icon: '🇪🇺', type: 'otc', isOTC: true },
  { symbol: 'GBP/USD-OTC', icon: '🇬🇧', type: 'otc', isOTC: true },
  { symbol: 'USD/JPY-OTC', icon: '🇺🇸', type: 'otc', isOTC: true },
  { symbol: 'GBP/JPY-OTC', icon: '🇬🇧', type: 'otc', isOTC: true },
  { symbol: 'EUR/JPY-OTC', icon: '🇪🇺', type: 'otc', isOTC: true },
  { symbol: 'AUD/USD-OTC', icon: '🇦🇺', type: 'otc', isOTC: true },
  { symbol: 'AUD/CAD-OTC', icon: '🇦🇺', type: 'otc', isOTC: true },
  { symbol: 'USD/CAD-OTC', icon: '🇺🇸', type: 'otc', isOTC: true },
  { symbol: 'USD/CHF-OTC', icon: '🇺🇸', type: 'otc', isOTC: true },
  { symbol: 'EUR/GBP-OTC', icon: '🇪🇺', type: 'otc', isOTC: true },
  { symbol: 'NZD/USD-OTC', icon: '🇳🇿', type: 'otc', isOTC: true },
  { symbol: 'CHF/JPY-OTC', icon: '🇨🇭', type: 'otc', isOTC: true },
];

const DEFAULT_FOREX_ASSETS: TradingAsset[] = [
  { symbol: 'EUR/USD', icon: '🇪🇺', type: 'forex', isOTC: false },
  { symbol: 'GBP/USD', icon: '🇬🇧', type: 'forex', isOTC: false },
  { symbol: 'USD/JPY', icon: '🇺🇸', type: 'forex', isOTC: false },
  { symbol: 'AUD/USD', icon: '🇦🇺', type: 'forex', isOTC: false },
  { symbol: 'USD/CAD', icon: '🇺🇸', type: 'forex', isOTC: false },
  { symbol: 'EUR/JPY', icon: '🇪🇺', type: 'forex', isOTC: false },
  { symbol: 'GBP/JPY', icon: '🇬🇧', type: 'forex', isOTC: false },
];

const DEFAULT_CRYPTO_ASSETS: TradingAsset[] = [
  { symbol: 'BTC/USD', icon: '₿', type: 'crypto', isOTC: false },
  { symbol: 'ETH/USD', icon: 'Ξ', type: 'crypto', isOTC: false },
  { symbol: 'LTC/USD', icon: '🪙', type: 'crypto', isOTC: false },
];

// Blitz assets (very short expiration - 5s to 60s)
const DEFAULT_BLITZ_ASSETS: TradingAsset[] = [
  { symbol: 'EUR/USD-BLITZ', icon: '⚡', type: 'blitz', isOTC: false },
  { symbol: 'GBP/USD-BLITZ', icon: '⚡', type: 'blitz', isOTC: false },
  { symbol: 'USD/JPY-BLITZ', icon: '⚡', type: 'blitz', isOTC: false },
];

const DEFAULT_ASSETS = [
  ...DEFAULT_OTC_ASSETS,
  ...DEFAULT_FOREX_ASSETS,
  ...DEFAULT_CRYPTO_ASSETS,
  ...DEFAULT_BLITZ_ASSETS,
];

// Cache to avoid too many API calls
let cachedAssets: TradingAsset[] = DEFAULT_ASSETS;
let lastFetchTime: number = 0;
const CACHE_DURATION = 120000; // 2 minute cache

export function useAvailableAssets(): UseAvailableAssetsReturn {
  const [assets, setAssets] = useState<TradingAsset[]>(cachedAssets);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(async (force: boolean = false) => {
    // Check cache
    const now = Date.now();
    if (!force && cachedAssets.length > DEFAULT_ASSETS.length && now - lastFetchTime < CACHE_DURATION) {
      console.log('Using cached assets:', cachedAssets.length);
      setAssets(cachedAssets);
      return;
    }

    // If client-side IQ Option is not connected, use default assets
    if (!iqOptionClient.isConnected()) {
      console.log('📊 IQ Option não conectado no navegador, usando ativos padrão');
      setAssets(DEFAULT_ASSETS);
      cachedAssets = DEFAULT_ASSETS;
      setLastUpdate(new Date());
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 Fetching available assets from IQ Option via edge function...');
      
      const { data, error: fetchError } = await supabase.functions.invoke('iqoption-get-assets');
      
      if (fetchError) {
        // Silently use defaults on connection errors (IQ Option timeout is common)
        const isTimeoutError = fetchError.message?.includes('timeout') || fetchError.message?.includes('Connection');
        if (!isTimeoutError) {
          console.warn('Edge function error (using defaults):', fetchError.message);
        }
        setAssets(DEFAULT_ASSETS);
        cachedAssets = DEFAULT_ASSETS;
        setLastUpdate(new Date());
        return;
      }

      if (data?.success && data?.assets) {
        const iqAssets: IQAsset[] = data.assets;
        
        // Convert to TradingAsset format
        const tradingAssets: TradingAsset[] = iqAssets.map((asset) => {
          // Format the symbol properly
          let symbol = asset.name;
          
          // Add slash if not present
          if (!symbol.includes('/') && !symbol.includes('-')) {
            if (symbol.length === 6) {
              symbol = `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
            }
          }
          
          // Determine icon based on asset type
          let icon = '📊';
          if (asset.isOTC) {
            icon = '🔵';
          } else if (asset.type === 'crypto') {
            icon = symbol.includes('BTC') ? '₿' : symbol.includes('ETH') ? 'Ξ' : '🪙';
          } else if (asset.type === 'forex') {
            if (symbol.includes('EUR')) icon = '🇪🇺';
            else if (symbol.includes('GBP')) icon = '🇬🇧';
            else if (symbol.includes('USD')) icon = '🇺🇸';
            else if (symbol.includes('JPY')) icon = '🇯🇵';
            else if (symbol.includes('AUD')) icon = '🇦🇺';
            else if (symbol.includes('CAD')) icon = '🇨🇦';
            else if (symbol.includes('CHF')) icon = '🇨🇭';
          } else if (asset.type === 'blitz') {
            icon = '⚡';
          }

          return {
            symbol: symbol,
            icon: icon,
            type: asset.isOTC ? 'otc' : asset.type as 'forex' | 'crypto' | 'otc' | 'blitz',
            isOTC: asset.isOTC,
            iqOptionId: asset.id,
            payout: asset.payout,
          };
        });

        // Add blitz assets if not present
        const hasBlitz = tradingAssets.some(a => a.type === 'blitz');
        const allAssets = hasBlitz ? tradingAssets : [...tradingAssets, ...DEFAULT_BLITZ_ASSETS];

        console.log(`✅ Fetched ${allAssets.length} available assets`);
        
        // Update cache
        cachedAssets = allAssets;
        lastFetchTime = now;
        
        setAssets(allAssets);
        setLastUpdate(new Date());
      } else {
        console.warn('Failed to fetch assets, using defaults:', data?.error);
        setAssets(DEFAULT_ASSETS);
        cachedAssets = DEFAULT_ASSETS;
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.warn('Error fetching assets, using defaults:', err);
      setAssets(DEFAULT_ASSETS);
      cachedAssets = DEFAULT_ASSETS;
      setLastUpdate(new Date());
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and every 3 minutes
  useEffect(() => {
    fetchAssets();
    
    const interval = setInterval(() => {
      fetchAssets(true);
    }, 180000); // Refresh every 3 minutes
    
    return () => clearInterval(interval);
  }, [fetchAssets]);

  // Filter assets by type
  const otcAssets = assets.filter(a => a.isOTC || a.type === 'otc');
  const forexAssets = assets.filter(a => a.type === 'forex' && !a.isOTC);
  const cryptoAssets = assets.filter(a => a.type === 'crypto');
  const blitzAssets = assets.filter(a => a.type === 'blitz');

  return {
    assets,
    otcAssets,
    forexAssets,
    cryptoAssets,
    blitzAssets,
    isLoading,
    lastUpdate,
    error,
    refresh: () => fetchAssets(true),
  };
}

// Export helper to get cached assets synchronously
export function getCachedAssets(): TradingAsset[] {
  return cachedAssets;
}

// Export helper to check if assets are available
export function hasAvailableAssets(): boolean {
  return cachedAssets.length > 0;
}

// Export default assets for use in other components
export const AVAILABLE_TIMEFRAMES = [
  { label: '5s', value: '5', description: 'Blitz - 5 segundos' },
  { label: '15s', value: '15', description: 'Blitz - 15 segundos' },
  { label: '30s', value: '30', description: 'Blitz - 30 segundos' },
  { label: '1m', value: '60', description: 'Binária - 1 minuto' },
  { label: '2m', value: '120', description: 'Binária - 2 minutos' },
  { label: '3m', value: '180', description: 'Binária - 3 minutos' },
  { label: '5m', value: '300', description: 'Binária - 5 minutos' },
  { label: '15m', value: '900', description: 'Binária - 15 minutos' },
  { label: '30m', value: '1800', description: 'Binária - 30 minutos' },
  { label: '1h', value: '3600', description: 'Binária - 1 hora' },
];

export const MARKET_TYPES = [
  { label: 'OTC', value: 'otc', description: 'Mercado OTC - disponível 24/7' },
  { label: 'Forex', value: 'forex', description: 'Mercado Forex - horário comercial' },
  { label: 'Crypto', value: 'crypto', description: 'Criptomoedas - disponível 24/7' },
  { label: 'Blitz', value: 'blitz', description: 'Ultra-rápido - 5s a 60s' },
];
