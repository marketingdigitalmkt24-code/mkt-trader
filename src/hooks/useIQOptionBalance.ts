import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { sharedBalanceRead } from '@/lib/shared-balance-read';

interface BalanceData {
  balance: number;
  currency: string;
  accountType: string;
  dailyProfit: number;
  todayTrades: number;
  wins: number;
  losses: number;
  consecutiveLosses: number;
}

const CACHE_KEY = 'iq_option_balance_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedData extends BalanceData {
  timestamp: number;
}

function getCachedData(): CachedData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedData;
      if (Date.now() - parsed.timestamp < CACHE_DURATION) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading cache:', e);
  }
  return null;
}

function setCachedData(data: BalanceData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ...data,
      timestamp: Date.now(),
    }));
  } catch (e) {
    console.error('Error saving cache:', e);
  }
}

export function useIQOptionBalance() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [data, setData] = useState<BalanceData>(() => {
    // Initialize from cache if available
    const cached = getCachedData();
    if (cached) {
      return {
        balance: cached.balance,
        currency: cached.currency,
        accountType: cached.accountType,
        dailyProfit: cached.dailyProfit,
        todayTrades: cached.todayTrades,
        wins: cached.wins,
        losses: cached.losses,
        consecutiveLosses: cached.consecutiveLosses,
      };
    }
    return {
      balance: 0,
      currency: 'USD',
      accountType: 'PRACTICE',
      dailyProfit: 0,
      todayTrades: 0,
      wins: 0,
      losses: 0,
      consecutiveLosses: 0,
    };
  });

  const fetchBalance = useCallback(async () => {
    if (!user) {
      setConnectionStatus('disconnected');
      return;
    }
    
    setIsLoading(true);
    setConnectionStatus('connecting');
    
    try {
      console.log('🔄 Fetching IQ Option balance for user:', user.id);
      
      const { data: response, error } = await sharedBalanceRead(user.id, () => supabase.functions.invoke('iqoption-get-balance', {
        body: { userId: user.id, timezoneOffset: 180 }
      }));
      
      if (error) {
        // Silently handle timeout errors (IQ Option API can be slow/blocked)
        const isTimeoutError = error.message?.includes('timeout') || error.message?.includes('Connection');
        if (!isTimeoutError) {
          console.warn('Balance fetch error (using cache):', error.message);
        }
        setConnectionStatus('disconnected');
        // Use cached data if available - already initialized from cache
        return;
      }

      if (response?.success) {
        const newData = {
          balance: response.balance,
          currency: response.currency,
          accountType: response.accountType,
          dailyProfit: response.dailyProfit,
          todayTrades: response.todayTrades,
          wins: response.wins,
          losses: response.losses,
          consecutiveLosses: response.consecutiveLosses,
        };
        setData(newData);
        setCachedData(newData);
        setLastUpdate(new Date());
        setConnectionStatus('connected');
        console.log('✅ Balance updated:', response.balance, response.currency);
      } else {
        console.error('Failed to fetch balance:', response?.error);
        setConnectionStatus('disconnected');
      }
    } catch (err) {
      console.error('Error:', err);
      setConnectionStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch on mount, when user changes, and poll with backoff to avoid UI freezing on network blocks
  useEffect(() => {
    if (!user) return;

    let intervalId: number | undefined;
    let cancelled = false;
    let failureCount = 0;

    const run = async () => {
      if (cancelled) return;

      await fetchBalance();

      if (!cancelled) intervalId = window.setTimeout(run, 60000);
    };

    run();

    return () => {
      cancelled = true;
      if (intervalId) window.clearTimeout(intervalId);
    };
  }, [fetchBalance, user]);

  return {
    ...data,
    isLoading,
    lastUpdate,
    connectionStatus,
    refresh: fetchBalance,
  };
}
