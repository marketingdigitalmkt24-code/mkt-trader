import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
    setIsLoading(true);
    setConnectionStatus('connecting');
    
    try {
      console.log('🔄 Fetching IQ Option balance...');
      
      const { data: response, error } = await supabase.functions.invoke('iqoption-get-balance');
      
      if (error) {
        console.error('Error fetching balance:', error);
        setConnectionStatus('disconnected');
        // Use cached data if available
        const cached = getCachedData();
        if (cached) {
          console.log('📦 Using cached balance data');
        }
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
  }, []);

  // Fetch on mount and every 30 seconds
  useEffect(() => {
    fetchBalance();
    
    const interval = setInterval(fetchBalance, 30000);
    
    return () => clearInterval(interval);
  }, [fetchBalance]);

  return {
    ...data,
    isLoading,
    lastUpdate,
    connectionStatus,
    refresh: fetchBalance,
  };
}
