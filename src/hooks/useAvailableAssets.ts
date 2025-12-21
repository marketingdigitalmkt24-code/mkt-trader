import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingAsset } from '@/types/trading';

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
  isLoading: boolean;
  lastUpdate: Date | null;
  error: string | null;
  refresh: () => Promise<void>;
}

// Cache to avoid too many API calls
let cachedAssets: TradingAsset[] = [];
let lastFetchTime: number = 0;
const CACHE_DURATION = 60000; // 1 minute cache

export function useAvailableAssets(): UseAvailableAssetsReturn {
  const [assets, setAssets] = useState<TradingAsset[]>(cachedAssets);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(async (force: boolean = false) => {
    // Check cache
    const now = Date.now();
    if (!force && cachedAssets.length > 0 && now - lastFetchTime < CACHE_DURATION) {
      console.log('Using cached assets:', cachedAssets.length);
      setAssets(cachedAssets);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 Fetching available assets from IQ Option...');
      
      const { data, error: fetchError } = await supabase.functions.invoke('iqoption-get-assets');
      
      if (fetchError) {
        console.error('Error fetching assets:', fetchError);
        setError(fetchError.message);
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
          }

          return {
            symbol: symbol,
            icon: icon,
            type: asset.isOTC ? 'otc' : asset.type as 'forex' | 'crypto' | 'otc',
            isOTC: asset.isOTC,
            iqOptionId: asset.id,
            payout: asset.payout,
          };
        });

        console.log(`✅ Fetched ${tradingAssets.length} available assets`);
        
        // Update cache
        cachedAssets = tradingAssets;
        lastFetchTime = now;
        
        setAssets(tradingAssets);
        setLastUpdate(new Date());
      } else {
        console.error('Failed to fetch assets:', data?.error);
        setError(data?.error || 'Failed to fetch assets');
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and every 2 minutes
  useEffect(() => {
    fetchAssets();
    
    const interval = setInterval(() => {
      fetchAssets(true);
    }, 120000); // Refresh every 2 minutes
    
    return () => clearInterval(interval);
  }, [fetchAssets]);

  // Filter assets by type
  const otcAssets = assets.filter(a => a.isOTC || a.type === 'otc');
  const forexAssets = assets.filter(a => a.type === 'forex' && !a.isOTC);
  const cryptoAssets = assets.filter(a => a.type === 'crypto');

  return {
    assets,
    otcAssets,
    forexAssets,
    cryptoAssets,
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
