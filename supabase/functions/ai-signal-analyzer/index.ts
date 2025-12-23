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

    // Use Google AI API key (free tier)
    const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!GOOGLE_AI_API_KEY) {
      console.error('GOOGLE_AI_API_KEY not configured');
      throw new Error('Google AI service not configured');
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

    console.log(`Analyzing ${signals.length} signals with AI...`);

    // Build context with historical data
    const historyContext = historicalResults && historicalResults.length > 0
      ? `\n\nHistórico recente de resultados por ativo:\n${historicalResults.map(h => 
          `- ${h.asset}: ${h.wins} wins, ${h.losses} losses (${h.winRate.toFixed(1)}% win rate)`
        ).join('\n')}`
      : '';

    const systemPrompt = `Você é um analista de trading ULTRA CONSERVADOR especializado em opções binárias.

OBJETIVO: Identificar APENAS 1 SINAL por análise com probabilidade EXTREMA de lucro (90%+).
FILOSOFIA: Preferimos perder oportunidades do que perder dinheiro. Qualidade > Quantidade.

REGRA DE OURO: Máximo de 1 sinal "EXECUTE" por análise. Se não houver sinal perfeito, todos devem ser SKIP.

CRITÉRIOS OBRIGATÓRIOS PARA "EXECUTE" (TODOS devem estar presentes):
1. RSI em EXTREMO ABSOLUTO (< 20 para CALL, > 80 para PUT)
2. Preço ULTRAPASSANDO Banda de Bollinger (não apenas tocando)
3. Suporte/Resistência MUITO FORTE no timeframe
4. Confluência MÍNIMA de 90% com 5+ confirmações
5. Volatilidade BAIXA (nunca média ou alta)
6. MACD, Estocástico E Médias Móveis TODOS confirmando
7. Histórico do ativo com win rate > 60%
8. Padrão de candle de reversão presente

DESCARTE IMEDIATO (qualquer um = SKIP):
- RSI entre 25-75
- Confluência < 90%
- Volatilidade média ou alta
- Menos de 5 confirmações
- Indicadores divergentes
- Win rate histórico < 60%
- Preço em zona neutra

NUNCA RECOMENDE "EXECUTE" SE:
- Você não tem 100% de certeza
- Há qualquer dúvida sobre a qualidade
- Os indicadores não estão TODOS alinhados

CLASSIFICAÇÃO DE RISCO:
- LOW: Confluência 95%+, RSI extremo (<15 ou >85), 6+ confirmações
- MEDIUM: Confluência 90-94%, RSI (<25 ou >75), 5 confirmações  
- HIGH: Qualquer coisa abaixo disso = NÃO OPERAR

Responda APENAS com JSON válido:
{
  "analyzedSignals": [{
    "signalId": "id",
    "asset": "ativo",
    "recommendation": "EXECUTE" | "SKIP" | "WAIT",
    "confidence": 0-100,
    "reason": "explicação objetiva",
    "adjustedConfluence": número,
    "riskLevel": "LOW" | "MEDIUM" | "HIGH"
  }],
  "marketSentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "bestSignal": "id do ÚNICO melhor sinal ou null"
}`;

    const userPrompt = `Analise os seguintes sinais de trading e determine quais devem ser executados para MAXIMIZAR O LUCRO:

SINAIS PARA ANÁLISE:
${signals.map((s, i) => `
Sinal ${i + 1} (ID: ${s.asset}-${Date.now()}-${i}):
- Ativo: ${s.asset}
- Direção: ${s.type}
- Timeframe: ${s.timeframe}
- Preço: ${s.price.toFixed(5)}
- RSI: ${s.indicators.rsi.value.toFixed(1)} (${s.indicators.rsi.signal})
- MACD Histograma: ${s.indicators.macd.histogram.toFixed(5)} (${s.indicators.macd.trend})
- Bollinger Position: ${s.indicators.bollinger.position}
- Estocástico K: ${s.indicators.stochastic.k.toFixed(1)} (${s.indicators.stochastic.signal})
- EMA Trend: ${s.indicators.movingAverages.trend}
- Volatilidade: ${s.indicators.atr.volatility}
- Suporte/Resistência: ${s.indicators.supportResistance.pricePosition}
- Confluência Atual: ${s.indicators.confluenceScore}% (${s.indicators.confluenceCount} confirmações)
- Confirmações: ${s.confirmations.join(', ')}
`).join('\n')}${historyContext}

LEMBRE-SE: 
- MÁXIMO 1 SINAL pode receber "EXECUTE" por análise
- Se não houver sinal PERFEITO, todos devem ser SKIP
- Confiança mínima para EXECUTE: 90%
- Prefira não operar a operar com dúvida`;

    // Use Google AI Gemini API (free tier)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google AI error:', response.status, errorText);
      
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
          error: `Google AI error: ${response.status}`,
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
    // Google AI response format: candidates[0].content.parts[0].text
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('No content in Google AI response:', JSON.stringify(data));
      throw new Error('No response from AI');
    }

    console.log('AI Response:', content);

    // Parse AI response
    let analysis;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback: return signals with original confluence
      analysis = {
        analyzedSignals: signals.map(s => ({
          signalId: `${s.asset}-${Date.now()}`,
          asset: s.asset,
          recommendation: s.indicators.confluenceScore >= 75 ? 'EXECUTE' : 'SKIP',
          confidence: s.indicators.confluenceScore,
          reason: 'Fallback: based on original confluence score',
          adjustedConfluence: s.indicators.confluenceScore,
          riskLevel: s.indicators.atr.volatility === 'high' ? 'HIGH' : 'MEDIUM'
        })),
        marketSentiment: 'NEUTRAL',
        bestSignal: null
      };
    }

    console.log('Analysis result:', JSON.stringify(analysis, null, 2));

    return new Response(
      JSON.stringify({ 
        success: true, 
        ...analysis 
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
