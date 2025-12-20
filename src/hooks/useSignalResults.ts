import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingSignal, SignalResult, TradingStats, SignalHistory } from '@/types/trading';

const STORAGE_KEY = 'signal_history';
const STATS_KEY = 'trading_stats';

// Simular resultado baseado na confluência (quanto maior, mais chance de WIN)
function simulateResult(confluenceScore: number): SignalResult {
  const baseWinRate = 0.5 + ((confluenceScore - 50) / 100) * 0.5;
  const random = Math.random();
  
  if (random < 0.05) return 'tie';
  if (random < baseWinRate) return 'win';
  return 'loss';
}

// Simular variação de preço
function simulateExitPrice(signal: TradingSignal, result: SignalResult): number {
  const variation = signal.price * 0.001;
  
  if (result === 'tie') return signal.price;
  
  if (signal.type === 'CALL') {
    return result === 'win' 
      ? signal.price + variation + Math.random() * variation
      : signal.price - variation - Math.random() * variation;
  } else {
    return result === 'win'
      ? signal.price - variation - Math.random() * variation
      : signal.price + variation + Math.random() * variation;
  }
}

export function useSignalResults() {
  const [history, setHistory] = useState<SignalHistory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((h: SignalHistory) => ({
          ...h,
          timestamp: new Date(h.timestamp),
          resultTimestamp: h.resultTimestamp ? new Date(h.resultTimestamp) : undefined,
          signal: {
            ...h.signal,
            timestamp: new Date(h.signal.timestamp),
            resultTime: h.signal.resultTime ? new Date(h.signal.resultTime) : undefined,
          }
        }));
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
    return [];
  });

  const [stats, setStats] = useState<TradingStats>(() => {
    try {
      const saved = localStorage.getItem(STATS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
    return {
      totalSignals: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      pending: 0,
      winRate: 0,
      totalProfit: 0,
      streak: 0,
      streakType: 'none',
    };
  });

  // Calcular stats baseado no histórico
  const recalculateStats = useCallback((historyData: SignalHistory[]): TradingStats => {
    const completed = historyData.filter(h => h.result !== 'pending');
    const wins = completed.filter(h => h.result === 'win').length;
    const losses = completed.filter(h => h.result === 'loss').length;
    const ties = completed.filter(h => h.result === 'tie').length;
    const pending = historyData.filter(h => h.result === 'pending').length;
    
    const winRate = completed.length > 0 
      ? (wins / (wins + losses)) * 100 
      : 0;
    
    const totalProfit = historyData.reduce((sum, h) => sum + h.profit, 0);
    
    // Calcular streak
    let streak = 0;
    let streakType: 'win' | 'loss' | 'none' = 'none';
    
    for (let i = completed.length - 1; i >= 0; i--) {
      const result = completed[i].result;
      if (result === 'tie') continue;
      
      if (streakType === 'none') {
        streakType = result as 'win' | 'loss';
        streak = 1;
      } else if (result === streakType) {
        streak++;
      } else {
        break;
      }
    }

    return {
      totalSignals: historyData.length,
      wins,
      losses,
      ties,
      pending,
      winRate: Math.round(winRate * 10) / 10,
      totalProfit: Math.round(totalProfit * 100) / 100,
      streak,
      streakType,
    };
  }, []);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  // Fetch existing results from database on mount
  useEffect(() => {
    const fetchExistingResults = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data, error } = await supabase
          .from('operation_results')
          .select('*')
          .gte('created_at', today.toISOString())
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching results:', error);
          return;
        }
        
        if (data && data.length > 0) {
          console.log(`📊 Loaded ${data.length} results from database`);
          
          const dbHistory: SignalHistory[] = data.map(result => ({
            id: result.id,
            signal: {
              id: result.signal_id,
              asset: result.asset,
              assetIcon: '📊',
              type: result.direction as 'CALL' | 'PUT',
              price: result.entry_price || 0,
              timestamp: new Date(result.created_at),
              timeframe: 'M5',
              expiration: '5 min',
              strength: 3,
              status: 'high_probability',
              isHot: false,
              marketType: 'otc',
              indicators: {
                rsi: { value: 50, signal: 'neutral' },
                macd: { value: 0, signal: 0, histogram: 0, trend: 'neutral' },
                bollinger: { upper: 0, middle: 0, lower: 0, position: 'middle' },
                stochastic: { k: 50, d: 50, signal: 'neutral' },
                movingAverages: { ema9: 0, ema21: 0, sma50: 0, trend: 'neutral' },
                atr: { value: 0, volatility: 'medium' },
                supportResistance: { nearestSupport: 0, nearestResistance: 0, pricePosition: 'middle' },
                confluenceCount: 0,
                confluenceScore: 0,
              },
              confirmations: ['IQ Option Real'],
              result: result.result as SignalResult,
              resultPrice: result.exit_price || 0,
              profit: result.profit,
              resultTime: new Date(result.created_at),
            },
            result: result.result as SignalResult,
            entryPrice: result.entry_price || 0,
            exitPrice: result.exit_price || 0,
            profit: result.profit,
            timestamp: new Date(result.created_at),
            resultTimestamp: new Date(result.created_at),
          }));
          
          setHistory(prev => {
            // Merge DB results with local history, avoiding duplicates
            const existingIds = new Set(prev.map(h => h.id));
            const newResults = dbHistory.filter(h => !existingIds.has(h.id));
            
            if (newResults.length > 0) {
              const merged = [...newResults, ...prev].sort((a, b) => 
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              );
              const newStats = recalculateStats(merged);
              setStats(newStats);
              return merged;
            }
            return prev;
          });
        }
      } catch (err) {
        console.error('Failed to fetch existing results:', err);
      }
    };
    
    fetchExistingResults();
  }, [recalculateStats]);

  // Listen for real-time updates from IQ Option results
  useEffect(() => {
    console.log('🔔 Setting up realtime subscription for operation_results');
    
    const channel = supabase
      .channel('operation-results-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE)
          schema: 'public',
          table: 'operation_results',
        },
        (payload) => {
          console.log('📊 Realtime update:', payload.eventType, payload.new);
          
          const result = payload.new as {
            id: string;
            signal_id: string;
            asset: string;
            direction: string;
            entry_price: number;
            exit_price: number;
            result: string;
            profit: number;
            created_at: string;
          };
          
          // Add to history
          const historyEntry: SignalHistory = {
            id: result.id,
            signal: {
              id: result.signal_id,
              asset: result.asset,
              assetIcon: '📊',
              type: result.direction as 'CALL' | 'PUT',
              price: result.entry_price || 0,
              timestamp: new Date(result.created_at),
              timeframe: 'M5',
              expiration: '5 min',
              strength: 3,
              status: 'high_probability',
              isHot: false,
              marketType: 'otc',
              indicators: {
                rsi: { value: 50, signal: 'neutral' },
                macd: { value: 0, signal: 0, histogram: 0, trend: 'neutral' },
                bollinger: { upper: 0, middle: 0, lower: 0, position: 'middle' },
                stochastic: { k: 50, d: 50, signal: 'neutral' },
                movingAverages: { ema9: 0, ema21: 0, sma50: 0, trend: 'neutral' },
                atr: { value: 0, volatility: 'medium' },
                supportResistance: { nearestSupport: 0, nearestResistance: 0, pricePosition: 'middle' },
                confluenceCount: 0,
                confluenceScore: 0,
              },
              confirmations: ['IQ Option Real'],
              result: result.result as SignalResult,
              resultPrice: result.exit_price || 0,
              profit: result.profit,
              resultTime: new Date(result.created_at),
            },
            result: result.result as SignalResult,
            entryPrice: result.entry_price || 0,
            exitPrice: result.exit_price || 0,
            profit: result.profit,
            timestamp: new Date(result.created_at),
            resultTimestamp: new Date(result.created_at),
          };

          setHistory(prev => {
            // Check if exists - update or add
            const existingIndex = prev.findIndex(h => h.id === result.id);
            
            if (existingIndex >= 0) {
              // Update existing entry
              const updated = [...prev];
              updated[existingIndex] = historyEntry;
              const newStats = recalculateStats(updated);
              setStats(newStats);
              return updated;
            } else {
              // Add new entry
              const newHistory = [historyEntry, ...prev];
              const newStats = recalculateStats(newHistory);
              setStats(newStats);
              return newHistory;
            }
          });
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status:', status);
      });

    return () => {
      console.log('🔕 Removing realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [recalculateStats]);

  // Fetch results from IQ Option periodically
  const fetchIQOptionResults = useCallback(async () => {
    try {
      console.log('🔄 Checking IQ Option for results...');
      const { data, error } = await supabase.functions.invoke('iqoption-check-results');
      
      if (error) {
        console.error('Error fetching IQ Option results:', error);
        return { success: false, error: error.message };
      }
      
      console.log('📊 IQ Option results:', data);
      return data;
    } catch (err) {
      console.error('Failed to fetch IQ Option results:', err);
      return { success: false, error: String(err) };
    }
  }, []);

  // Poll for results every 60 seconds when there are pending operations
  useEffect(() => {
    const checkForPendingResults = async () => {
      const hasPending = history.some(h => h.result === 'pending');
      if (hasPending) {
        console.log('📡 Checking for pending results...');
        await fetchIQOptionResults();
      }
    };

    // Initial check after 30 seconds
    const initialTimeout = setTimeout(checkForPendingResults, 30000);
    
    // Then check every 60 seconds
    const interval = setInterval(checkForPendingResults, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [history, fetchIQOptionResults]);

  // Adicionar sinal ao histórico e simular resultado automaticamente
  const addSignalWithSimulation = useCallback((signal: TradingSignal) => {
    const result = simulateResult(signal.indicators.confluenceScore);
    const exitPrice = simulateExitPrice(signal, result);
    
    const tradeAmount = 10;
    const payout = 0.87;
    let profit = 0;
    
    if (result === 'win') {
      profit = tradeAmount * payout;
    } else if (result === 'loss') {
      profit = -tradeAmount;
    }

    const historyEntry: SignalHistory = {
      id: crypto.randomUUID(),
      signal: {
        ...signal,
        result,
        resultPrice: exitPrice,
        profit,
        resultTime: new Date(),
      },
      result,
      entryPrice: signal.price,
      exitPrice,
      profit,
      timestamp: signal.timestamp,
      resultTimestamp: new Date(),
    };

    setHistory(prev => {
      const newHistory = [historyEntry, ...prev];
      const newStats = recalculateStats(newHistory);
      setStats(newStats);
      return newHistory;
    });

    return { result, profit, exitPrice };
  }, [recalculateStats]);

  // Registrar resultado manualmente
  const registerManualResult = useCallback((signalId: string, result: SignalResult) => {
    setHistory(prev => {
      const updated = prev.map(h => {
        if (h.signal.id === signalId) {
          const exitPrice = simulateExitPrice(h.signal, result);
          const tradeAmount = 10;
          const payout = 0.87;
          let profit = 0;
          
          if (result === 'win') {
            profit = tradeAmount * payout;
          } else if (result === 'loss') {
            profit = -tradeAmount;
          }

          return {
            ...h,
            result,
            exitPrice,
            profit,
            resultTimestamp: new Date(),
            signal: {
              ...h.signal,
              result,
              resultPrice: exitPrice,
              profit,
              resultTime: new Date(),
            }
          };
        }
        return h;
      });
      
      const newStats = recalculateStats(updated);
      setStats(newStats);
      return updated;
    });
  }, [recalculateStats]);


  // Limpar histórico
  const clearHistory = useCallback(() => {
    setHistory([]);
    setStats({
      totalSignals: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      pending: 0,
      winRate: 0,
      totalProfit: 0,
      streak: 0,
      streakType: 'none',
    });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STATS_KEY);
  }, []);

  // Obter histórico de hoje
  const getTodayHistory = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return history.filter(h => new Date(h.timestamp) >= today);
  }, [history]);

  // Stats de hoje
  const getTodayStats = useCallback((): TradingStats => {
    const todayHistory = getTodayHistory();
    return recalculateStats(todayHistory);
  }, [getTodayHistory, recalculateStats]);

  return {
    history,
    stats,
    todayStats: getTodayStats(),
    addSignalWithSimulation,
    registerManualResult,
    clearHistory,
    getTodayHistory,
    fetchIQOptionResults,
  };
}