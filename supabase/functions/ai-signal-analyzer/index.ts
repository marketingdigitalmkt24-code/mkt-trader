import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignalData {
  asset: string;
  type: 'CALL' | 'PUT';
  timeframe: string;
  price: number;
  indicators: {
    rsi: { value: number; signal: string };
    macd: { value: number; signal: number; histogram: number; trend: string };
    bollinger: { upper: number; middle: number; lower: number; position: string };
    stochastic: { k: number; d: number; signal: string };
    movingAverages: { ema9: number; ema21: number; sma50: number; trend: string };
    atr: { value: number; volatility: string };
    supportResistance: { nearestSupport: number; nearestResistance: number; pricePosition: string };
    confluenceScore: number;
    confluenceCount: number;
  };
  confirmations: string[];
}

interface AnalysisRequest {
  signals: SignalData[];
  historicalResults?: {
    asset: string;
    wins: number;
    losses: number;
    winRate: number;
  }[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signals, historicalResults }: AnalysisRequest = await req.json();

    // Use Groq API (free tier with generous limits)
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY not configured');
      throw new Error('Groq AI service not configured');
    }

    if (!signals || signals.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzedSignals: [],
          message: 'No signals to analyze' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ULTRA CONSERVATIVE PRE-FILTER: Only analyze signals with EXTREME conditions
    // This reduces losses by only considering the best setups
    const topSignals = signals
      .filter(s => {
        const rsi = s.indicators.rsi.value;
        const conf = s.indicators.confluenceScore;
        const vol = s.indicators.atr.volatility;
        const stochK = s.indicators.stochastic?.k || 50;
        const stochD = s.indicators.stochastic?.d || 50;
        
        // STRICT CRITERIA: RSI extreme + high confluence + low volatility
        const isRSIExtreme = rsi <= 20 || rsi >= 80; // More extreme RSI
        const isHighConfluence = conf >= 85; // Higher confluence threshold
        const isLowVolatility = vol === 'low' || vol === 'normal';
        const isStochConfirm = (rsi <= 20 && stochK <= 25) || (rsi >= 80 && stochK >= 75);
        
        // Must meet at least 3 criteria
        const criteriaCount = [isRSIExtreme, isHighConfluence, isLowVolatility, isStochConfirm]
          .filter(Boolean).length;
        
        return criteriaCount >= 3;
      })
      .sort((a, b) => b.indicators.confluenceScore - a.indicators.confluenceScore)
      .slice(0, 3); // Max 3 signals for quality over quantity

    if (topSignals.length === 0) {
      console.log('No signals meeting ULTRA CONSERVATIVE criteria, waiting for better opportunity...');
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzedSignals: signals.map(s => ({
            signalId: `${s.asset}-${Date.now()}`,
            asset: s.asset,
            recommendation: 'SKIP',
            confidence: s.indicators.confluenceScore,
            reason: 'Não atende critérios ultra-conservadores (RSI extremo + conf 85%+ + vol baixa)',
            adjustedConfluence: s.indicators.confluenceScore,
            riskLevel: 'HIGH'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 Found ${topSignals.length} ULTRA QUALITY signals (from ${signals.length} total)...`);

    // Build context with historical data - avoid assets with low win rate
    const badAssets = historicalResults?.filter(h => h.winRate < 55).map(h => h.asset) || [];
    const historyContext = historicalResults && historicalResults.length > 0
      ? `\nEvitar: ${badAssets.join(', ')}` : '';

    // ULTRA CONSERVATIVE PROMPT - Focus on profit only
    const systemPrompt = `Analista ULTRA-CONSERVADOR de opções binárias. Você DEVE evitar perdas a todo custo.

REGRAS OBRIGATÓRIAS para EXECUTE:
1. RSI EXTREMO: <=20 (oversold) OU >=80 (overbought) - SEM EXCEÇÃO
2. Confluência: >=88% - Mínimo absoluto
3. Volatilidade: BAIXA ou NORMAL apenas
4. Stochastic confirmando: K<=25 para oversold OU K>=75 para overbought
5. MACD alinhado com direção do trade

SE QUALQUER critério falhar = SKIP imediatamente.
Máximo 1 EXECUTE por análise. Prefira NENHUM trade a um trade ruim.

Responda APENAS JSON:
{"analyzedSignals":[{"signalId":"asset","asset":"nome","recommendation":"EXECUTE|SKIP","confidence":0-100,"reason":"motivo curto","adjustedConfluence":num,"riskLevel":"LOW|HIGH"}],"marketSentiment":"NEUTRAL","bestSignal":"asset ou null"}`;

    const userPrompt = `Análise ULTRA-CONSERVADORA:
${topSignals.map(s => {
  const rsi = s.indicators.rsi.value.toFixed(0);
  const conf = s.indicators.confluenceScore;
  const vol = s.indicators.atr.volatility;
  const stochK = s.indicators.stochastic?.k?.toFixed(0) || '50';
  const macd = s.indicators.macd?.trend || 'neutral';
  return `${s.asset} ${s.type} | RSI:${rsi} Stoch:${stochK} Conf:${conf}% Vol:${vol} MACD:${macd}`;
}).join('\n')}
${historyContext}

LEMBRE: Só EXECUTE se TODOS os 5 critérios forem atendidos. Na dúvida, SKIP.
JSON apenas:`;

    // Use Groq API - llama-3.1-8b-instant is fast and within free tier limits
    const makeRequest = async (retryCount = 0): Promise<Response> => {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          max_tokens: 1024,
        }),
      });
      
      // Retry on rate limit with exponential backoff
      if (response.status === 429 && retryCount < 2) {
        const delay = (retryCount + 1) * 2000; // 2s, 4s
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return makeRequest(retryCount + 1);
      }
      
      return response;
    };

    const response = await makeRequest();

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq AI error:', response.status, errorText);
      
      if (response.status === 429) {
        console.warn('AI rate limit reached');
        return new Response(
          JSON.stringify({ 
            success: true, 
            error: 'Rate limit exceeded',
            analyzedSignals: signals.map(s => ({
              signalId: `${s.asset}-${Date.now()}`,
              asset: s.asset,
              recommendation: s.indicators.confluenceScore >= 80 ? 'EXECUTE' : 'SKIP',
              confidence: s.indicators.confluenceScore,
              reason: 'Fallback: rate limit, usando confluência',
              adjustedConfluence: s.indicators.confluenceScore,
              riskLevel: 'LOW'
            })),
            marketSentiment: 'NEUTRAL',
            bestSignal: signals.find(s => s.indicators.confluenceScore >= 80)?.asset || null
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Any other error - use fallback
      return new Response(
        JSON.stringify({ 
          success: true,
          error: `Groq AI error: ${response.status}`,
          analyzedSignals: signals.map(s => ({
            signalId: `${s.asset}-${Date.now()}`,
            asset: s.asset,
            recommendation: s.indicators.confluenceScore >= 80 ? 'EXECUTE' : 
                            s.indicators.confluenceScore >= 65 ? 'WAIT' : 'SKIP',
            confidence: s.indicators.confluenceScore,
            reason: 'Fallback: erro na API, usando confluência',
            adjustedConfluence: s.indicators.confluenceScore,
            riskLevel: s.indicators.atr?.volatility === 'high' ? 'HIGH' : 'LOW'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: signals.find(s => s.indicators.confluenceScore >= 80)?.asset || null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    // Groq uses OpenAI-compatible format: choices[0].message.content
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in Groq response:', JSON.stringify(data));
      throw new Error('No response from AI');
    }

    console.log('AI Response:', content);

    // Parse AI response - handle truncated JSON
    let analysis;
    try {
      // Extract JSON from response (handle markdown code blocks and truncated responses)
      let jsonStr = content;
      
      // Try to find complete JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      // Try to parse, if fails try to fix truncated JSON
      try {
        analysis = JSON.parse(jsonStr);
      } catch {
        // Try to fix truncated JSON by closing arrays/objects
        let fixed = jsonStr;
        // Count open brackets and close them
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;
        const openBraces = (fixed.match(/\{/g) || []).length;
        const closeBraces = (fixed.match(/\}/g) || []).length;
        
        // Add missing closing brackets
        fixed += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        fixed += '}'.repeat(Math.max(0, openBraces - closeBraces));
        
        analysis = JSON.parse(fixed);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback: use confluence-based analysis
      const bestSignal = topSignals.find(s => s.indicators.confluenceScore >= 85);
      analysis = {
        analyzedSignals: topSignals.map(s => ({
          signalId: s.asset,
          asset: s.asset,
          recommendation: s.indicators.confluenceScore >= 85 ? 'EXECUTE' : 'SKIP',
          confidence: s.indicators.confluenceScore,
          reason: 'Fallback: confluência',
          adjustedConfluence: s.indicators.confluenceScore,
          riskLevel: s.indicators.atr?.volatility === 'high' ? 'HIGH' : 'LOW'
        })),
        marketSentiment: 'NEUTRAL',
        bestSignal: bestSignal?.asset || null
      };
    }

    // Merge AI analysis with all original signals (non-analyzed get SKIP)
    const analyzedAssets = new Set(analysis.analyzedSignals?.map((a: any) => a.asset) || []);
    const allSignalAnalysis = signals.map(s => {
      const aiResult = analysis.analyzedSignals?.find((a: any) => a.asset === s.asset);
      if (aiResult) return aiResult;
      
      // Signal wasn't analyzed by AI - apply basic filtering
      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: 'SKIP',
        confidence: s.indicators.confluenceScore,
        reason: 'Não analisado pela IA (confluência < 70%)',
        adjustedConfluence: s.indicators.confluenceScore,
        riskLevel: 'HIGH'
      };
    });

    console.log('Analysis result:', JSON.stringify({ bestSignal: analysis.bestSignal, sentiment: analysis.marketSentiment }));

    return new Response(
      JSON.stringify({ 
        success: true,
        analyzedSignals: allSignalAnalysis,
        marketSentiment: analysis.marketSentiment || 'NEUTRAL',
        bestSignal: analysis.bestSignal
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in AI signal analyzer:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        analyzedSignals: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
