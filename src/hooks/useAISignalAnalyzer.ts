import { useState, useCallback, useRef } from 'react';
import { TradingSignal } from '@/types/trading';
import { supabase } from '@/integrations/supabase/client';

export interface AIAnalyzedSignal {
  signalId: string;
  asset: string;
  recommendation: 'EXECUTE' | 'SKIP' | 'WAIT';
  confidence: number;
  reason: string;
  adjustedConfluence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AIAnalysisResult {
  analyzedSignals: AIAnalyzedSignal[];
  marketSentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bestSignal?: string | null;
}

interface HistoricalResult {
  asset: string;
  wins: number;
  losses: number;
  winRate: number;
}

export function useAISignalAnalyzer() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysisCache = useRef<Map<string, AIAnalyzedSignal>>(new Map());
  const lastAnalysisTime = useRef<number>(0);
  const ANALYSIS_COOLDOWN = 30000; // 30 seconds between AI calls

  const buildHistoricalData = useCallback(async (): Promise<HistoricalResult[]> => {
    try {
      const { data: results } = await supabase
        .from('operation_results')
        .select('asset, result')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!results || results.length === 0) return [];

      // Group by asset
      const assetStats = new Map<string, { wins: number; losses: number }>();
      
      results.forEach(r => {
        const stats = assetStats.get(r.asset) || { wins: 0, losses: 0 };
        if (r.result === 'win') stats.wins++;
        else if (r.result === 'loss') stats.losses++;
        assetStats.set(r.asset, stats);
      });

      return Array.from(assetStats.entries()).map(([asset, stats]) => ({
        asset,
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.wins + stats.losses > 0 
          ? (stats.wins / (stats.wins + stats.losses)) * 100 
          : 50
      }));
    } catch (err) {
      console.error('Error fetching historical data:', err);
      return [];
    }
  }, []);

  const analyzeSignals = useCallback(async (
    signals: TradingSignal[]
  ): Promise<AIAnalysisResult> => {
    const now = Date.now();
    
    // Check cooldown
    if (now - lastAnalysisTime.current < ANALYSIS_COOLDOWN) {
      console.log('⏳ AI analysis on cooldown, using cached results');
      
      // Return cached analysis for these signals
      const cachedResults: AIAnalyzedSignal[] = signals.map(s => {
        const cached = analysisCache.current.get(s.id);
        if (cached) return cached;
        
        // Generate fallback analysis based on confluence
        return {
          signalId: s.id,
          asset: s.asset,
          recommendation: s.indicators.confluenceScore >= 80 ? 'EXECUTE' : 
                          s.indicators.confluenceScore >= 60 ? 'WAIT' : 'SKIP',
          confidence: s.indicators.confluenceScore,
          reason: 'Usando análise de confluência (cooldown IA)',
          adjustedConfluence: s.indicators.confluenceScore,
          riskLevel: s.indicators.atr.volatility === 'high' ? 'HIGH' : 
                     s.indicators.atr.volatility === 'medium' ? 'MEDIUM' : 'LOW'
        } as AIAnalyzedSignal;
      });

      return {
        analyzedSignals: cachedResults,
        bestSignal: cachedResults.find(s => s.recommendation === 'EXECUTE')?.signalId || null
      };
    }

    if (signals.length === 0) {
      return { analyzedSignals: [], bestSignal: null };
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      console.log(`🤖 AI analyzing ${signals.length} signals...`);

      // Get historical data for context
      const historicalResults = await buildHistoricalData();

      // Prepare signal data for AI
      const signalData = signals.map(s => ({
        asset: s.asset,
        type: s.type,
        timeframe: s.timeframe,
        price: s.price,
        indicators: s.indicators,
        confirmations: s.confirmations
      }));

      const { data, error: fnError } = await supabase.functions.invoke('ai-signal-analyzer', {
        body: { 
          signals: signalData,
          historicalResults 
        }
      });

      if (fnError) {
        // Handle AI credits exhausted gracefully
        if (fnError.message?.includes('credits') || fnError.message?.includes('402')) {
          console.warn('⚠️ AI credits exhausted, using fallback analysis');
          throw new Error('AI credits exhausted');
        }
        throw new Error(fnError.message);
      }

      if (!data?.success) {
        // Also check for credits error in response
        if (data?.error?.includes('credits')) {
          console.warn('⚠️ AI credits exhausted, using fallback analysis');
          throw new Error('AI credits exhausted');
        }
        throw new Error(data?.error || 'AI analysis failed');
      }

      lastAnalysisTime.current = now;

      const result: AIAnalysisResult = {
        analyzedSignals: data.analyzedSignals || [],
        marketSentiment: data.marketSentiment,
        bestSignal: data.bestSignal
      };

      // Cache results
      result.analyzedSignals.forEach(analysis => {
        analysisCache.current.set(analysis.signalId, analysis);
      });

      setLastAnalysis(result);
      console.log('✅ AI analysis complete:', result);

      return result;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ AI analysis error:', errorMessage);
      setError(errorMessage);

      // Fallback: use confluence score with RELAXED criteria
      // Since AI is down, we use the signal's own confluence as confidence
      const fallbackResults: AIAnalyzedSignal[] = signals.map(s => {
        const confluence = s.indicators.confluenceScore;
        const volatility = s.indicators.atr?.volatility || 'medium';
        
        // More permissive when AI is unavailable - trust the signal generation
        return {
          signalId: s.id,
          asset: s.asset,
          recommendation: confluence >= 75 ? 'EXECUTE' : 
                          confluence >= 60 ? 'WAIT' : 'SKIP',
          confidence: Math.min(confluence + 10, 100), // Boost confidence since signal passed generation
          reason: `Fallback mode: confluência ${confluence}%`,
          adjustedConfluence: confluence,
          riskLevel: volatility === 'high' ? 'HIGH' : 'LOW' // Be more lenient on risk
        } as AIAnalyzedSignal;
      });

      // Find best signal by confluence
      const bestSignal = signals
        .filter(s => s.indicators.confluenceScore >= 75)
        .sort((a, b) => b.indicators.confluenceScore - a.indicators.confluenceScore)[0];

      console.log(`⚠️ Fallback mode: ${fallbackResults.filter(s => s.recommendation === 'EXECUTE').length} signals eligible`);

      return {
        analyzedSignals: fallbackResults,
        bestSignal: bestSignal?.id || null
      };

    } finally {
      setIsAnalyzing(false);
    }
  }, [buildHistoricalData]);

  const filterByAIRecommendation = useCallback((
    signals: TradingSignal[],
    analysis: AIAnalysisResult,
    minConfidence: number = 94 // Mínimo ALTO para máxima assertividade
  ): TradingSignal[] => {
    // Check if we're in fallback mode (AI unavailable)
    const isFallbackMode = analysis.analyzedSignals.some(a => a.reason?.includes('Fallback') || a.reason?.includes('fallback'));
    
    // DEDUPLICAÇÃO RIGOROSA: Apenas 1 sinal por asset
    const seenAssets = new Set<string>();
    const uniqueSignals = signals.filter(signal => {
      const assetKey = signal.asset.toUpperCase();
      if (seenAssets.has(assetKey)) {
        return false;
      }
      seenAssets.add(assetKey);
      return true;
    });
    
    // LÓGICA PROFIT-FIRST: Poucos sinais, máxima assertividade
    const eligibleSignals = uniqueSignals.filter(signal => {
      const aiAnalysis = analysis.analyzedSignals.find(
        a => a.asset.toUpperCase() === signal.asset.toUpperCase() || a.signalId === signal.id
      );

      if (!aiAnalysis) return false;

      // Fallback mode: critérios rigorosos
      if (isFallbackMode) {
        return (
          aiAnalysis.recommendation === 'EXECUTE' &&
          aiAnalysis.confidence >= 90 &&
          aiAnalysis.adjustedConfluence >= 88
        );
      }

      // Verificar se é um padrão GOLDEN_SETUP (prioridade máxima)
      const isGoldenSetup = aiAnalysis.reason?.includes('GOLDEN');
      
      // Modo normal: MUITO rigoroso (>94% confiança)
      // GOLDEN_SETUP pode ter risco MEDIUM também
      const acceptableRisk = isGoldenSetup 
        ? (aiAnalysis.riskLevel === 'LOW' || aiAnalysis.riskLevel === 'MEDIUM')
        : aiAnalysis.riskLevel === 'LOW';
      
      return (
        aiAnalysis.recommendation === 'EXECUTE' &&
        aiAnalysis.confidence >= minConfidence &&
        acceptableRisk &&
        aiAnalysis.adjustedConfluence >= 94
      );
    });
    
    // Ordenar por confiança e padrão (GOLDEN primeiro)
    const sorted = eligibleSignals.sort((a, b) => {
      const aAnalysis = analysis.analyzedSignals.find(an => an.asset.toUpperCase() === a.asset.toUpperCase());
      const bAnalysis = analysis.analyzedSignals.find(an => an.asset.toUpperCase() === b.asset.toUpperCase());
      
      // GOLDEN_SETUP tem prioridade
      const aIsGolden = aAnalysis?.reason?.includes('GOLDEN') ? 1 : 0;
      const bIsGolden = bAnalysis?.reason?.includes('GOLDEN') ? 1 : 0;
      if (bIsGolden !== aIsGolden) return bIsGolden - aIsGolden;
      
      // Depois por confiança
      return (bAnalysis?.confidence || 0) - (aAnalysis?.confidence || 0);
    });
    
    // MÁXIMO 2-3 SINAIS DE ATIVOS DIFERENTES (qualidade > quantidade)
    const hasGoldenSetup = sorted.some(s => {
      const analysis2 = analysis.analyzedSignals.find(a => a.asset.toUpperCase() === s.asset.toUpperCase());
      return analysis2?.reason?.includes('GOLDEN');
    });
    const maxSignals = isFallbackMode ? 1 : (hasGoldenSetup ? 2 : 3);
    
    // Garantir que não há ativos duplicados na seleção final
    const finalSelection: TradingSignal[] = [];
    const finalAssets = new Set<string>();
    
    for (const signal of sorted) {
      const assetKey = signal.asset.toUpperCase();
      if (!finalAssets.has(assetKey) && finalSelection.length < maxSignals) {
        finalAssets.add(assetKey);
        finalSelection.push(signal);
      }
    }
    
    if (finalSelection.length > 0) {
      console.log(`⭐ ${finalSelection.length} sinal(is) PROFIT-FIRST selecionado(s) (ativos únicos):`);
      finalSelection.forEach(s => {
        const analysis2 = analysis.analyzedSignals.find(a => a.asset.toUpperCase() === s.asset.toUpperCase());
        const pattern = analysis2?.reason?.split(':')[0] || 'ELITE';
        console.log(`   🎯 ${s.asset}: ${analysis2?.confidence}% | ${pattern}`);
      });
    } else {
      console.log('⏳ Aguardando setup elite (>94%)...');
    }
    
    return finalSelection;
  }, []);

  const getSignalAnalysis = useCallback((
    signalId: string,
    analysis: AIAnalysisResult
  ): AIAnalyzedSignal | undefined => {
    return analysis.analyzedSignals.find(a => a.signalId === signalId);
  }, []);

  return {
    analyzeSignals,
    filterByAIRecommendation,
    getSignalAnalysis,
    isAnalyzing,
    lastAnalysis,
    error
  };
}
