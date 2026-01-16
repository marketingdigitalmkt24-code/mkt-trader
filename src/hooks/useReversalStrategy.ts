import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ActiveTrade {
  id: string;
  asset: string;
  direction: string;
  entry_price: number;
  created_at: string;
  signal_id: string;
  timeframe: string;
}

interface ReversalConfig {
  enabled: boolean;
  minPriceDropPercent: number; // Queda mínima de preço para reversão (ex: 0.5%)
  minRSI: number; // RSI mínimo para considerar oversold (ex: 30)
  maxRSI: number; // RSI máximo para considerar overbought (ex: 70)
  cooldownSeconds: number; // Tempo mínimo entre reversões no mesmo ativo
  maxReversalsPerTrade: number; // Máximo de reversões por trade original
}

interface ReversalOpportunity {
  originalTrade: ActiveTrade;
  currentPrice: number;
  priceChangePercent: number;
  reversalDirection: 'CALL' | 'PUT';
  confidence: number;
  reason: string;
}

const DEFAULT_CONFIG: ReversalConfig = {
  enabled: true,
  minPriceDropPercent: 0.3, // 0.3% de movimento mínimo
  minRSI: 30,
  maxRSI: 70,
  cooldownSeconds: 60, // 1 minuto de cooldown
  maxReversalsPerTrade: 1, // Apenas 1 reversão por trade original
};

