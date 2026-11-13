import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingSignal } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';
import { useAISignalAnalyzer } from '@/hooks/useAISignalAnalyzer';
import { getCachedAssets } from '@/hooks/useAvailableAssets';
import { useAuth } from '@/contexts/AuthContext';
import { serialSettingsWriter } from '@/lib/serial-settings-writer';

const STORAGE_KEY = 'autotrading_config';
const IQ_CONNECTION_CHECK_INTERVAL = 60000; // Check IQ Option connection every 60s
const MAX_TRADE_DELAY_MS = 2000; // Maximum 2 seconds delay
let resultSyncInFlight = false;

interface AutoTradingConfig {
  enabled: boolean;
  amount: number;
  mt5Amount: number;
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
  // IQ Option dynamic stake (% of bank)
  useDynamicStake: boolean;
  iqMaxStakePct: number; // 1-10 (% of bank per trade)
  iqStakeCapUsd: number; // hard ceiling in USD per trade
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
  mt5Amount: 1,
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
  useDynamicStake: false,
  iqMaxStakePct: 5,
  iqStakeCapUsd: 200,
};

export function useAutoTrading() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { analyzeSignals, filterByAIRecommendation, isAnalyzing, error: aiError } = useAISignalAnalyzer();
  const processedSignals = useRef<Set<string>>(new Set());
  const lastAIErrorShown = useRef<number>(0);
  const AI_ERROR_COOLDOWN = 60000;
  const tradingInProgress = useRef<Set<string>>(new Set());
  const activeAssetTrades = useRef<Set<string>>(new Set());
  const settingsLoaded = useRef(false);
  const settingsWriter = useRef(serialSettingsWriter(async (write: () => Promise<void>) => write()));
  const iqOptionConnected = useRef(false);
  const lastIQCheckTime = useRef<number>(0);
  const isCheckingAutoTrade = useRef(false); // MUTEX para evitar execuções concorrentes
  const assetCooldowns = useRef<Map<string, number>>(new Map()); // Cooldown por ativo
  const ASSET_COOLDOWN_MS = 180000; // 180 segundos (3 min) de cooldown por ativo após trade
  
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
  const CHECK_RESULTS_INTERVAL = 10000; // 10 seconds (server cron also checks every 5s)
  const initialSignalsMarked = useRef(false); // Flag to mark DB-loaded signals as processed

  // Check if IQ Option is connected (has active config with recent connection)
  const checkIQOptionConnection = useCallback(async (): Promise<boolean> => {
    const now = Date.now();
    if (now - lastIQCheckTime.current < IQ_CONNECTION_CHECK_INTERVAL && iqOptionConnected.current) {
      return iqOptionConnected.current;
    }
    
    try {
      const { data, error } = await supabase
        .from('iqoption_config')
        .select('last_connected_at')
        .eq('is_active', true)
        .order('last_connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error || !data?.last_connected_at) {
        console.log('❌ IQ Option NÃO conectada - auto trading bloqueado');
        iqOptionConnected.current = false;
        lastIQCheckTime.current = now;
        return false;
      }
      
      // Check if last connection was within the last 5 minutes
      const lastConnected = new Date(data.last_connected_at);
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const isRecent = lastConnected > fiveMinutesAgo;
      
      iqOptionConnected.current = isRecent;
      lastIQCheckTime.current = now;
      
      if (isRecent) {
        console.log('✅ IQ Option conectada - auto trading liberado');
      } else {
        console.log(`⚠️ IQ Option última conexão: ${lastConnected.toISOString()} (muito antiga)`);
      }
      
      return isRecent;
    } catch (err) {
      console.error('Error checking IQ Option connection:', err);
      iqOptionConnected.current = false;
      return false;
    }
  }, []);

  // Load settings from database - works without auth (public RLS policy)
  useEffect(() => {
    if (!user?.id || settingsLoaded.current) return;

    const loadFromDatabase = async () => {
      try {
        // If logged in, load user-specific settings
        let query = supabase
          .from('user_trading_settings')
          .select('*');
        
        if (user?.id) {
          query = query.eq('user_id', user.id);
        }
        
        const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();

        if (error) {
          console.error('Error loading settings from DB:', error);
          return;
        }

        if (data) {
          const dbConfig: AutoTradingConfig = {
            enabled: data.auto_trading_enabled,
            amount: Number(data.trade_amount),
            mt5Amount: Number((data as any).mt5_trade_amount ?? 1),
            minConfluence: data.min_confluence,
            maxDailyTrades: data.max_daily_trades,
            dailyLimitEnabled: data.daily_limit_enabled ?? true,
            useAIAnalysis: true, // FORÇAR IA SEMPRE LIGADA
            aiMinConfidence: data.ai_min_confidence,
            profitTargetType: data.profit_target_type as 'none' | 'percentage' | 'value',
            profitTargetValue: Number(data.profit_target_value),
            todayTrades: config.todayTrades,
            useScaledEntries: config.useScaledEntries,
            scaledEntriesCount: config.scaledEntriesCount,
            scaledEntriesDelay: config.scaledEntriesDelay,
            useDynamicStake: (data as any).use_dynamic_stake ?? false,
            iqMaxStakePct: Number((data as any).iq_max_stake_pct ?? 5),
            iqStakeCapUsd: Number((data as any).iq_stake_cap_usd ?? 200),
          };
          
          setConfig(prev => ({ ...prev, ...dbConfig }));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dbConfig));
          console.log('✅ Settings loaded from database (AI FORÇADA)', dbConfig.enabled ? '🟢 ATIVO' : '⏸️ DESATIVADO');
        }
        
        settingsLoaded.current = true;
      } catch (err) {
        console.error('Failed to load settings from database:', err);
      }
    };

    loadFromDatabase();
    
    // Also check IQ Option connection on mount
    checkIQOptionConnection();
  }, [user?.id, checkIQOptionConnection]);

  // Save settings to database when config changes
  const saveToDatabase = useCallback(async (newConfig: AutoTradingConfig) => {
    if (!user?.id) throw new Error('Faça login para salvar.');
    return settingsWriter.current(async () => {
      const dbData: Record<string, any> = {
        user_id: user.id,
        auto_trading_enabled: newConfig.enabled,
        trade_amount: newConfig.amount,
        mt5_trade_amount: newConfig.mt5Amount,
        min_confluence: newConfig.minConfluence,
        max_daily_trades: newConfig.maxDailyTrades,
        daily_limit_enabled: newConfig.dailyLimitEnabled,
        use_ai_analysis: newConfig.useAIAnalysis,
        ai_min_confidence: newConfig.aiMinConfidence,
        profit_target_type: newConfig.profitTargetType,
        profit_target_value: newConfig.profitTargetValue,
        use_dynamic_stake: newConfig.useDynamicStake,
        iq_max_stake_pct: newConfig.iqMaxStakePct,
        iq_stake_cap_usd: newConfig.iqStakeCapUsd,
      };

      const { error } = await supabase
        .from('user_trading_settings')
        .upsert(dbData as any, { onConflict: 'user_id' });

      if (error) {
        throw error;
      } else {
        console.log('✅ Settings saved to database');
      }
    });
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
        // IMPORTANTE: NÃO limpar o set - apenas ADICIONAR os ativos pendentes do DB
        // Locks locais de ciclos em andamento devem ser preservados
        const dbAssets = new Set(activeOps.map(op => op.asset.toUpperCase()));
        
        // Remover apenas ativos que NÃO estão mais pendentes no DB E não estão em tradingInProgress
        const currentAssets = Array.from(activeAssetTrades.current);
        currentAssets.forEach(asset => {
          if (!dbAssets.has(asset) && !tradingInProgress.current.has(asset)) {
            // Verificar se não foi adicionado recentemente (cooldown de 60s)
            // Manter o lock por segurança - será limpo no próximo ciclo
          }
        });
        
        // Adicionar todos os ativos pendentes do DB
        dbAssets.forEach(asset => activeAssetTrades.current.add(asset));
        
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
      if (resultSyncInFlight) return;
      const now = Date.now();
      if (now - lastCheckResultsTime.current < CHECK_RESULTS_INTERVAL) return;
      
      lastCheckResultsTime.current = now;
      resultSyncInFlight = true;
      
      try {
        console.log('🔍 Checking pending results...');
        const { data, error } = await supabase.functions.invoke('iqoption-check-results', {
          signal: AbortSignal.timeout(95000),
        });
        
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
      } finally {
        resultSyncInFlight = false;
      }
    };

    // Check on mount
    refreshActiveAssetTrades();
    checkPendingResults();

    // Check every 30 seconds
    const interval = setInterval(checkPendingResults, CHECK_RESULTS_INTERVAL);
    
    return () => clearInterval(interval);
  }, [refreshActiveAssetTrades]);

  const updateConfig = useCallback(async (updates: Partial<AutoTradingConfig>) => {
    const newConfig = { ...config, ...updates };
    try {
      await saveToDatabase(newConfig);
      setConfig(prev => ({ ...prev, ...updates }));
      toast({ title: 'Configuração salva', description: `Entrada IQ Option: $${newConfig.amount.toFixed(2)}` });
    } catch (error) {
      toast({ title: 'Não foi possível salvar', description: 'A configuração anterior continua ativa. Tente novamente.', variant: 'destructive' });
      throw error;
    }
  }, [config, saveToDatabase, toast]);

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
    
    // NÃO chamar refreshActiveAssetTrades aqui - ele pode limpar locks ativos
    // Os sinais já vêm verificados do checkAndAutoTrade
    
  // Os sinais já vêm filtrados e com lock do checkAndAutoTrade
    // Apenas verificar uma última vez no DB
    const signalsToTrade = signals;
    
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
        // Verificar também se não foi processado por outro ciclo enquanto esperava
        if (tradingInProgress.current.has(signal.asset.toUpperCase())) {
          console.log(`⏸️ [${signal.asset}] Skipped - trading in progress by another cycle`);
          continue;
        }
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
    
    // Mark all signals and assets as being traded (usando asset key para tradingInProgress também)
    verifiedSignals.forEach(signal => {
      tradingInProgress.current.add(signal.id);
      tradingInProgress.current.add(signal.asset.toUpperCase());
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
        tradingInProgress.current.delete(signal.asset.toUpperCase());
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
    // MUTEX: Impedir execuções concorrentes
    if (isCheckingAutoTrade.current) {
      console.log('🔒 checkAndAutoTrade já em execução - ignorando chamada concorrente');
      return;
    }
    isCheckingAutoTrade.current = true;
    
    try {
    if (!config.enabled) {
      console.log('⏸️ Auto trading desabilitado no config');
      return;
    }
    
    // VERIFICAR CONEXÃO IQ OPTION - obrigatório para operar
    const iqConnected = await checkIQOptionConnection();
    if (!iqConnected) {
      console.log('🚫 Auto trading BLOQUEADO: IQ Option não conectada. Conecte primeiro no painel admin.');
      return;
    }
    
    console.log(`🟢 Auto trading ATIVO + IQ CONECTADA | IA: FORÇADA | Min conf: ${config.aiMinConfidence}% | Trades hoje: ${config.todayTrades}/${config.maxDailyTrades}`);
    
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
        // Persiste o desligamento: ao sair e voltar à página, o Auto Trading continua desligado.
        const disabledConfig = { ...config, enabled: false };
        try {
          await saveToDatabase(disabledConfig);
          setConfig(disabledConfig);
        } catch {
          console.error('Falha ao salvar o desligamento por meta de lucro');
        }
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
    // STEP 1: First filter for basic eligibility
    const rawEligibleSignals = signals.filter(signal => {
      const notProcessed = !processedSignals.current.has(signal.id);
      const notInProgress = !tradingInProgress.current.has(signal.id);
      
      // Check if this asset already has an active trade
      const assetKey = signal.asset.toUpperCase();
      const hasActiveTrade = activeAssetTrades.current.has(assetKey);
      
      if (hasActiveTrade) {
        return false; // Skip assets with active trades
      }
      
      // Check cooldown - evitar re-entrada no mesmo ativo muito rápido
      const lastTradeTime = assetCooldowns.current.get(assetKey);
      if (lastTradeTime && (Date.now() - lastTradeTime) < ASSET_COOLDOWN_MS) {
        console.log(`⏳ [${signal.asset}] Em cooldown (${Math.round((ASSET_COOLDOWN_MS - (Date.now() - lastTradeTime)) / 1000)}s restantes)`);
        return false;
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
    
    // STEP 2: Deduplicate by asset - PREFER M1 (fast operations) over M5/M15
    const assetSignalMap = new Map<string, TradingSignal>();
    rawEligibleSignals.forEach(signal => {
      const assetKey = signal.asset.toUpperCase();
      const existing = assetSignalMap.get(assetKey);
      
      if (!existing) {
        assetSignalMap.set(assetKey, signal);
      } else {
        // Prefer M1 timeframe for fast profit operations
        const currentIsFaster = signal.timeframe === 'M1' && existing.timeframe !== 'M1';
        const sameTimeframeBetterScore = signal.timeframe === existing.timeframe && 
          signal.indicators.confluenceScore > existing.indicators.confluenceScore;
        
        if (currentIsFaster || sameTimeframeBetterScore) {
          assetSignalMap.set(assetKey, signal);
        }
      }
    });
    
    // Convert back to array - now we have exactly 1 signal per asset
    let eligibleSignals = Array.from(assetSignalMap.values());
    
    console.log(`🔍 Sinais após deduplicação: ${eligibleSignals.length} ativos únicos (de ${rawEligibleSignals.length} sinais totais)`);

    // LOCK IMEDIATO: Marcar ativos como "em processamento" ANTES da análise IA
    // Isso previne que outro ciclo processe o mesmo ativo enquanto a IA analisa
    const lockedAssets: string[] = [];
    eligibleSignals = eligibleSignals.filter(signal => {
      const assetKey = signal.asset.toUpperCase();
      if (activeAssetTrades.current.has(assetKey)) {
        console.log(`🔒 [${signal.asset}] Já travado por outro ciclo - ignorando`);
        return false;
      }
      activeAssetTrades.current.add(assetKey);
      lockedAssets.push(assetKey);
      return true;
    });

    // Se nenhum sinal sobrou após lock, liberar e sair
    if (eligibleSignals.length === 0) {
      lockedAssets.forEach(a => activeAssetTrades.current.delete(a));
    }

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


    // SEMPRE usar IA para análise (forçado)
    if (eligibleSignals.length > 0) {
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
          
          // Liberar locks dos ativos rejeitados pela IA
          const approvedAssets = new Set(aiApprovedSignals.map(s => s.asset.toUpperCase()));
          lockedAssets.forEach(a => {
            if (!approvedAssets.has(a)) {
              activeAssetTrades.current.delete(a);
              console.log(`🔓 [${a}] Lock liberado - rejeitado pela IA`);
            }
          });

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
        // Liberar locks dos ativos filtrados
        const remainingAssets = new Set(eligibleSignals.map(s => s.asset.toUpperCase()));
        lockedAssets.forEach(a => {
          if (!remainingAssets.has(a)) {
            activeAssetTrades.current.delete(a);
          }
        });
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
    
    // Registrar cooldown para os ativos que foram tradados
    const now = Date.now();
    signalsToTrade.forEach(s => {
      assetCooldowns.current.set(s.asset.toUpperCase(), now);
    });
    
    } finally {
      isCheckingAutoTrade.current = false;
    }
  }, [config.enabled, config.minConfluence, config.todayTrades, config.maxDailyTrades, config.dailyLimitEnabled, config.profitTargetType, config.profitTargetValue, config.aiMinConfidence, placeTradesSimultaneously, analyzeSignals, filterByAIRecommendation, checkIQOptionConnection, toast]);

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