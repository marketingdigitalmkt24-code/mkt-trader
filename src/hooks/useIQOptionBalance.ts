import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

export function useIQOptionBalance() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [data, setData] = useState<BalanceData>({
    balance: 0,
    currency: 'USD',
    accountType: 'PRACTICE',
    dailyProfit: 0,
    todayTrades: 0,
    wins: 0,
    losses: 0,
    consecutiveLosses: 0,
  });

  const fetchBalance = useCallback(async () => {
    setIsLoading(true);
    
    try {
      console.log('🔄 Fetching IQ Option balance...');
      
      const { data: response, error } = await supabase.functions.invoke('iqoption-get-balance');
      
      if (error) {
        console.error('Error fetching balance:', error);
        return;
      }

      if (response?.success) {
        setData({
          balance: response.balance,
          currency: response.currency,
          accountType: response.accountType,
          dailyProfit: response.dailyProfit,
          todayTrades: response.todayTrades,
          wins: response.wins,
          losses: response.losses,
          consecutiveLosses: response.consecutiveLosses,
        });
        setLastUpdate(new Date());
        console.log('✅ Balance updated:', response.balance, response.currency);
      } else {
        console.error('Failed to fetch balance:', response?.error);
      }
    } catch (err) {
      console.error('Error:', err);
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
    refresh: fetchBalance,
  };
}
