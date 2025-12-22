import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingSignal } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';
import { useAISignalAnalyzer } from '@/hooks/useAISignalAnalyzer';
import { iqOptionClient } from '@/services/IQOptionClient';

const STORAGE_KEY = 'autotrading_config';
const MAX_TRADE_DELAY_MS = 2000; // Maximum 2 seconds delay

interface AutoTradingConfig {
  enabled: boolean;
  amount: number;
  minConfluence: number;
  maxDailyTrades: number;
  todayTrades: number;
  // Profit target settings
  profitTargetType: 'none' | 'percentage' | 'value';
  profitTargetValue: number;
  // AI analysis settings
  useAIAnalysis: boolean;
  aiMinConfidence: number;
}

interface TradeResult {
  signal: TradingSignal;
  success: boolean;
  tradeId?: string;
  error?: string;
}

export function useAutoTrading() {
  const { toast } = useToast();
  const { analyzeSignals, filterByAIRecommendation, isAnalyzing } = useAISignalAnalyzer();
  const processedSignals = useRef<Set<string>>(new Set());
  const tradingInProgress = useRef<Set<string>>(new Set());
  
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
        return {
          ...parsed,
          // Ensure new fields exist
          profitTargetType: parsed.profitTargetType || 'none',
          profitTargetValue: parsed.profitTargetValue || 0,
          useAIAnalysis: parsed.useAIAnalysis ?? true,
          aiMinConfidence: parsed.aiMinConfidence || 70,
        };
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
      profitTargetType: 'none',
      profitTargetValue: 0,
      useAIAnalysis: true,
      aiMinConfidence: 70,
    };
  });

  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const [lastTradeResult, setLastTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTradesCount, setActiveTradesCount] = useState(0);

  // Persist config
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const updateConfig = useCallback((updates: Partial<AutoTradingConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Map timeframe to expiration in minutes
  const getExpirationFromTimeframe = (timeframe: string): number => {
    switch (timeframe) {
      case 'M1': return 1;
      case 'M5': return 5;
      case 'M15': return 15;
      case 'M30': return 30;
      case 'H1': return 60;
      default: return 5; // Default to 5 minutes
    }
  };

  // Place a single trade with timeout - uses client-side connection
  const placeSingleTrade = useCallback(async (signal: TradingSignal): Promise<TradeResult> => {
    const startTime = Date.now();
    
    try {
      const expiration = getExpirationFromTimeframe(signal.timeframe);
      
      console.log(`🎯 [${signal.asset}] Placing trade via client: ${signal.type} $${config.amount}`);
      
      // Check if client is connected
      if (!iqOptionClient.isConnected()) {
        console.error(`❌ [${signal.asset}] IQ Option client not connected`);
        return { signal, success: false, error: 'IQ Option not connected' };
      }
      
      // Place trade via client-side WebSocket
      const result = await iqOptionClient.placeTrade(
        signal.asset,
        signal.type.toLowerCase() as 'call' | 'put',
        config.amount,
        expiration
      );
      
      const elapsed = Date.now() - startTime;
      console.log(`⏱️ [${signal.asset}] Trade completed in ${elapsed}ms`);

      if (result.success) {
        console.log(`✅ [${signal.asset}] Trade executed successfully`);
        
        // Log trade to database
        await supabase
          .from('operation_results')
          .insert({
            signal_id: signal.id,
            asset: signal.asset,
            direction: signal.type.toUpperCase(),
            entry_price: config.amount,
            result: 'pending',
            profit: 0,
            iq_option_id: result.tradeId,
          });
        
        return { signal, success: true, tradeId: result.tradeId };
      } else {
        console.error(`❌ [${signal.asset}] Trade failed:`, result.error);
        return { signal, success: false, error: result.error || 'Trade failed' };
      }
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.error(`❌ [${signal.asset}] Trade error after ${elapsed}ms:`, err);
      return { signal, success: false, error: String(err) };
    }
  }, [config.amount]);

  // Place trades on multiple signals simultaneously
  const placeTradesSimultaneously = useCallback(async (signals: TradingSignal[]): Promise<TradeResult[]> => {
    if (signals.length === 0) return [];
    
    setIsPlacingTrade(true);
    setActiveTradesCount(signals.length);
    
    console.log(`🚀 Placing ${signals.length} trades simultaneously...`);
    const startTime = Date.now();
    
    // Mark all signals as being traded
    signals.forEach(signal => tradingInProgress.current.add(signal.id));
    
    try {
      // Execute all trades in parallel
      const results = await Promise.all(
        signals.map(signal => placeSingleTrade(signal))
      );
      
      const elapsed = Date.now() - startTime;
      console.log(`⏱️ All ${signals.length} trades completed in ${elapsed}ms`);
      
      // Process results
      const successfulTrades = results.filter(r => r.success);
      const failedTrades = results.filter(r => !r.success);
      
      // Update trade count
      if (successfulTrades.length > 0) {
        setConfig(prev => ({
          ...prev,
          todayTrades: prev.todayTrades + successfulTrades.length,
        }));
        
        // Show success toast
        const successAssets = successfulTrades.map(r => r.signal.asset).join(', ');
        toast({
          title: `✅ ${successfulTrades.length} entrada(s) executada(s)!`,
          description: successAssets,
        });
        
        setLastTradeResult({ 
          success: true, 
          message: `${successfulTrades.length} trades executados: ${successAssets}` 
        });
      }
      
      // Show error toast for failed trades
      if (failedTrades.length > 0) {
        const failedAssets = failedTrades.map(r => r.signal.asset).join(', ');
        toast({
          title: `❌ ${failedTrades.length} entrada(s) falhou`,
          description: failedAssets,
          variant: 'destructive',
        });
        
        if (successfulTrades.length === 0) {
          setLastTradeResult({ 
            success: false, 
            message: `Falhou: ${failedAssets}` 
          });
        }
      }
      
      // Mark all as processed
      signals.forEach(signal => {
        processedSignals.current.add(signal.id);
        tradingInProgress.current.delete(signal.id);
      });
      
      return results;
    } finally {
      setIsPlacingTrade(false);
      setActiveTradesCount(0);
    }
  }, [placeSingleTrade, toast]);

  // Legacy single trade function (for manual trades)
  const placeTrade = useCallback(async (signal: TradingSignal) => {
    const results = await placeTradesSimultaneously([signal]);
    const result = results[0];
    if (result) {
      return { success: result.success, tradeId: result.tradeId, error: result.error };
    }
    return { success: false, error: 'No result' };
  }, [placeTradesSimultaneously]);

  // Check and auto trade with profit target support and AI analysis
  const checkAndAutoTrade = useCallback(async (signals: TradingSignal[], currentDailyProfit?: number, currentBalance?: number) => {
    if (!config.enabled) return;
    
    // Check if profit target is reached
    if (config.profitTargetType !== 'none' && config.profitTargetValue > 0 && currentDailyProfit !== undefined) {
      let targetReached = false;
      
      if (config.profitTargetType === 'percentage' && currentBalance !== undefined) {
        const initialBalance = currentBalance - currentDailyProfit;
        const targetProfit = (initialBalance * config.profitTargetValue) / 100;
        targetReached = currentDailyProfit >= targetProfit;
      } else if (config.profitTargetType === 'value') {
        targetReached = currentDailyProfit >= config.profitTargetValue;
      }
      
      if (targetReached) {
        console.log('🎯 Profit target reached! Disabling auto trading.');
        setConfig(prev => ({ ...prev, enabled: false }));
        toast({
          title: '🎉 Meta de lucro atingida!',
          description: `Lucro de $${currentDailyProfit.toFixed(2)} - Auto Trading pausado.`,
        });
        return;
      }
    }
    
    // Check daily limit
    const remainingTrades = config.maxDailyTrades - config.todayTrades;
    if (remainingTrades <= 0) {
      console.log('Daily trade limit reached');
      return;
    }

    // Find high confluence signals that haven't been traded yet and aren't being traded
    let eligibleSignals = signals.filter(signal => 
      signal.indicators.confluenceScore >= config.minConfluence &&
      !processedSignals.current.has(signal.id) &&
      !tradingInProgress.current.has(signal.id)
    );

    if (eligibleSignals.length === 0) return;

    // If AI analysis is enabled, filter signals through AI
    if (config.useAIAnalysis && eligibleSignals.length > 0) {
      console.log('🤖 Running AI analysis on eligible signals...');
      
      try {
        const aiResult = await analyzeSignals(eligibleSignals);
        
        if (aiResult.analyzedSignals.length > 0) {
          // Filter to only signals AI recommends to EXECUTE with minimum confidence
          const aiApprovedSignals = filterByAIRecommendation(
            eligibleSignals, 
            aiResult, 
            config.aiMinConfidence
          );
          
          if (aiApprovedSignals.length === 0) {
            console.log('🤖 AI rejected all signals - waiting for better opportunity');
            
            // Log rejected signals for debugging
            aiResult.analyzedSignals.forEach(analysis => {
              console.log(`   ❌ ${analysis.asset}: ${analysis.recommendation} (${analysis.confidence}%) - ${analysis.reason}`);
            });
            return;
          }
          
          // Log AI decisions
          aiResult.analyzedSignals.forEach(analysis => {
            const icon = analysis.recommendation === 'EXECUTE' ? '✅' : '❌';
            console.log(`   ${icon} ${analysis.asset}: ${analysis.recommendation} (${analysis.confidence}%) - ${analysis.reason}`);
          });
          
          eligibleSignals = aiApprovedSignals;
          
          toast({
            title: '🤖 IA aprovou sinais',
            description: `${eligibleSignals.length} sinal(is) de alta probabilidade`,
          });
        }
      } catch (err) {
        console.error('AI analysis failed, falling back to confluence only:', err);
        // Continue with original eligible signals if AI fails
      }
    }

    // Take up to remaining daily limit
    const signalsToTrade = eligibleSignals.slice(0, remainingTrades);
    
    console.log(`🚀 Auto-trading ${signalsToTrade.length} AI-approved signals:`);
    signalsToTrade.forEach(s => {
      console.log(`   - ${s.asset} ${s.type} (${s.indicators.confluenceScore}%)`);
    });
    
    // Execute all trades simultaneously
    await placeTradesSimultaneously(signalsToTrade);
  }, [config.enabled, config.minConfluence, config.todayTrades, config.maxDailyTrades, config.profitTargetType, config.profitTargetValue, config.useAIAnalysis, config.aiMinConfidence, placeTradesSimultaneously, analyzeSignals, filterByAIRecommendation, toast]);

  const resetDailyTrades = useCallback(() => {
    setConfig(prev => ({ ...prev, todayTrades: 0 }));
    processedSignals.current.clear();
    tradingInProgress.current.clear();
  }, []);

  return {
    config,
    updateConfig,
    isPlacingTrade,
    isAnalyzingAI: isAnalyzing,
    lastTradeResult,
    activeTradesCount,
    placeTrade,
    checkAndAutoTrade,
    resetDailyTrades,
  };
}