export function useReversalStrategy() {
  const { toast } = useToast();
  const [config, setConfig] = useState<ReversalConfig>(DEFAULT_CONFIG);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastReversalOpportunity, setLastReversalOpportunity] = useState<ReversalOpportunity | null>(null);
  
  const reversalCooldowns = useRef<Map<string, number>>(new Map()); // asset -> timestamp
  const reversalCounts = useRef<Map<string, number>>(new Map()); // signalId -> count
  const monitoringInterval = useRef<NodeJS.Timeout | null>(null);

  // Buscar trades ativos (pendentes) do banco de dados
  const fetchActiveTrades = useCallback(async (): Promise<ActiveTrade[]> => {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('operation_results')
        .select('id, asset, direction, entry_price, created_at, signal_id, timeframe')
        .eq('result', 'pending')
        .gte('created_at', fifteenMinutesAgo)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erro ao buscar trades ativos:', error);
        return [];
      }
      
      return (data || []).map(row => ({
        id: row.id,
        asset: row.asset,
        direction: row.direction,
        entry_price: row.entry_price || 0,
        created_at: row.created_at,
        signal_id: row.signal_id,
        timeframe: row.timeframe,
      }));
    } catch (err) {
      console.error('Erro ao buscar trades ativos:', err);
      return [];
    }
  }, []);

  // Simular busca de preço atual (em produção, viria do WebSocket IQ Option)
  const getCurrentPrice = useCallback(async (asset: string): Promise<number | null> => {
    // Em produção, isso seria conectado ao WebSocket da IQ Option
    // Por enquanto, simulamos com variação do entry_price
    // TODO: Implementar conexão real com preços ao vivo
    return null;
  }, []);

  // Calcular indicadores de reversão simplificados
  const calculateReversalIndicators = useCallback((
    trade: ActiveTrade,
    currentPrice: number
  ): { isReversal: boolean; confidence: number; reason: string } => {
    const entryPrice = trade.entry_price;
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = (priceChange / entryPrice) * 100;
    
    // Para PUT: esperamos queda de preço (priceChange negativo)
    // Para CALL: esperamos subida de preço (priceChange positivo)
    const isPutWinning = trade.direction === 'put' && priceChange < 0;
    const isCallWinning = trade.direction === 'call' && priceChange > 0;
    
    const isWinning = isPutWinning || isCallWinning;
    const absChange = Math.abs(priceChangePercent);
    
    if (!isWinning || absChange < config.minPriceDropPercent) {
      return { isReversal: false, confidence: 0, reason: 'Movimento insuficiente' };
    }
    
    // Quanto maior o movimento, maior a probabilidade de reversão
    let confidence = 50;
    const reasons: string[] = [];
    
    // Movimento forte (0.3% - 0.5%)
    if (absChange >= 0.3 && absChange < 0.5) {
      confidence += 10;
      reasons.push(`Movimento ${absChange.toFixed(2)}%`);
    }
    // Movimento muito forte (0.5% - 1%)
    else if (absChange >= 0.5 && absChange < 1) {
      confidence += 20;
      reasons.push(`Movimento forte ${absChange.toFixed(2)}%`);
    }
    // Movimento extremo (>1%)
    else if (absChange >= 1) {
      confidence += 30;
      reasons.push(`Movimento extremo ${absChange.toFixed(2)}%`);
    }
    
    // Tempo desde entrada (reversão é mais provável após algum tempo)
    const tradeDuration = (Date.now() - new Date(trade.created_at).getTime()) / 1000;
    if (tradeDuration >= 30 && tradeDuration <= 120) {
      confidence += 10;
      reasons.push(`Timing ideal (${Math.round(tradeDuration)}s)`);
    }
    
    // Bônus para ativos conhecidos por reversão rápida
    const quickReversalAssets = ['EUR/USD', 'GBP/USD', 'EUR/JPY', 'GBP/JPY'];
    if (quickReversalAssets.some(a => trade.asset.includes(a))) {
      confidence += 5;
      reasons.push('Ativo volátil');
    }
    
    return {
      isReversal: confidence >= 60,
      confidence: Math.min(confidence, 95),
      reason: reasons.join(' | '),
    };
  }, [config.minPriceDropPercent]);

  // Verificar se há oportunidade de reversão
  const checkReversalOpportunities = useCallback(async (): Promise<ReversalOpportunity[]> => {
    if (!config.enabled) return [];
    
    const activeTrades = await fetchActiveTrades();
    const opportunities: ReversalOpportunity[] = [];
    
    for (const trade of activeTrades) {
      // Verificar cooldown
      const lastReversal = reversalCooldowns.current.get(trade.asset);
      if (lastReversal && Date.now() - lastReversal < config.cooldownSeconds * 1000) {
        continue;
      }
      
      // Verificar limite de reversões por trade
      const reversalCount = reversalCounts.current.get(trade.signal_id) || 0;
      if (reversalCount >= config.maxReversalsPerTrade) {
        continue;
      }
      
      // Em produção, buscar preço atual do WebSocket
      // Por enquanto, simular com variação baseada no tempo
      const tradeDuration = (Date.now() - new Date(trade.created_at).getTime()) / 1000;
      
      // Simular movimento de preço baseado no tempo e direção
      // Em produção, isso seria o preço real do mercado
      let simulatedPriceChange = 0;
      if (trade.direction === 'put') {
        // PUT ganhando = preço caiu
        simulatedPriceChange = -0.001 * tradeDuration * (0.5 + Math.random() * 0.5);
      } else {
        // CALL ganhando = preço subiu
        simulatedPriceChange = 0.001 * tradeDuration * (0.5 + Math.random() * 0.5);
      }
      
      const simulatedCurrentPrice = trade.entry_price * (1 + simulatedPriceChange);
      
      // Verificar indicadores de reversão
      const { isReversal, confidence, reason } = calculateReversalIndicators(trade, simulatedCurrentPrice);
      
      if (isReversal) {
        const priceChangePercent = ((simulatedCurrentPrice - trade.entry_price) / trade.entry_price) * 100;
        
        opportunities.push({
          originalTrade: trade,
          currentPrice: simulatedCurrentPrice,
          priceChangePercent,
          reversalDirection: trade.direction === 'put' ? 'CALL' : 'PUT',
          confidence,
          reason,
        });
      }
    }
    
    // Ordenar por confiança
    return opportunities.sort((a, b) => b.confidence - a.confidence);
  }, [config.enabled, config.cooldownSeconds, config.maxReversalsPerTrade, fetchActiveTrades, calculateReversalIndicators]);

  // Executar trade de reversão
  const executeReversal = useCallback(async (
    opportunity: ReversalOpportunity,
    amount: number,
    isAIAnalyzed: boolean = true
  ): Promise<{ success: boolean; tradeId?: string; error?: string }> => {
    const { originalTrade, reversalDirection, confidence, reason } = opportunity;
    
    console.log(`🔄 Executando REVERSÃO: ${originalTrade.asset} ${reversalDirection}`);
    console.log(`   Original: ${originalTrade.direction.toUpperCase()} @ ${originalTrade.entry_price}`);
    console.log(`   Confiança: ${confidence}% - ${reason}`);
    
    try {
      // Mapear timeframe para expiração
      const expiration = originalTrade.timeframe === 'M1' ? 1 : 5;
      
      const { data, error } = await supabase.functions.invoke('iqoption-place-trade', {
        body: {
          asset: originalTrade.asset,
          direction: reversalDirection.toLowerCase(),
          amount,
          expiration,
          signalId: `${originalTrade.signal_id}-reversal`,
          isAutoTrade: true,
          isAIAnalyzed,
          timeframe: originalTrade.timeframe,
        },
      });
      
      if (error) {
        console.error('Erro ao executar reversão:', error);
        return { success: false, error: 'Erro ao conectar com servidor' };
      }
      
      if (data?.success) {
        // Atualizar cooldown e contagem
        reversalCooldowns.current.set(originalTrade.asset, Date.now());
        const currentCount = reversalCounts.current.get(originalTrade.signal_id) || 0;
        reversalCounts.current.set(originalTrade.signal_id, currentCount + 1);
        
        toast({
          title: `🔄 Reversão Executada!`,
          description: `${originalTrade.asset} ${reversalDirection} - Confiança ${confidence}%`,
        });
        
        console.log(`✅ Reversão executada com sucesso! ID: ${data.tradeId}`);
        return { success: true, tradeId: data.tradeId };
      }
      
      return { success: false, error: data?.error || 'Falha na reversão' };
    } catch (err) {
      console.error('Erro ao executar reversão:', err);
      return { success: false, error: String(err) };
    }
  }, [toast]);

  // Iniciar monitoramento automático
  const startMonitoring = useCallback((
    onOpportunityFound: (opportunity: ReversalOpportunity) => void,
    intervalMs: number = 5000
  ) => {
    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current);
    }
    
    setIsMonitoring(true);
    console.log('🔍 Iniciando monitoramento de reversões...');
    
    const monitor = async () => {
      const opportunities = await checkReversalOpportunities();
      
      if (opportunities.length > 0) {
        const best = opportunities[0];
        setLastReversalOpportunity(best);
        onOpportunityFound(best);
      }
    };
    
    // Executar imediatamente
    monitor();
    
    // E depois periodicamente
    monitoringInterval.current = setInterval(monitor, intervalMs);
  }, [checkReversalOpportunities]);

  // Parar monitoramento
  const stopMonitoring = useCallback(() => {
    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current);
      monitoringInterval.current = null;
    }
    setIsMonitoring(false);
    console.log('⏹️ Monitoramento de reversões pausado');
  }, []);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      if (monitoringInterval.current) {
        clearInterval(monitoringInterval.current);
      }
    };
  }, []);

  // Atualizar configuração
  const updateConfig = useCallback((updates: Partial<ReversalConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Resetar contadores diários
  const resetDailyCounters = useCallback(() => {
    reversalCooldowns.current.clear();
    reversalCounts.current.clear();
    console.log('🔄 Contadores de reversão resetados');
  }, []);

  return {
    config,
    updateConfig,
    isMonitoring,
    lastReversalOpportunity,
    checkReversalOpportunities,
    executeReversal,
    startMonitoring,
    stopMonitoring,
    resetDailyCounters,
  };
}
