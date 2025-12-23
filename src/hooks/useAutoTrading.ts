import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingSignal } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';
import { useAISignalAnalyzer } from '@/hooks/useAISignalAnalyzer';
import { getCachedAssets } from '@/hooks/useAvailableAssets';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'autotrading_config';
const MAX_TRADE_DELAY_MS = 2000; // Maximum 2 seconds delay

interface AutoTradingConfig {
  enabled: boolean;
  amount: number;
  minConfluence: number;
  maxDailyTrades: number;
  dailyLimitEnabled: boolean;
  todayTrades: number;
  // Profit target settings
  profitTargetType: 'none' | 'percentage' | 'value';
  profitTargetValue: number;
  // AI analysis settings
  useAIAnalysis: boolean;
  aiMinConfidence: number;
  // Scaled entries strategy
  useScaledEntries: boolean;
  scaledEntriesCount: number; // Number of entries per asset (2-5)
  scaledEntriesDelay: number; // Delay between entries in seconds (5-30)
}

interface TradeResult {
  signal: TradingSignal;
  success: boolean;
  tradeId?: string;
  error?: string;
}

const DEFAULT_CONFIG: AutoTradingConfig = {
  enabled: false,
  amount: 10,
  minConfluence: 95,
  maxDailyTrades: 3,
  dailyLimitEnabled: true,
  todayTrades: 0,
  profitTargetType: 'none',
  profitTargetValue: 0,
  useAIAnalysis: true,
  aiMinConfidence: 90,
  useScaledEntries: false,
  scaledEntriesCount: 3,
  scaledEntriesDelay: 10,
};

