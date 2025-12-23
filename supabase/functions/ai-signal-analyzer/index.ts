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
    reversalPattern?: string;
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

// ============= ESTRATÉGIA MULTI-OPORTUNIDADE LUCRATIVA =============
// Diversificação inteligente para máximo lucro consistente

type PatternType = 'PIN_BAR' | 'OVERSOLD_REVERSAL' | 'OVERBOUGHT_REVERSAL' | 'DIVERGENCE' | 'CONFLUENCE' | 'BOUNCE_SUPPORT' | 'BOUNCE_RESISTANCE';

interface PatternMatch {
  signal: SignalData;
  pattern: PatternType;
  score: number;
  reason: string;
}

function detectPatterns(signals: SignalData[], badAssets: string[]): PatternMatch[] {
  const matches: PatternMatch[] = [];
  
  for (const s of signals) {
    // Skip bad assets
    if (badAssets.includes(s.asset)) continue;
    
    const rsi = s.indicators.rsi.value;
    const stochK = s.indicators.stochastic?.k || 50;
    const stochD = s.indicators.stochastic?.d || 50;
    const bollPos = s.indicators.bollinger?.position || '';
    const macdHist = s.indicators.macd?.histogram || 0;
    const macdTrend = s.indicators.macd?.trend || '';
    const vol = s.indicators.atr.volatility;
    const conf = s.indicators.confluenceScore;
    const confCount = s.indicators.confluenceCount;
    const pricePos = s.indicators.supportResistance?.pricePosition || '';
    const hasPattern = s.indicators.reversalPattern;
    
    // Evitar volatilidade muito alta
    if (vol === 'high') continue;
    
    // ========== PADRÃO 1: PIN BAR REVERSAL (95-99%) ==========
    if (hasPattern && hasPattern.toLowerCase().includes('pin bar')) {
      if ((rsi <= 25 || rsi >= 75) && (pricePos === 'near_support' || pricePos === 'near_resistance')) {
        const score = 95 + (rsi <= 15 || rsi >= 85 ? 4 : 0);
        matches.push({
          signal: s,
          pattern: 'PIN_BAR',
          score,
          reason: `Pin Bar + RSI ${rsi.toFixed(1)} + ${pricePos}`
        });
      }
    }
    
    // ========== PADRÃO 2: OVERSOLD REVERSAL CALL (90-98%) ==========
    if (rsi <= 30 && s.type === 'CALL') {
      let score = 85;
      const reasons: string[] = [`RSI ${rsi.toFixed(1)}`];
      
      if (stochK <= 25) { score += 5; reasons.push(`StochK ${stochK.toFixed(1)}`); }
      if (stochK > stochD) { score += 3; reasons.push('Stoch cruzando ↑'); }
      if (bollPos === 'below_lower') { score += 4; reasons.push('Abaixo BB'); }
      if (pricePos === 'near_support') { score += 4; reasons.push('Suporte'); }
      if (macdHist > 0) { score += 2; reasons.push('MACD+'); }
      if (vol === 'low') { score += 2; reasons.push('Vol baixa'); }
      if (hasPattern) { score += 3; reasons.push(hasPattern); }
      
      if (score >= 90) {
        matches.push({
          signal: s,
          pattern: 'OVERSOLD_REVERSAL',
          score: Math.min(score, 99),
          reason: reasons.join(' | ')
        });
      }
    }
    
    // ========== PADRÃO 3: OVERBOUGHT REVERSAL PUT (90-98%) ==========
    if (rsi >= 70 && s.type === 'PUT') {
      let score = 85;
      const reasons: string[] = [`RSI ${rsi.toFixed(1)}`];
      
      if (stochK >= 75) { score += 5; reasons.push(`StochK ${stochK.toFixed(1)}`); }
      if (stochK < stochD) { score += 3; reasons.push('Stoch cruzando ↓'); }
      if (bollPos === 'above_upper') { score += 4; reasons.push('Acima BB'); }
      if (pricePos === 'near_resistance') { score += 4; reasons.push('Resistência'); }
      if (macdHist < 0) { score += 2; reasons.push('MACD-'); }
      if (vol === 'low') { score += 2; reasons.push('Vol baixa'); }
      if (hasPattern) { score += 3; reasons.push(hasPattern); }
      
      if (score >= 90) {
        matches.push({
          signal: s,
          pattern: 'OVERBOUGHT_REVERSAL',
          score: Math.min(score, 99),
          reason: reasons.join(' | ')
        });
      }
    }
    
    // ========== PADRÃO 4: DIVERGÊNCIA CONFIRMADA (88-96%) ==========
    const hasBullishDivergence = rsi <= 35 && macdHist > 0 && stochK > stochD;
    const hasBearishDivergence = rsi >= 65 && macdHist < 0 && stochK < stochD;
    
    if ((hasBullishDivergence && s.type === 'CALL') || (hasBearishDivergence && s.type === 'PUT')) {
      let score = 88;
      const divType = hasBullishDivergence ? 'Alta' : 'Baixa';
      
      if (conf >= 80) { score += 4; }
      if (confCount >= 5) { score += 4; }
      
      matches.push({
        signal: s,
        pattern: 'DIVERGENCE',
        score: Math.min(score, 96),
        reason: `Divergência ${divType} + Conf ${conf}%`
      });
    }
    
    // ========== PADRÃO 5: ALTA CONFLUÊNCIA (85-95%) ==========
    if (conf >= 80 && confCount >= 5) {
      let score = 85;
      const reasons: string[] = [`Conf ${conf}%`, `${confCount} indicadores`];
      
      if (conf >= 90) { score += 5; }
      if (rsi <= 30 || rsi >= 70) { score += 4; reasons.push(`RSI ${rsi.toFixed(1)}`); }
      if (pricePos === 'near_support' || pricePos === 'near_resistance') { score += 3; reasons.push(pricePos); }
      if (vol === 'low') { score += 3; reasons.push('Vol baixa'); }
      
      if (score >= 88) {
        matches.push({
          signal: s,
          pattern: 'CONFLUENCE',
          score: Math.min(score, 95),
          reason: reasons.join(' | ')
        });
      }
    }
    
    // ========== PADRÃO 6: BOUNCE NO SUPORTE (85-92%) ==========
    if (pricePos === 'near_support' && s.type === 'CALL' && rsi <= 45) {
      let score = 82;
      const reasons: string[] = ['Suporte forte'];
      
      if (bollPos === 'below_lower' || bollPos === 'at_lower') { score += 4; reasons.push('BB inferior'); }
      if (stochK > stochD) { score += 3; reasons.push('Stoch ↑'); }
      if (macdHist > 0 || macdTrend === 'bullish') { score += 3; reasons.push('MACD+'); }
      if (hasPattern) { score += 4; reasons.push(hasPattern); }
      
      if (score >= 88) {
        matches.push({
          signal: s,
          pattern: 'BOUNCE_SUPPORT',
          score: Math.min(score, 92),
          reason: reasons.join(' | ')
        });
      }
    }
    
    // ========== PADRÃO 7: BOUNCE NA RESISTÊNCIA (85-92%) ==========
    if (pricePos === 'near_resistance' && s.type === 'PUT' && rsi >= 55) {
      let score = 82;
      const reasons: string[] = ['Resistência forte'];
      
      if (bollPos === 'above_upper' || bollPos === 'at_upper') { score += 4; reasons.push('BB superior'); }
      if (stochK < stochD) { score += 3; reasons.push('Stoch ↓'); }
      if (macdHist < 0 || macdTrend === 'bearish') { score += 3; reasons.push('MACD-'); }
      if (hasPattern) { score += 4; reasons.push(hasPattern); }
      
      if (score >= 88) {
        matches.push({
          signal: s,
          pattern: 'BOUNCE_RESISTANCE',
          score: Math.min(score, 92),
          reason: reasons.join(' | ')
        });
      }
    }
  }
  
  return matches;
}

