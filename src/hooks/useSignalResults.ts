import { useState, useCallback, useEffect } from 'react';
import { TradingSignal, SignalResult, TradingStats, SignalHistory } from '@/types/trading';

const STORAGE_KEY = 'signal_history';
const STATS_KEY = 'trading_stats';

// Simular resultado baseado na confluência (quanto maior, mais chance de WIN)
function simulateResult(confluenceScore: number): SignalResult {
  // Base win rate: 50% + (confluenceScore - 50) * 0.5
  // Ex: 100% confluência = 75% chance de win
  // Ex: 66% confluência = 58% chance de win
  const baseWinRate = 0.5 + ((confluenceScore - 50) / 100) * 0.5;
  const random = Math.random();
  
  // 5% chance de empate
  if (random < 0.05) return 'tie';
  
  // Chance de win baseada na confluência
  if (random < baseWinRate) return 'win';
  
  return 'loss';
}

// Simular variação de preço
function simulateExitPrice(signal: TradingSignal, result: SignalResult): number {
  const variation = signal.price * 0.001; // 0.1% variação
  
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

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [stats]);

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

  // Adicionar sinal ao histórico e simular resultado automaticamente
  const addSignalWithSimulation = useCallback((signal: TradingSignal) => {
    const result = simulateResult(signal.indicators.confluenceScore);
    const exitPrice = simulateExitPrice(signal, result);
    
    // Calcular lucro (simulando R$10 por operação)
    const tradeAmount = 10;
    const payout = 0.87; // 87% payout típico
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
      const newHistory = [historyEntry, ...prev].slice(0, 100); // Manter últimos 100
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
  };
}
