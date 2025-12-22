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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      throw new Error('AI service not configured');
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

    const systemPrompt = `Você é um analista de trading especializado em opções binárias com foco em ALTA ASSERTIVIDADE.

Seu objetivo é analisar sinais de trading e determinar quais têm a MAIOR PROBABILIDADE de lucro.

CRITÉRIOS PARA UM BOM SINAL:
1. RSI extremo (< 30 para CALL, > 70 para PUT) - indica reversão iminente
2. Preço tocando Banda de Bollinger (inferior para CALL, superior para PUT)
3. Suporte/Resistência forte no timeframe atual
4. Divergência no MACD confirmando reversão
5. Estocástico em zona de sobrecompra/sobrevenda
6. EMAs indicando possível reversão
7. Volatilidade BAIXA a MÉDIA (alta volatilidade = maior risco)
8. Múltiplas confirmações (4+ indicadores concordando)

CRITÉRIOS PARA REJEITAR UM SINAL:
1. RSI em zona neutra (30-70)
2. Preço no meio das Bandas de Bollinger
3. Sem suporte/resistência claro
4. Alta volatilidade
5. Menos de 3 confirmações
6. Ativo com histórico ruim (< 55% win rate)

Responda APENAS com JSON válido no formato:
{
  "analyzedSignals": [
    {
      "signalId": "id do sinal",
      "asset": "nome do ativo",
      "recommendation": "EXECUTE" | "SKIP" | "WAIT",
      "confidence": número de 0 a 100,
      "reason": "explicação curta",
      "adjustedConfluence": número ajustado baseado na análise,
      "riskLevel": "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "marketSentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "bestSignal": "id do melhor sinal ou null se nenhum for bom"
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

Analise cuidadosamente e retorne APENAS sinais que tenham ALTA probabilidade de lucro. Seja conservador - é melhor não operar do que perder.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3, // Low temperature for consistent analysis
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('AI rate limit reached');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Rate limit exceeded, try again later',
            analyzedSignals: signals.map(s => ({
              signalId: `${s.asset}-${Date.now()}`,
              asset: s.asset,
              recommendation: 'WAIT',
              confidence: s.indicators.confluenceScore,
              reason: 'AI analysis unavailable, using original confluence',
              adjustedConfluence: s.indicators.confluenceScore,
              riskLevel: 'MEDIUM'
            }))
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        console.error('AI credits exhausted');
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
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