function diversifyOpportunities(matches: PatternMatch[]): PatternMatch[] {
  // Ordenar por score
  const sorted = matches.sort((a, b) => b.score - a.score);
  
  // Diversificar por:
  // 1. Diferentes ativos (não repetir)
  // 2. Diferentes tipos de padrão
  // 3. Diferentes mercados (forex, crypto, etc)
  
  const selected: PatternMatch[] = [];
  const usedAssets = new Set<string>();
  const usedPatterns = new Set<PatternType>();
  
  // Primeira passada: selecionar o melhor de cada padrão/ativo único
  for (const match of sorted) {
    if (selected.length >= 5) break; // Máximo 5 oportunidades diversificadas
    
    // Não repetir ativo
    if (usedAssets.has(match.signal.asset)) continue;
    
    // Score mínimo de 88%
    if (match.score < 88) continue;
    
    // Preferir diversidade de padrões (mas não obrigatório)
    const patternBonus = !usedPatterns.has(match.pattern) ? 2 : 0;
    
    if (match.score + patternBonus >= 88) {
      selected.push(match);
      usedAssets.add(match.signal.asset);
      usedPatterns.add(match.pattern);
    }
  }
  
  // Se não temos pelo menos 2, relaxar critérios
  if (selected.length < 2) {
    for (const match of sorted) {
      if (selected.length >= 3) break;
      if (usedAssets.has(match.signal.asset)) continue;
      if (match.score >= 85) {
        selected.push(match);
        usedAssets.add(match.signal.asset);
      }
    }
  }
  
  return selected;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signals, historicalResults }: AnalysisRequest = await req.json();

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

    // Lista de ativos a evitar (win rate < 55%)
    const badAssets = historicalResults?.filter(h => h.winRate < 55).map(h => h.asset) || [];
    
    // Lista de ativos bons (win rate > 65%)
    const goodAssets = historicalResults?.filter(h => h.winRate > 65).map(h => h.asset) || [];

    // Detectar todos os padrões
    const allPatterns = detectPatterns(signals, badAssets);
    
    // Dar boost para ativos com bom histórico
    allPatterns.forEach(p => {
      if (goodAssets.includes(p.signal.asset)) {
        p.score = Math.min(p.score + 3, 99);
        p.reason += ' | Histórico+';
      }
    });
    
    // Diversificar as oportunidades
    const diversified = diversifyOpportunities(allPatterns);

    if (diversified.length === 0) {
      console.log('⏳ Aguardando oportunidades lucrativas diversificadas...');
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzedSignals: signals.slice(0, 5).map(s => ({
            signalId: `${s.asset}-${Date.now()}`,
            asset: s.asset,
            recommendation: 'SKIP',
            confidence: s.indicators.confluenceScore,
            reason: 'Aguardando setup de alta probabilidade',
            adjustedConfluence: s.indicators.confluenceScore,
            riskLevel: 'HIGH'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 ${diversified.length} oportunidade(s) diversificada(s) encontrada(s)!`);
    diversified.forEach(d => {
      console.log(`   📊 ${d.signal.asset} (${d.pattern}): ${d.score}% - ${d.reason}`);
    });

    // PROMPT PARA VALIDAÇÃO FINAL DA IA
    const systemPrompt = `Você é um especialista em opções binárias focado em LUCRO CONSISTENTE.

Sua missão: VALIDAR e APROVAR oportunidades diversificadas de alta probabilidade.

CRITÉRIOS DE APROVAÇÃO:
1. Score >= 88% = EXECUTE (alta probabilidade)
2. Score 85-87% = EXECUTE com cautela (boa probabilidade)
3. Score < 85% = SKIP (risco alto)

DIVERSIFICAÇÃO É CHAVE:
- Múltiplos ativos = menor risco
- Diferentes padrões = maior consistência
- Nunca colocar tudo em um sinal

PADRÕES VALIDADOS:
- PIN_BAR: Reversão forte em extremos
- OVERSOLD_REVERSAL: RSI baixo + confirmações
- OVERBOUGHT_REVERSAL: RSI alto + confirmações
- DIVERGENCE: Divergência confirmada
- CONFLUENCE: Múltiplos indicadores alinhados
- BOUNCE_SUPPORT: Retorno no suporte
- BOUNCE_RESISTANCE: Retorno na resistência

Responda APENAS com JSON válido:
{"analyzedSignals":[{"signalId":"asset","asset":"nome","recommendation":"EXECUTE|SKIP","confidence":85-99,"reason":"descrição","adjustedConfluence":num,"riskLevel":"LOW|MEDIUM"}],"marketSentiment":"BULLISH|BEARISH|NEUTRAL","bestSignal":"melhor asset ou null"}`;

    const userPrompt = `OPORTUNIDADES DIVERSIFICADAS DETECTADAS:

${diversified.map((d, i) => {
  const s = d.signal;
  const rsi = s.indicators.rsi.value.toFixed(1);
  const stochK = s.indicators.stochastic?.k?.toFixed(1) || '50';
  const conf = s.indicators.confluenceScore;
  
  return `${i + 1}. ${s.asset} ${s.type} (${d.pattern})
   Score: ${d.score}% | RSI: ${rsi} | Stoch: ${stochK} | Conf: ${conf}%
   Motivo: ${d.reason}`;
}).join('\n\n')}

${badAssets.length > 0 ? `\n⚠️ EVITAR: ${badAssets.join(', ')}` : ''}
${goodAssets.length > 0 ? `\n✅ BOM HISTÓRICO: ${goodAssets.join(', ')}` : ''}

Valide as oportunidades acima. APROVAR todas com score >= 85%. Responda JSON:`;

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
          temperature: 0.1,
          max_tokens: 1000,
        }),
      });
      
      if (response.status === 429 && retryCount < 2) {
        const delay = (retryCount + 1) * 2000;
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
      
      // Fallback: usar análise pré-computada
      return new Response(
        JSON.stringify({ 
          success: true,
          analyzedSignals: diversified.map(d => ({
            signalId: `${d.signal.asset}-${Date.now()}`,
            asset: d.signal.asset,
            recommendation: d.score >= 85 ? 'EXECUTE' : 'SKIP',
            confidence: d.score,
            reason: `${d.pattern}: ${d.reason}`,
            adjustedConfluence: d.score,
            riskLevel: d.score >= 92 ? 'LOW' : 'MEDIUM'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: diversified[0]?.signal.asset || null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in Groq response:', JSON.stringify(data));
      throw new Error('No response from AI');
    }

    console.log('AI Response:', content);

    let analysis;
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      try {
        analysis = JSON.parse(jsonStr);
      } catch {
        let fixed = jsonStr;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;
        const openBraces = (fixed.match(/\{/g) || []).length;
        const closeBraces = (fixed.match(/\}/g) || []).length;
        
        fixed += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        fixed += '}'.repeat(Math.max(0, openBraces - closeBraces));
        
        analysis = JSON.parse(fixed);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Usar análise pré-computada
      analysis = {
        analyzedSignals: diversified.map(d => ({
          signalId: d.signal.asset,
          asset: d.signal.asset,
          recommendation: d.score >= 85 ? 'EXECUTE' : 'SKIP',
          confidence: d.score,
          reason: `${d.pattern}: ${d.reason}`,
          adjustedConfluence: d.score,
          riskLevel: d.score >= 92 ? 'LOW' : 'MEDIUM'
        })),
        marketSentiment: 'NEUTRAL',
        bestSignal: diversified[0]?.signal.asset || null
      };
    }

    // Garantir que temos múltiplos EXECUTE (diversificação)
    const executeSignals = analysis.analyzedSignals?.filter((a: any) => a.recommendation === 'EXECUTE') || [];
    
    console.log(`✅ ${executeSignals.length} sinais EXECUTE aprovados para diversificação`);

    // Adicionar sinais não analisados como SKIP
    const allSignalAnalysis = signals.map(s => {
      const aiResult = analysis.analyzedSignals?.find((a: any) => a.asset === s.asset);
      if (aiResult) return aiResult;
      
      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: 'SKIP',
        confidence: s.indicators.confluenceScore,
        reason: 'Não atende critérios de diversificação',
        adjustedConfluence: s.indicators.confluenceScore,
        riskLevel: 'HIGH'
      };
    });

    console.log('Analysis result:', JSON.stringify({ 
      bestSignal: analysis.bestSignal, 
      sentiment: analysis.marketSentiment,
      executeCount: executeSignals.length,
      patterns: diversified.map(d => d.pattern)
    }));

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
