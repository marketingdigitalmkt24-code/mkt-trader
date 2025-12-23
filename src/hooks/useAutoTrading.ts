import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingSignal } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';
import { useAISignalAnalyzer } from '@/hooks/useAISignalAnalyzer';
import { getCachedAssets } from '@/hooks/useAvailableAssets';

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
  const activeAssetTrades = useRef<Set<string>>(new Set()); // Track assets with active trades
  
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
      minConfluence: 95, // Increased - more selective
      maxDailyTrades: 3, // Reduced - fewer but better trades
      todayTrades: 0,
      profitTargetType: 'none',
      profitTargetValue: 0,
      useAIAnalysis: true,
      aiMinConfidence: 90, // Increased - only very high confidence
    };
  });

  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const [lastTradeResult, setLastTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTradesCount, setActiveTradesCount] = useState(0);
  const lastCheckResultsTime = useRef<number>(0);
  const CHECK_RESULTS_INTERVAL = 30000; // 30 seconds

  // Persist config
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // Load active trades from database on mount and periodically refresh
  const refreshActiveAssetTrades = useCallback(async () => {
    try {
      // Get all pending/tie trades from last 10 minutes (active trades)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: activeOps } = await supabase
        .from('operation_results')
        .select('asset, result')
        .in('result', ['pending', 'tie'])
        .gte('created_at', tenMinutesAgo);
      
      if (activeOps) {
        activeAssetTrades.current.clear();
        activeOps.forEach(op => {
          activeAssetTrades.current.add(op.asset.toUpperCase());
        });
        console.log(`📊 Active trades on assets: ${Array.from(activeAssetTrades.current).join(', ') || 'none'}`);
      }
    } catch (err) {
      console.error('Failed to refresh active asset trades:', err);
    }
  }, []);

  // Periodically check for pending results
  useEffect(() => {
    const checkPendingResults = async () => {
      const now = Date.now();
      if (now - lastCheckResultsTime.current < CHECK_RESULTS_INTERVAL) return;
      
      lastCheckResultsTime.current = now;
      
      try {
        console.log('🔍 Checking pending results...');
        const { data, error } = await supabase.functions.invoke('iqoption-check-results');
        
        if (error) {
          // Silently fail - timeout errors are common
          return;
        }
        
        if (data?.updatedResults > 0 || data?.expiredMarked > 0) {
          console.log(`📊 Results updated: ${data.updatedResults} from IQ Option, ${data.expiredMarked} expired`);
        }
        
        // Refresh active asset trades after checking results
        await refreshActiveAssetTrades();
      } catch (err) {
        // Silently fail
      }
    };

    // Check on mount
    refreshActiveAssetTrades();
    checkPendingResults();

    // Check every 30 seconds
    const interval = setInterval(checkPendingResults, CHECK_RESULTS_INTERVAL);
    
    return () => clearInterval(interval);
  }, [refreshActiveAssetTrades]);

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

  // Place a single trade via Edge Function (server-side)
  const placeSingleTrade = useCallback(async (signal: TradingSignal): Promise<TradeResult> => {
    const startTime = Date.now();
    
    try {
      const expiration = getExpirationFromTimeframe(signal.timeframe);
      
      console.log(`🎯 [${signal.asset}] Placing trade via Edge Function: ${signal.type} $${config.amount}`);
      
      // Call Edge Function directly - no need for frontend WebSocket connection
      const { data, error } = await supabase.functions.invoke('iqoption-place-trade', {
        body: {
          asset: signal.asset,
          direction: signal.type.toLowerCase(),
          amount: config.amount,
          expiration: expiration,
          signalId: signal.id,
          isAutoTrade: true,
          isAIAnalyzed: config.useAIAnalysis,
        },
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`⏱️ [${signal.asset}] Trade completed in ${elapsed}ms`);

      if (error) {
        console.error(`❌ [${signal.asset}] Edge Function error:`, error);
        return { signal, success: false, error: 'Erro ao conectar com servidor' };
      }

      if (data?.success) {
        console.log(`✅ [${signal.asset}] Trade executed successfully, ID: ${data.tradeId}`);
        return { signal, success: true, tradeId: data.tradeId };
      } else {
        console.error(`❌ [${signal.asset}] Trade failed:`, data?.error);
        return { signal, success: false, error: data?.error || 'Trade failed' };
      }
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.error(`❌ [${signal.asset}] Trade error after ${elapsed}ms:`, err);
      return { signal, success: false, error: String(err) };
    }
  }, [config.amount]);

  // Place trades on multiple signals simultaneously (one per asset)
  const placeTradesSimultaneously = useCallback(async (signals: TradingSignal[]): Promise<TradeResult[]> => {
    if (signals.length === 0) return [];
    
    // Filter out signals for assets that already have active trades
    const signalsToTrade = signals.filter(signal => {
      const assetKey = signal.asset.toUpperCase();
      if (activeAssetTrades.current.has(assetKey)) {
        console.log(`⏸️ [${signal.asset}] Skipped - already has active trade`);
        return false;
      }
      return true;
    });
    
    if (signalsToTrade.length === 0) {
      console.log('⏸️ All signals skipped - assets already have active trades');
      return [];
    }
    
    // Only take ONE signal per asset (first one)
    const uniqueAssetSignals: TradingSignal[] = [];
    const seenAssets = new Set<string>();
    
    for (const signal of signalsToTrade) {
      const assetKey = signal.asset.toUpperCase();
      if (!seenAssets.has(assetKey)) {
        seenAssets.add(assetKey);
        uniqueAssetSignals.push(signal);
      }
    }
    
    console.log(`🎯 Trading ${uniqueAssetSignals.length} unique assets (skipped ${signalsToTrade.length - uniqueAssetSignals.length} duplicates)`);
    
    setIsPlacingTrade(true);
    setActiveTradesCount(uniqueAssetSignals.length);
    
    console.log(`🚀 Placing ${uniqueAssetSignals.length} trades (one per asset)...`);
    const startTime = Date.now();
    
    // Mark all signals and assets as being traded
    uniqueAssetSignals.forEach(signal => {
      tradingInProgress.current.add(signal.id);
      activeAssetTrades.current.add(signal.asset.toUpperCase());
    });
    
    try {
      // Execute all trades in parallel
      const results = await Promise.all(
        uniqueAssetSignals.map(signal => placeSingleTrade(signal))
      );
      
      const elapsed = Date.now() - startTime;
      console.log(`⏱️ All ${uniqueAssetSignals.length} trades completed in ${elapsed}ms`);
      
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
        
        // Remove failed assets from active trades so they can be retried
        failedTrades.forEach(r => {
          activeAssetTrades.current.delete(r.signal.asset.toUpperCase());
        });
        
        if (successfulTrades.length === 0) {
          setLastTradeResult({ 
            success: false, 
            message: `Falhou: ${failedAssets}` 
          });
        }
      }
      
      // Mark all as processed
      uniqueAssetSignals.forEach(signal => {
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

    // Filter signals based on REAL asset availability from IQ Option API
    // Get cached assets from the hook (these come from the API with real schedules)
    const availableAssets = getCachedAssets();
    
    // Create a map for quick lookup of open assets
    const openAssetSymbols = new Set(
      availableAssets
        .filter(a => a.schedule?.open !== false) // Only assets marked as open
        .map(a => a.symbol.toLowerCase().replace('/', '').replace('-', ''))
    );
    
    // Helper to check if an asset is currently tradeable
    const isAssetTradeable = (assetSymbol: string): boolean => {
      const normalized = assetSymbol.toLowerCase().replace('/', '').replace('-', '');
      
      // Check if asset is in our open assets list
      if (openAssetSymbols.has(normalized)) return true;
      
      // Also check with common variations
      const variations = [
        normalized,
        normalized.replace('otc', ''),
        normalized + 'otc',
      ];
      
      return variations.some(v => openAssetSymbols.has(v));
    };
    
    // Find signals that haven't been traded yet and are for OPEN assets without active trades
    let eligibleSignals = signals.filter(signal => {
      const notProcessed = !processedSignals.current.has(signal.id);
      const notInProgress = !tradingInProgress.current.has(signal.id);
      
      // Check if this asset already has an active trade
      const assetKey = signal.asset.toUpperCase();
      const hasActiveTrade = activeAssetTrades.current.has(assetKey);
      
      if (hasActiveTrade) {
        return false; // Skip assets with active trades
      }
      
      // Check if this asset is currently available for trading from IQ Option
      const assetAvailable = isAssetTradeable(signal.asset);
      
      if (!assetAvailable) {
        return false; // Skip closed assets
      }
      
      if (config.useAIAnalysis) {
        // AI mode: include all unprocessed signals (AI will filter)
        return notProcessed && notInProgress;
      } else {
        // Non-AI mode: use confluence filter
        return signal.indicators.confluenceScore >= config.minConfluence && notProcessed && notInProgress;
      }
    });

    if (eligibleSignals.length === 0) {
      const activeCount = activeAssetTrades.current.size;
      const openCount = openAssetSymbols.size;
      if (activeCount > 0) {
        console.log(`⏸️ Aguardando ${activeCount} trades ativos finalizarem: ${Array.from(activeAssetTrades.current).join(', ')}`);
      } else {
        console.log(`📊 Aguardando sinais para ${openCount} ativos disponíveis na IQ Option...`);
      }
      return;
    }

    const activeCount = activeAssetTrades.current.size;
    console.log(`🎯 ${eligibleSignals.length} sinais elegíveis (${activeCount} ativos com trades ativos)`);


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
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn('AI analysis failed, using confluence fallback:', errorMsg);
        
        // Show toast for credits exhausted
        if (errorMsg.includes('credits')) {
          toast({
            title: '⚠️ Créditos de IA esgotados',
            description: 'Usando análise de confluência. Adicione créditos em Settings → Workspace → Usage',
            variant: 'destructive',
          });
        }
        
        // Filter by confluence when AI fails
        eligibleSignals = eligibleSignals.filter(
          s => s.indicators.confluenceScore >= config.minConfluence
        );
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