import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { iqOptionClient } from '@/services/IQOptionClient';
import { toast } from 'sonner';

interface BalanceInfo {
  balance: number;
  currency: string;
  accountType: string;
}

interface DailyStats {
  dailyProfit: number;
  todayTrades: number;
  wins: number;
  losses: number;
  consecutiveLosses: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function useIQOptionConnection() {
  const { user } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    dailyProfit: 0,
    todayTrades: 0,
    wins: 0,
    losses: 0,
    consecutiveLosses: 0,
  });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasConnected = useRef(false);
  const balanceRefreshInterval = useRef<NodeJS.Timeout | null>(null);

  // Fetch balance from IQ Option API via Edge Function
  const refreshBalanceFromAPI = useCallback(async () => {
    if (!user || isLoading) return;

    try {
      console.log('🔄 Fetching balance from IQ Option API...');
      const { data, error } = await supabase.functions.invoke('iqoption-get-balance', {
        body: { userId: user.id },
      });

      if (!error && data?.success) {
        const newBalance: BalanceInfo = {
          balance: data.balance,
          currency: data.currency,
          accountType: data.accountType,
        };
        
        setBalance(newBalance);
        setLastUpdate(new Date());
        setConnectionStatus('connected');
        
        console.log('✅ Balance updated from API:', newBalance);
        
        // Also update daily stats from the API response
        setDailyStats({
          dailyProfit: data.dailyProfit || 0,
          todayTrades: data.todayTrades || 0,
          wins: data.wins || 0,
          losses: data.losses || 0,
          consecutiveLosses: data.consecutiveLosses || 0,
        });
      } else {
        // Silently fail - don't spam console with errors
        console.warn('⚠️ Balance refresh skipped (server unavailable)');
      }
    } catch (error) {
      // Silently fail - edge function may be blocked by IQ Option
      console.warn('⚠️ Balance refresh failed silently');
    }
  }, [user, isLoading]);

  // Fetch daily stats from database
  const fetchDailyStats = useCallback(async () => {
    try {
      // Use UTC date to match database timestamps
      const now = new Date();
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      
      console.log('📊 Fetching stats from:', todayUTC.toISOString());

      const { data: results, error } = await supabase
        .from('operation_results')
        .select('result, profit, entry_price')
        .gte('created_at', todayUTC.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      let profit = 0;
      let wins = 0;
      let losses = 0;
      let ties = 0;
      let consecutiveLosses = 0;
      let currentStreak = 0;

      for (const result of results || []) {
        const resultType = result.result?.toLowerCase();
        if (resultType === 'win') {
          wins++;
          profit += result.profit || 0;
          currentStreak = 0;
        } else if (resultType === 'loss' || resultType === 'loose') {
          losses++;
          profit -= result.entry_price || 0;
          currentStreak++;
          consecutiveLosses = Math.max(consecutiveLosses, currentStreak);
        } else if (resultType === 'tie' || resultType === 'equal') {
          ties++;
          currentStreak = 0;
        }
      }

      console.log('📊 Daily stats calculated:', { 
        todayTrades: (results || []).filter(r => r.result !== 'pending').length,
        wins, 
        losses, 
        ties,
        profit,
        consecutiveLosses 
      });

      setDailyStats({
        dailyProfit: profit,
        todayTrades: (results || []).filter(r => r.result?.toLowerCase() !== 'pending').length,
        wins,
        losses,
        consecutiveLosses,
      });
    } catch (error) {
      console.error('Error fetching daily stats:', error);
    }
  }, []);

  // Connect to IQ Option
  const connect = useCallback(async () => {
    if (!user || isLoading) return;

    setIsLoading(true);
    setConnectionStatus('connecting');

    try {
      // Get credentials from database
      const { data: config, error } = await supabase
        .from('iqoption_config')
        .select('email, password, account_type')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !config) {
        // Try global config
        const { data: globalConfig, error: globalError } = await supabase
          .from('iqoption_config')
          .select('email, password, account_type')
          .eq('is_active', true)
          .maybeSingle();

        if (globalError || !globalConfig) {
          setConnectionStatus('error');
          toast.error('Nenhuma credencial IQ Option configurada');
          return;
        }

        const result = await iqOptionClient.login({
          email: globalConfig.email,
          password: globalConfig.password,
          accountType: globalConfig.account_type,
          userId: user.id,
        });

        if (!result.success) {
          setConnectionStatus('error');
          toast.error(`Falha na conexão: ${result.error}`);
          return;
        }
      } else {
        const result = await iqOptionClient.login({
          email: config.email,
          password: config.password,
          accountType: config.account_type,
          userId: user.id,
        });

        if (!result.success) {
          setConnectionStatus('error');
          toast.error(`Falha na conexão: ${result.error}`);
          return;
        }
      }

      setConnectionStatus('connected');
      setLastUpdate(new Date());
      hasConnected.current = true;
      toast.success('Conectado à IQ Option');

      // Update last connected timestamp
      await supabase
        .from('iqoption_config')
        .update({ last_connected_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_active', true);

      // Immediately fetch balance after connection
      await refreshBalanceFromAPI();

    } catch (error) {
      console.error('Connection error:', error);
      setConnectionStatus('error');
      toast.error('Erro ao conectar à IQ Option');
    } finally {
      setIsLoading(false);
    }
  }, [user, isLoading, refreshBalanceFromAPI]);

  // Disconnect from IQ Option
  const disconnect = useCallback(() => {
    iqOptionClient.disconnect();
    setConnectionStatus('disconnected');
    hasConnected.current = false;
    
    // Clear balance refresh interval
    if (balanceRefreshInterval.current) {
      clearInterval(balanceRefreshInterval.current);
      balanceRefreshInterval.current = null;
    }
  }, []);

  // Place a trade
  const placeTrade = useCallback(async (
    asset: string,
    direction: 'call' | 'put',
    amount: number,
    expiration: number,
    signalId?: string
  ) => {
    if (!iqOptionClient.isConnected()) {
      return { success: false, error: 'Não conectado à IQ Option' };
    }

    const result = await iqOptionClient.placeTrade(asset, direction, amount, expiration);

    if (result.success && signalId) {
      // Log the trade in database
      await supabase
        .from('operation_results')
        .insert({
          signal_id: signalId,
          asset: asset,
          direction: direction.toUpperCase(),
          entry_price: amount,
          result: 'pending',
          profit: 0,
          iq_option_id: result.tradeId,
        });
      
      // Refresh balance after trade
      setTimeout(() => refreshBalanceFromAPI(), 2000);
    }

    return result;
  }, [refreshBalanceFromAPI]);

  // Set up callbacks
  useEffect(() => {
    iqOptionClient.setCallbacks(
      (status) => {
        setConnectionStatus(status);
        if (status === 'connected') {
          setLastUpdate(new Date());
        }
      },
      (balanceInfo) => {
        if (balanceInfo) {
          setBalance(balanceInfo);
          setLastUpdate(new Date());
        }
      }
    );

    return () => {
      // Clean up on unmount
      iqOptionClient.disconnect();
      if (balanceRefreshInterval.current) {
        clearInterval(balanceRefreshInterval.current);
      }
    };
  }, []);

  // Auto-connect when user is available
  useEffect(() => {
    if (user && !hasConnected.current) {
      connect();
    }
  }, [user, connect]);

  // Refresh balance periodically (every 60 seconds) and when operation results change
  useEffect(() => {
    if (!user || connectionStatus !== 'connected') return;

    // Initial fetch
    refreshBalanceFromAPI();
    fetchDailyStats();

    // Set up periodic balance refresh (every 60 seconds to avoid rate limits)
    balanceRefreshInterval.current = setInterval(() => {
      console.log('⏰ Periodic balance refresh...');
      refreshBalanceFromAPI();
    }, 60000);

    // Subscribe to realtime updates for operation_results
    const channel = supabase
      .channel('operation-results-changes-bank')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'operation_results'
        },
        (payload) => {
          console.log('📢 Operation result changed:', payload);
          
          // Check if it's a loss - refresh stats
          const newRecord = payload.new as { result?: string } | undefined;
          if (newRecord?.result?.toLowerCase() === 'loss' || newRecord?.result?.toLowerCase() === 'loose') {
            console.log('⚠️ Loss detected! Refreshing stats...');
          }
          
          // Refresh stats when any result changes (but not balance - too many API calls)
          fetchDailyStats();
        }
      )
      .subscribe();

    return () => {
      if (balanceRefreshInterval.current) {
        clearInterval(balanceRefreshInterval.current);
        balanceRefreshInterval.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [user, connectionStatus, refreshBalanceFromAPI, fetchDailyStats]);

  return {
    connectionStatus,
    balance,
    dailyStats,
    lastUpdate,
    isLoading,
    connect,
    disconnect,
    placeTrade,
    refreshBalance: refreshBalanceFromAPI,
    isConnected: iqOptionClient.isConnected(),
  };
}
