import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { iqOptionClient } from '@/services/IQOptionClient';
import { toast } from 'sonner';
import { afterIQReset, combineCutoffs, getIQResultsReset, IQ_RESULTS_RESET_EVENT } from '@/lib/iq-results-reset';
import { useGlobalIQResetCutoff } from '@/hooks/useGlobalIQResetCutoff';
import { sharedBalanceRead } from '@/lib/shared-balance-read';

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


export function useIQOptionConnection({ silentMissingCredentials = false, fetchStatistics = true, balanceOnly = false }: { silentMissingCredentials?: boolean; fetchStatistics?: boolean; balanceOnly?: boolean } = {}) {
  const { user } = useAuth();
  const globalCutoff = useGlobalIQResetCutoff();
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
  const balanceRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch balance from IQ Option API via Edge Function
  const refreshBalanceFromAPI = useCallback(async () => {
    if (!user) return;

    try {
      // Shared across every card: each balance read is a fresh broker login, and
      // too many logins make the broker refuse the Demo routine's login.
      const userId = user.id;
      const { data, error } = await sharedBalanceRead(userId, () => supabase.functions.invoke('iqoption-get-balance', {
        body: { userId, timezoneOffset: new Date().getTimezoneOffset() },
      }));

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
        
        // Daily stats are fetched separately from the database (fetchDailyStats)
        // to ensure proper MT5 filtering. Do NOT overwrite them here.
      } else {
        console.error('❌ Failed to fetch balance:', error || data?.error);
      }
    } catch (error) {
      console.error('❌ Error fetching balance:', error);
    }
  }, [user]);

  // Fetch daily stats from database (IQ Option only, exclude MT5)
  const fetchDailyStats = useCallback(async () => {
    if (!fetchStatistics) return;
    try {
      // Use Brasília midnight (UTC-3) for "today"
      const now = new Date();
      const brasiliaNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const year = brasiliaNow.getUTCFullYear();
      const month = brasiliaNow.getUTCMonth();
      const day = brasiliaNow.getUTCDate();
      const brasiliaMidnightUtc = new Date(Date.UTC(year, month, day, 3, 0, 0, 0));

      console.log('📊 IQ Option stats from (BRT midnight):', brasiliaMidnightUtc.toISOString());

      const all: Array<{ id: string; signal_id: string; asset: string; direction: string; result: string | null; profit: number | null; timeframe: string; entry_strategy: string | null; iq_option_id: string | null; created_at: string }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('operation_results')
          .select('id, signal_id, asset, direction, result, profit, timeframe, entry_strategy, iq_option_id, created_at')
          .gte('created_at', brasiliaMidnightUtc.toISOString())
          .not('signal_id', 'like', 'copy-%').not('signal_id', 'like', 'mt5-%')
          .not('timeframe', 'in', '(TEST,MT5)').not('iq_option_id', 'is', null)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const startIso = brasiliaMidnightUtc.toISOString();
      // Mesmo filtro do card "Entradas na IQ Option": somente ordens reais confirmadas pela corretora
      const results = all.filter((r) => r.created_at >= startIso && afterIQReset(r.created_at, combineCutoffs(getIQResultsReset(user?.id), globalCutoff)) && r.timeframe !== 'MT5'
        && r.iq_option_id && !String(r.iq_option_id).toLowerCase().startsWith('test'));

      let profit = 0;
      let wins = 0;
      let losses = 0;
      let ties = 0;
      let consecutiveLosses = 0;
      let currentStreak = 0;

      for (const result of results) {
        const resultType = result.result?.toLowerCase();
        if (resultType === 'win') {
          wins++;
          profit += Number(result.profit || 0);
          currentStreak = 0;
        } else if (resultType === 'loss' || resultType === 'loose') {
          losses++;
          profit += Number(result.profit || 0); // profit is already negative for losses
          currentStreak++;
          consecutiveLosses = Math.max(consecutiveLosses, currentStreak);
        } else if (resultType === 'tie' || resultType === 'equal') {
          ties++;
          currentStreak = 0;
        }
      }

      console.log('📊 IQ Option daily stats:', { 
        todayTrades: results.filter(r => r.result !== 'pending').length,
        wins, losses, ties, profit, consecutiveLosses 
      });

      setDailyStats({
        dailyProfit: profit,
        todayTrades: results.filter(r => ['win', 'loss', 'loose', 'tie', 'draw', 'equal'].includes(r.result?.toLowerCase() || '')).length,
        wins,
        losses,
        consecutiveLosses,
      });
    } catch (error) {
      console.error('Error fetching daily stats:', error);
    }
  }, [user?.id, fetchStatistics, globalCutoff]);

  useEffect(() => {
    const reload = () => { void fetchDailyStats(); };
    reload();
    const interval = setInterval(reload, 10000);
    window.addEventListener(IQ_RESULTS_RESET_EVENT, reload);
    return () => { clearInterval(interval); window.removeEventListener(IQ_RESULTS_RESET_EVENT, reload); };
  }, [fetchDailyStats]);

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
        if (silentMissingCredentials) {
          setConnectionStatus('disconnected');
          hasConnected.current = true;
          return;
        }
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
  }, [user, isLoading, refreshBalanceFromAPI, silentMissingCredentials]);

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
    if (balanceOnly) return;
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
  }, [balanceOnly]);

  // Auto-connect when user is available
  useEffect(() => {
    if (balanceOnly) return;
    if (user && !hasConnected.current) {
      connect();
    }
  }, [user, connect, balanceOnly]);

  // Read broker balance without another login or shared callback ownership.
  useEffect(() => {
    if (!balanceOnly || !user) return;
    void refreshBalanceFromAPI();
    const interval = setInterval(() => { void refreshBalanceFromAPI(); }, 15000);
    return () => clearInterval(interval);
  }, [balanceOnly, user, refreshBalanceFromAPI]);

  // Refresh balance periodically (every 15 seconds) and when operation results change
  useEffect(() => {
    if (!user || connectionStatus !== 'connected') return;

    // Initial fetch
    refreshBalanceFromAPI();
    fetchDailyStats();

    // Set up periodic balance refresh (every 15 seconds for more real-time updates)
    balanceRefreshInterval.current = setInterval(() => {
      console.log('⏰ Periodic balance refresh...');
      refreshBalanceFromAPI();
    }, 15000);

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
          
          // Check if it's a loss - immediately refresh balance
          const newRecord = payload.new as { result?: string } | undefined;
          if (newRecord?.result?.toLowerCase() === 'loss' || newRecord?.result?.toLowerCase() === 'loose') {
            console.log('⚠️ Loss detected! Refreshing balance immediately...');
            toast.warning('Loss detectado! Atualizando saldo...', { duration: 2000 });
          }
          
          // Refresh stats and balance when any result changes
          fetchDailyStats();
          refreshBalanceFromAPI();
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
