import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingSignal } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';

const STORAGE_KEY = 'autotrading_config';

interface AutoTradingConfig {
  enabled: boolean;
  amount: number;
  minConfluence: number;
  maxDailyTrades: number;
  todayTrades: number;
}

export function useAutoTrading() {
  const { toast } = useToast();
  const processedSignals = useRef<Set<string>>(new Set());
  
  const [config, setConfig] = useState<AutoTradingConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Reset daily trades if it's a new day
        const lastDate = localStorage.getItem('autotrading_last_date');
        const today = new Date().toDateString();
        if (lastDate !== today) {
          localStorage.setItem('autotrading_last_date', today);
          return { ...parsed, todayTrades: 0 };
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load autotrading config:', e);
    }
    return {
      enabled: false,
      amount: 10,
      minConfluence: 86,
      maxDailyTrades: 10,
      todayTrades: 0,
    };
  });

  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const [lastTradeResult, setLastTradeResult] = useState<{ success: boolean; message: string } | null>(null);

  // Persist config
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const updateConfig = useCallback((updates: Partial<AutoTradingConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const placeTrade = useCallback(async (signal: TradingSignal) => {
    if (isPlacingTrade) {
      console.log('Already placing a trade, skipping...');
      return { success: false, error: 'Trade in progress' };
    }

    setIsPlacingTrade(true);
    
    try {
      // Determine expiration based on timeframe
      const expiration = signal.timeframe === 'M1' ? 1 : 5;
      
      console.log(`🎯 Placing trade: ${signal.asset} ${signal.type} $${config.amount}`);
      
      const { data, error } = await supabase.functions.invoke('iqoption-place-trade', {
        body: {
          asset: signal.asset,
          direction: signal.type.toLowerCase(),
          amount: config.amount,
          expiration,
          signalId: signal.id,
        },
      });

      if (error) {
        console.error('Trade error:', error);
        setLastTradeResult({ success: false, message: error.message });
        toast({
          title: '❌ Erro na entrada',
          description: error.message,
          variant: 'destructive',
        });
        return { success: false, error: error.message };
      }

      if (data?.success) {
        setLastTradeResult({ success: true, message: `Trade executado: ${signal.asset} ${signal.type}` });
        
        // Update today's trade count
        setConfig(prev => ({
          ...prev,
          todayTrades: prev.todayTrades + 1,
        }));
        
        toast({
          title: '✅ Entrada executada!',
          description: `${signal.type} em ${signal.asset} - R$${config.amount}`,
        });
        
        return { success: true, tradeId: data.tradeId };
      } else {
        setLastTradeResult({ success: false, message: data?.error || 'Trade failed' });
        toast({
          title: '❌ Entrada falhou',
          description: data?.error || 'Erro desconhecido',
          variant: 'destructive',
        });
        return { success: false, error: data?.error };
      }
    } catch (err) {
      console.error('Failed to place trade:', err);
      const errorMsg = String(err);
      setLastTradeResult({ success: false, message: errorMsg });
      return { success: false, error: errorMsg };
    } finally {
      setIsPlacingTrade(false);
    }
  }, [config.amount, isPlacingTrade, toast]);

  const checkAndAutoTrade = useCallback(async (signals: TradingSignal[]) => {
    if (!config.enabled) return;
    
    // Check daily limit
    if (config.todayTrades >= config.maxDailyTrades) {
      console.log('Daily trade limit reached');
      return;
    }

    // Find high confluence signals that haven't been traded yet
    const eligibleSignals = signals.filter(signal => 
      signal.indicators.confluenceScore >= config.minConfluence &&
      !processedSignals.current.has(signal.id)
    );

    if (eligibleSignals.length === 0) return;

    // Take the first eligible signal
    const signal = eligibleSignals[0];
    
    // Mark as processed to avoid duplicate trades
    processedSignals.current.add(signal.id);
    
    console.log(`🤖 Auto-trading signal detected: ${signal.asset} ${signal.type} (${signal.indicators.confluenceScore}%)`);
    
    await placeTrade(signal);
  }, [config.enabled, config.minConfluence, config.todayTrades, config.maxDailyTrades, placeTrade]);

  const resetDailyTrades = useCallback(() => {
    setConfig(prev => ({ ...prev, todayTrades: 0 }));
    processedSignals.current.clear();
  }, []);

  return {
    config,
    updateConfig,
    isPlacingTrade,
    lastTradeResult,
    placeTrade,
    checkAndAutoTrade,
    resetDailyTrades,
  };
}