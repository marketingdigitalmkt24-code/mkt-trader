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

  // Fetch daily stats from database
  const fetchDailyStats = useCallback(async () => {
    if (!user) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: results, error } = await supabase
        .from('operation_results')
        .select('*')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      let profit = 0;
      let wins = 0;
      let losses = 0;
      let consecutiveLosses = 0;
      let currentStreak = 0;

      for (const result of results || []) {
        if (result.result === 'WIN') {
          wins++;
          profit += result.profit;
          currentStreak = 0;
        } else if (result.result === 'LOSS') {
          losses++;
          profit += result.profit;
          currentStreak++;
          consecutiveLosses = Math.max(consecutiveLosses, currentStreak);
        }
      }

      setDailyStats({
        dailyProfit: profit,
        todayTrades: (results || []).length,
        wins,
        losses,
        consecutiveLosses,
      });
    } catch (error) {
      console.error('Error fetching daily stats:', error);
    }
  }, [user]);

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

    } catch (error) {
      console.error('Connection error:', error);
      setConnectionStatus('error');
      toast.error('Erro ao conectar à IQ Option');
    } finally {
      setIsLoading(false);
    }
  }, [user, isLoading]);

  // Disconnect from IQ Option
  const disconnect = useCallback(() => {
    iqOptionClient.disconnect();
    setConnectionStatus('disconnected');
    hasConnected.current = false;
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
    }

    return result;
  }, []);

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
    };
  }, []);

  // Auto-connect when user is available
  useEffect(() => {
    if (user && !hasConnected.current) {
      connect();
    }
  }, [user, connect]);

  // Fetch daily stats periodically
  useEffect(() => {
    fetchDailyStats();
    const interval = setInterval(fetchDailyStats, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchDailyStats]);

  return {
    connectionStatus,
    balance,
    dailyStats,
    lastUpdate,
    isLoading,
    connect,
    disconnect,
    placeTrade,
    isConnected: iqOptionClient.isConnected(),
  };
}