export function useAutoTrading() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { analyzeSignals, filterByAIRecommendation, isAnalyzing, error: aiError } = useAISignalAnalyzer();
  const processedSignals = useRef<Set<string>>(new Set());
  const lastAIErrorShown = useRef<number>(0);
  const AI_ERROR_COOLDOWN = 60000; // Only show AI error toast once per minute
  const tradingInProgress = useRef<Set<string>>(new Set());
  const activeAssetTrades = useRef<Set<string>>(new Set()); // Track assets with active trades
  const settingsLoaded = useRef(false);
  const isSavingToDb = useRef(false);
  
  const [config, setConfig] = useState<AutoTradingConfig>(() => {
    // Load from localStorage initially for fast startup
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const lastDate = localStorage.getItem('autotrading_last_date');
        const today = new Date().toDateString();
        if (lastDate !== today) {
          localStorage.setItem('autotrading_last_date', today);
          return { ...parsed, todayTrades: 0 };
        }
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load autotrading config:', e);
    }
    return DEFAULT_CONFIG;
  });

  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const [lastTradeResult, setLastTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTradesCount, setActiveTradesCount] = useState(0);
  const lastCheckResultsTime = useRef<number>(0);
  const CHECK_RESULTS_INTERVAL = 30000; // 30 seconds

  // Load settings from database when user is available
  useEffect(() => {
    if (!user?.id || settingsLoaded.current) return;

    const loadFromDatabase = async () => {
      try {
        const { data, error } = await supabase
          .from('user_trading_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading settings from DB:', error);
          return;
        }

        if (data) {
          const dbConfig: AutoTradingConfig = {
            enabled: data.auto_trading_enabled,
            amount: Number(data.trade_amount),
            minConfluence: data.min_confluence,
            maxDailyTrades: data.max_daily_trades,
            dailyLimitEnabled: data.daily_limit_enabled ?? true,
            useAIAnalysis: data.use_ai_analysis,
            aiMinConfidence: data.ai_min_confidence,
            profitTargetType: data.profit_target_type as 'none' | 'percentage' | 'value',
            profitTargetValue: Number(data.profit_target_value),
            // Keep local values for these
            todayTrades: config.todayTrades,
            useScaledEntries: config.useScaledEntries,
            scaledEntriesCount: config.scaledEntriesCount,
            scaledEntriesDelay: config.scaledEntriesDelay,
          };
          
          setConfig(prev => ({ ...prev, ...dbConfig }));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dbConfig));
          console.log('✅ Settings loaded from database');
        }
        
        settingsLoaded.current = true;
      } catch (err) {
        console.error('Failed to load settings from database:', err);
      }
    };

    loadFromDatabase();
  }, [user?.id]);

  // Save settings to database when config changes
  const saveToDatabase = useCallback(async (newConfig: AutoTradingConfig) => {
    if (!user?.id || isSavingToDb.current) return;

    isSavingToDb.current = true;
    try {
      const dbData = {
        user_id: user.id,
        auto_trading_enabled: newConfig.enabled,
        trade_amount: newConfig.amount,
        min_confluence: newConfig.minConfluence,
        max_daily_trades: newConfig.maxDailyTrades,
        daily_limit_enabled: newConfig.dailyLimitEnabled,
        use_ai_analysis: newConfig.useAIAnalysis,
        ai_min_confidence: newConfig.aiMinConfidence,
        profit_target_type: newConfig.profitTargetType,
        profit_target_value: newConfig.profitTargetValue,
      };

      const { error } = await supabase
        .from('user_trading_settings')
        .upsert(dbData, { onConflict: 'user_id' });

      if (error) {
        console.error('Error saving settings to DB:', error);
      } else {
        console.log('✅ Settings saved to database');
      }
    } catch (err) {
      console.error('Failed to save settings to database:', err);
    } finally {
      isSavingToDb.current = false;
    }
  }, [user?.id]);

  // Persist config to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // Show toast when AI credits are exhausted
  useEffect(() => {
    if (aiError && aiError.includes('credits')) {
      const now = Date.now();
      if (now - lastAIErrorShown.current > AI_ERROR_COOLDOWN) {
        lastAIErrorShown.current = now;
        toast({
          title: "⚠️ Créditos de IA Esgotados",
          description: "Sistema usando modo fallback baseado em confluência. Adicione créditos para análise completa.",
          variant: "destructive",
          duration: 10000,
        });
      }
    }
  }, [aiError, toast]);

  // Load active trades from database on mount and periodically refresh
  const refreshActiveAssetTrades = useCallback(async () => {
    try {
      // Get all pending trades from last 30 minutes (active trades)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: activeOps } = await supabase
        .from('operation_results')
        .select('asset, result')
        .eq('result', 'pending')
        .gte('created_at', thirtyMinutesAgo);
      
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

  // Check if asset has active trade in database (real-time check)
  const hasActiveTradeForAsset = useCallback(async (asset: string): Promise<boolean> => {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data, count } = await supabase
        .from('operation_results')
        .select('id', { count: 'exact', head: true })
        .eq('result', 'pending')
        .ilike('asset', asset)
        .gte('created_at', thirtyMinutesAgo);
      
      return (count ?? 0) > 0;
    } catch (err) {
      console.error(`Failed to check active trade for ${asset}:`, err);
      return true; // Assume there's an active trade on error to be safe
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
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      // Save to database in background (don't block UI)
      if (user?.id) {
        saveToDatabase(newConfig);
      }
      return newConfig;
    });
  }, [user?.id, saveToDatabase]);

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

  // Helper to delay execution
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Place a single trade via Edge Function (server-side)
  const placeSingleTrade = useCallback(async (signal: TradingSignal, entryNumber?: number): Promise<TradeResult> => {
    const startTime = Date.now();
    const entryLabel = entryNumber ? ` [Entrada ${entryNumber}]` : '';
    
    try {
      const expiration = getExpirationFromTimeframe(signal.timeframe);
      
      console.log(`🎯 [${signal.asset}]${entryLabel} Placing trade via Edge Function: ${signal.type} $${config.amount}`);
      
      // Call Edge Function directly - no need for frontend WebSocket connection
      const { data, error } = await supabase.functions.invoke('iqoption-place-trade', {
        body: {
          asset: signal.asset,
          direction: signal.type.toLowerCase(),
          amount: config.amount,
          expiration: expiration,
          signalId: `${signal.id}${entryNumber ? `-${entryNumber}` : ''}`,
          isAutoTrade: true,
          isAIAnalyzed: config.useAIAnalysis,
          timeframe: signal.timeframe, // Include timeframe for history tracking
        },
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`⏱️ [${signal.asset}]${entryLabel} Trade completed in ${elapsed}ms`);

      if (error) {
        console.error(`❌ [${signal.asset}]${entryLabel} Edge Function error:`, error);
        return { signal, success: false, error: 'Erro ao conectar com servidor' };
      }

      if (data?.success) {
        console.log(`✅ [${signal.asset}]${entryLabel} Trade executed successfully, ID: ${data.tradeId}`);
        return { signal, success: true, tradeId: data.tradeId };
      } else {
        console.error(`❌ [${signal.asset}]${entryLabel} Trade failed:`, data?.error);
        return { signal, success: false, error: data?.error || 'Trade failed' };
      }
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.error(`❌ [${signal.asset}]${entryLabel} Trade error after ${elapsed}ms:`, err);
      return { signal, success: false, error: String(err) };
    }
  }, [config.amount, config.useAIAnalysis]);

  // Place scaled entries - multiple entries on the same asset with delay
  const placeScaledEntries = useCallback(async (signal: TradingSignal): Promise<TradeResult[]> => {
    const results: TradeResult[] = [];
    const { scaledEntriesCount, scaledEntriesDelay } = config;
    
    console.log(`📊 [${signal.asset}] Starting scaled entries: ${scaledEntriesCount} entries with ${scaledEntriesDelay}s delay`);
    
    for (let i = 1; i <= scaledEntriesCount; i++) {
      // Place trade
      const result = await placeSingleTrade(signal, i);
      results.push(result);
      
      // If trade failed, stop placing more entries
      if (!result.success) {
        console.log(`⛔ [${signal.asset}] Stopping scaled entries after failure on entry ${i}`);
        break;
      }
      
      // Wait before next entry (except for last one)
      if (i < scaledEntriesCount) {
        console.log(`⏳ [${signal.asset}] Waiting ${scaledEntriesDelay}s before entry ${i + 1}...`);
        await delay(scaledEntriesDelay * 1000);
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`📈 [${signal.asset}] Scaled entries complete: ${successCount}/${scaledEntriesCount} successful`);
    
    return results;
  }, [config.scaledEntriesCount, config.scaledEntriesDelay, placeSingleTrade]);

  // Place trades on multiple signals simultaneously (one per asset)
  const placeTradesSimultaneously = useCallback(async (signals: TradingSignal[]): Promise<TradeResult[]> => {
    if (signals.length === 0) return [];
    
    // Refresh active asset trades before filtering
    await refreshActiveAssetTrades();
    
    // Filter out signals for assets that already have active trades (from local cache)
    const signalsToTrade = signals.filter(signal => {
      const assetKey = signal.asset.toUpperCase();
      if (activeAssetTrades.current.has(assetKey)) {
        console.log(`⏸️ [${signal.asset}] Skipped - already has active trade (cache)`);
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
    
    // Double-check with database for each unique asset (real-time verification)
    const verifiedSignals: TradingSignal[] = [];
    for (const signal of uniqueAssetSignals) {
      const hasActive = await hasActiveTradeForAsset(signal.asset);
      if (hasActive) {
        console.log(`⏸️ [${signal.asset}] Skipped - confirmed active trade in database`);
        activeAssetTrades.current.add(signal.asset.toUpperCase());
      } else {
        verifiedSignals.push(signal);
      }
    }
    
    if (verifiedSignals.length === 0) {
      console.log('⏸️ All signals skipped after database verification');
      return [];
    }
    
    console.log(`🎯 Trading ${verifiedSignals.length} unique assets (skipped ${signalsToTrade.length - verifiedSignals.length} with active trades)`);
    
    const useScaled = config.useScaledEntries;
    const expectedTrades = useScaled ? verifiedSignals.length * config.scaledEntriesCount : verifiedSignals.length;
    
    setIsPlacingTrade(true);
    setActiveTradesCount(expectedTrades);
    
    const strategyType = useScaled ? `entradas escalonadas (${config.scaledEntriesCount}x)` : 'entrada única';
    console.log(`🚀 Placing ${verifiedSignals.length} trades usando ${strategyType}...`);
    const startTime = Date.now();
    
    // Mark all signals and assets as being traded
    verifiedSignals.forEach(signal => {
      tradingInProgress.current.add(signal.id);
      activeAssetTrades.current.add(signal.asset.toUpperCase());
    });
    
    try {
      let allResults: TradeResult[] = [];
      
      if (useScaled) {
        // Execute scaled entries sequentially for each asset (but assets in parallel)
        const scaledResultsPerAsset = await Promise.all(
          verifiedSignals.map(signal => placeScaledEntries(signal))
        );
        allResults = scaledResultsPerAsset.flat();
      } else {
        // Execute single trade per asset in parallel
        allResults = await Promise.all(
          verifiedSignals.map(signal => placeSingleTrade(signal))
        );
      }
      
      const elapsed = Date.now() - startTime;
      console.log(`⏱️ All ${allResults.length} trades completed in ${elapsed}ms`);
      
      // Process results
      const successfulTrades = allResults.filter(r => r.success);
      const failedTrades = allResults.filter(r => !r.success);
      
      // Update trade count
      if (successfulTrades.length > 0) {
        setConfig(prev => ({
          ...prev,
          todayTrades: prev.todayTrades + successfulTrades.length,
        }));
        
        // Show success toast with scaled info
        const uniqueSuccessAssets = [...new Set(successfulTrades.map(r => r.signal.asset))];
        const description = useScaled 
          ? `${successfulTrades.length} entradas em ${uniqueSuccessAssets.join(', ')}`
          : uniqueSuccessAssets.join(', ');
        
        toast({
          title: `✅ ${successfulTrades.length} entrada(s) executada(s)!`,
          description,
        });
        
        setLastTradeResult({ 
          success: true, 
          message: `${successfulTrades.length} trades executados: ${description}` 
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
      verifiedSignals.forEach(signal => {
        processedSignals.current.add(signal.id);
        tradingInProgress.current.delete(signal.id);
      });
      
      return allResults;
    } finally {
      setIsPlacingTrade(false);
      setActiveTradesCount(0);
    }
  }, [config.useScaledEntries, config.scaledEntriesCount, placeSingleTrade, placeScaledEntries, refreshActiveAssetTrades, hasActiveTradeForAsset, toast]);

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
    
    // Check daily limit (only if enabled)
    if (config.dailyLimitEnabled) {
      const remainingTrades = config.maxDailyTrades - config.todayTrades;
      if (remainingTrades <= 0) {
        console.log('Daily trade limit reached');
        return;
      }
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

    // Take up to remaining daily limit (or all if limit is disabled)
    const maxSignals = config.dailyLimitEnabled 
      ? config.maxDailyTrades - config.todayTrades 
      : eligibleSignals.length;
    const signalsToTrade = eligibleSignals.slice(0, Math.max(0, maxSignals));
    
    console.log(`🚀 Auto-trading ${signalsToTrade.length} AI-approved signals:`);
    signalsToTrade.forEach(s => {
      console.log(`   - ${s.asset} ${s.type} (${s.indicators.confluenceScore}%)`);
    });
    
    // Execute all trades simultaneously
    await placeTradesSimultaneously(signalsToTrade);
  }, [config.enabled, config.minConfluence, config.todayTrades, config.maxDailyTrades, config.dailyLimitEnabled, config.profitTargetType, config.profitTargetValue, config.useAIAnalysis, config.aiMinConfidence, placeTradesSimultaneously, analyzeSignals, filterByAIRecommendation, toast]);

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