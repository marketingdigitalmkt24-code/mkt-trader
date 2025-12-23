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

    // Pre-filter: only analyze top 5 signals by confluence to reduce token usage
    // Groq free tier has 12k tokens/min limit
    const topSignals = signals
      .filter(s => s.indicators.confluenceScore >= 75) // Only high confluence signals
      .sort((a, b) => b.indicators.confluenceScore - a.indicators.confluenceScore)
      .slice(0, 5); // Max 5 signals to stay within token limits

    if (topSignals.length === 0) {
      console.log('No signals with confluence >= 70%, skipping AI analysis');
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzedSignals: signals.map(s => ({
            signalId: `${s.asset}-${Date.now()}`,
            asset: s.asset,
            recommendation: 'SKIP',
            confidence: s.indicators.confluenceScore,
            reason: 'Confluência insuficiente para análise',
            adjustedConfluence: s.indicators.confluenceScore,
            riskLevel: 'HIGH'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing ${topSignals.length} top signals with AI (from ${signals.length} total)...`);

    // Build context with historical data
    const historyContext = historicalResults && historicalResults.length > 0
      ? `\n\nHistórico recente:\n${historicalResults.slice(0, 5).map(h => 
          `${h.asset}: ${h.winRate.toFixed(0)}% win`
        ).join(', ')}`
      : '';

    const systemPrompt = `Analista de trading conservador. Analise sinais e responda JSON:
{"analyzedSignals":[{"signalId":"asset","asset":"nome","recommendation":"EXECUTE|SKIP","confidence":0-100,"reason":"motivo","adjustedConfluence":num,"riskLevel":"LOW|HIGH"}],"marketSentiment":"NEUTRAL","bestSignal":"asset ou null"}
Regras: Máx 1 EXECUTE. RSI<25 ou >75, confluência>85%, volatilidade baixa = EXECUTE. Caso contrário SKIP.`;

    const userPrompt = `Sinais:
${topSignals.map((s, i) => `${s.asset} ${s.type} RSI:${s.indicators.rsi.value.toFixed(0)} Conf:${s.indicators.confluenceScore}% Vol:${s.indicators.atr.volatility}`).join('\n')}
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
