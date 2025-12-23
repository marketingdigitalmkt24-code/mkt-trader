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
    minConfidence: number = 80 // Reduced from 90 to allow more signals
  ): TradingSignal[] => {
    // Check if we're in fallback mode (AI unavailable)
    const isFallbackMode = analysis.analyzedSignals.some(a => a.reason?.includes('Fallback'));
    
    // Only take the BEST signal - maximum 1 trade per analysis
    const bestSignalId = analysis.bestSignal;
    
    // First, check if best signal meets all criteria
    if (bestSignalId) {
      const bestSignal = signals.find(s => s.id === bestSignalId || s.asset === bestSignalId);
      const bestAnalysis = analysis.analyzedSignals.find(
        a => a.signalId === bestSignalId || a.asset === bestSignalId
      );
      
      if (bestSignal && bestAnalysis) {
        // Relaxed criteria for fallback mode
        const requiredConfidence = isFallbackMode ? 75 : minConfidence;
        const requiredConfluence = isFallbackMode ? 75 : 85;
        
        const meetsCriteria = (
          bestAnalysis.recommendation === 'EXECUTE' &&
          bestAnalysis.confidence >= requiredConfidence &&
          (isFallbackMode || bestAnalysis.riskLevel !== 'HIGH') && // Skip HIGH risk only
          bestAnalysis.adjustedConfluence >= requiredConfluence
        );
        
        if (meetsCriteria) {
          console.log(`🎯 Best signal selected: ${bestSignal.asset} (${bestAnalysis.confidence}% confidence${isFallbackMode ? ' - fallback mode' : ''})`);
          return [bestSignal]; // Return ONLY the best signal
        }
      }
    }
    
    // If no best signal, look for any signal that meets criteria
    const eligibleSignals = signals.filter(signal => {
      const aiAnalysis = analysis.analyzedSignals.find(
        a => a.asset === signal.asset || a.signalId === signal.id
      );

      if (!aiAnalysis) return false;

      // Relaxed criteria for fallback mode
      if (isFallbackMode) {
        return (
          aiAnalysis.recommendation === 'EXECUTE' &&
          aiAnalysis.confidence >= 75 &&
          aiAnalysis.adjustedConfluence >= 75
        );
      }

      // Normal AI mode: still strict but not ULTRA strict
      return (
        aiAnalysis.recommendation === 'EXECUTE' &&
        aiAnalysis.confidence >= 85 &&
        aiAnalysis.riskLevel !== 'HIGH' &&
        aiAnalysis.adjustedConfluence >= 85
      );
    });
    
    // Sort by confluence and return best one
    const sorted = eligibleSignals.sort((a, b) => 
      b.indicators.confluenceScore - a.indicators.confluenceScore
    );
    
    if (sorted.length > 0) {
      console.log(`✅ ${sorted.length} signals eligible, selecting best: ${sorted[0].asset}`);
    }
    
    return sorted.slice(0, 1);
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
