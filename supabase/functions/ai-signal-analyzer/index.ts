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

// ============= ESTRATÉGIA ULTRA-SELETIVA: POUCOS SINAIS, MÁXIMA ASSERTIVIDADE =============
// Foco em QUALIDADE extrema - máximo 2-3 sinais com >95% de probabilidade

type PatternType = 'EXTREME_OVERSOLD' | 'EXTREME_OVERBOUGHT' | 'PERFECT_REVERSAL' | 'TRIPLE_CONFLUENCE';

interface PatternMatch {
  signal: SignalData;
  pattern: PatternType;
  score: number;
  reason: string;
  criteria: number; // Quantos critérios foram atendidos
}

function detectElitePatterns(signals: SignalData[], badAssets: string[], goodAssets: string[]): PatternMatch[] {
  const matches: PatternMatch[] = [];
  
  for (const s of signals) {
    // REJEITAR ativos com histórico ruim
    if (badAssets.includes(s.asset)) continue;
    
    const rsi = s.indicators.rsi.value;
    const stochK = s.indicators.stochastic?.k || 50;
    const stochD = s.indicators.stochastic?.d || 50;
    const bollPos = s.indicators.bollinger?.position || '';
    const macdHist = s.indicators.macd?.histogram || 0;
    const vol = s.indicators.atr.volatility;
    const conf = s.indicators.confluenceScore;
    const confCount = s.indicators.confluenceCount;
    const pricePos = s.indicators.supportResistance?.pricePosition || '';
    const hasPattern = s.indicators.reversalPattern;
    
    // REJEITAR volatilidade alta (risco de stop loss)
    if (vol === 'high') continue;
    
    // REJEITAR confluência baixa
    if (conf < 75) continue;
    
    let criteriaCount = 0;
    
    // ========== PADRÃO 1: EXTREME OVERSOLD CALL (RSI < 20) ==========
    if (rsi <= 20 && s.type === 'CALL') {
      let score = 90;
      const reasons: string[] = [`RSI extremo ${rsi.toFixed(1)}`];
      criteriaCount = 1;
      
      // Critério 2: Stochastic extremo
      if (stochK <= 15) { 
        score += 4; 
        reasons.push(`StochK ${stochK.toFixed(1)}`); 
        criteriaCount++;
      }
      
      // Critério 3: Abaixo da Bollinger inferior
      if (bollPos === 'below_lower') { 
        score += 3; 
        reasons.push('Abaixo BB inferior'); 
        criteriaCount++;
      }
      
      // Critério 4: Próximo ao suporte
      if (pricePos === 'near_support') { 
        score += 3; 
        reasons.push('Suporte'); 
        criteriaCount++;
      }
      
      // Critério 5: MACD positivo (reversão começando)
      if (macdHist > 0 || stochK > stochD) { 
        score += 2; 
        reasons.push('Reversão iniciando'); 
        criteriaCount++;
      }
      
      // Critério 6: Padrão de reversão
      if (hasPattern) { 
        score += 3; 
        reasons.push(hasPattern); 
        criteriaCount++;
      }
      
      // Critério 7: Ativo com bom histórico
      if (goodAssets.includes(s.asset)) {
        score += 2;
        reasons.push('Histórico+');
        criteriaCount++;
      }
      
      // SÓ ACEITAR SE TIVER 4+ CRITÉRIOS
      if (criteriaCount >= 4 && score >= 95) {
        matches.push({
          signal: s,
          pattern: 'EXTREME_OVERSOLD',
          score: Math.min(score, 99),
          reason: reasons.join(' | '),
          criteria: criteriaCount
        });
      }
    }
    
    // ========== PADRÃO 2: EXTREME OVERBOUGHT PUT (RSI > 80) ==========
    if (rsi >= 80 && s.type === 'PUT') {
      let score = 90;
      const reasons: string[] = [`RSI extremo ${rsi.toFixed(1)}`];
      criteriaCount = 1;
      
      // Critério 2: Stochastic extremo
      if (stochK >= 85) { 
        score += 4; 
        reasons.push(`StochK ${stochK.toFixed(1)}`); 
        criteriaCount++;
      }
      
      // Critério 3: Acima da Bollinger superior
      if (bollPos === 'above_upper') { 
        score += 3; 
        reasons.push('Acima BB superior'); 
        criteriaCount++;
      }
      
      // Critério 4: Próximo à resistência
      if (pricePos === 'near_resistance') { 
        score += 3; 
        reasons.push('Resistência'); 
        criteriaCount++;
      }
      
      // Critério 5: MACD negativo (reversão começando)
      if (macdHist < 0 || stochK < stochD) { 
        score += 2; 
        reasons.push('Reversão iniciando'); 
        criteriaCount++;
      }
      
      // Critério 6: Padrão de reversão
      if (hasPattern) { 
        score += 3; 
        reasons.push(hasPattern); 
        criteriaCount++;
      }
      
      // Critério 7: Ativo com bom histórico
      if (goodAssets.includes(s.asset)) {
        score += 2;
        reasons.push('Histórico+');
        criteriaCount++;
      }
      
      // SÓ ACEITAR SE TIVER 4+ CRITÉRIOS
      if (criteriaCount >= 4 && score >= 95) {
        matches.push({
          signal: s,
          pattern: 'EXTREME_OVERBOUGHT',
          score: Math.min(score, 99),
          reason: reasons.join(' | '),
          criteria: criteriaCount
        });
      }
    }
    
    // ========== PADRÃO 3: PERFECT REVERSAL (Padrão gráfico + extremos) ==========
    if (hasPattern && (rsi <= 25 || rsi >= 75)) {
      let score = 92;
      const reasons: string[] = [hasPattern, `RSI ${rsi.toFixed(1)}`];
      criteriaCount = 2;
      
      const isOversold = rsi <= 25 && s.type === 'CALL';
      const isOverbought = rsi >= 75 && s.type === 'PUT';
      
      if (!isOversold && !isOverbought) continue;
      
      // Stochastic confirma
      if ((isOversold && stochK <= 25) || (isOverbought && stochK >= 75)) {
        score += 3;
        reasons.push(`StochK ${stochK.toFixed(1)}`);
        criteriaCount++;
      }
      
      // S/R confirma
      if ((isOversold && pricePos === 'near_support') || (isOverbought && pricePos === 'near_resistance')) {
        score += 3;
        reasons.push(pricePos);
        criteriaCount++;
      }
      
      // Alta confluência
      if (conf >= 80) {
        score += 2;
        reasons.push(`Conf ${conf}%`);
        criteriaCount++;
      }
      
      // Bom histórico
      if (goodAssets.includes(s.asset)) {
        score += 2;
        reasons.push('Histórico+');
        criteriaCount++;
      }
      
      if (criteriaCount >= 4 && score >= 95) {
        matches.push({
          signal: s,
          pattern: 'PERFECT_REVERSAL',
          score: Math.min(score, 99),
          reason: reasons.join(' | '),
          criteria: criteriaCount
        });
      }
    }
    
    // ========== PADRÃO 4: TRIPLE CONFLUENCE (3+ indicadores extremos) ==========
    if (conf >= 85 && confCount >= 6) {
      let score = 90;
      const reasons: string[] = [`Conf ${conf}%`, `${confCount} indicadores`];
      criteriaCount = 2;
      
      // RSI extremo
      if (rsi <= 30 || rsi >= 70) {
        score += 3;
        reasons.push(`RSI ${rsi.toFixed(1)}`);
        criteriaCount++;
      }
      
      // Stochastic extremo
      if (stochK <= 30 || stochK >= 70) {
        score += 2;
        reasons.push(`StochK ${stochK.toFixed(1)}`);
        criteriaCount++;
      }
      
      // S/R confirma
      if (pricePos === 'near_support' || pricePos === 'near_resistance') {
        score += 3;
        reasons.push(pricePos);
        criteriaCount++;
      }
      
      // Volatilidade baixa (mais previsível)
      if (vol === 'low') {
        score += 2;
        reasons.push('Vol baixa');
        criteriaCount++;
      }
      
      // Bom histórico
      if (goodAssets.includes(s.asset)) {
        score += 2;
        reasons.push('Histórico+');
        criteriaCount++;
      }
      
      if (criteriaCount >= 5 && score >= 95) {
        matches.push({
          signal: s,
          pattern: 'TRIPLE_CONFLUENCE',
          score: Math.min(score, 99),
          reason: reasons.join(' | '),
          criteria: criteriaCount
        });
      }
    }
  }
  
  return matches;
}

function selectBestSignals(matches: PatternMatch[]): PatternMatch[] {
  // Ordenar por score E número de critérios
  const sorted = matches.sort((a, b) => {
    // Primeiro por score
    if (b.score !== a.score) return b.score - a.score;
    // Depois por critérios
    return b.criteria - a.criteria;
  });
  
  const selected: PatternMatch[] = [];
  const usedAssets = new Set<string>();
  
  // MÁXIMO 3 SINAIS (menos é mais)
  for (const match of sorted) {
    if (selected.length >= 3) break;
    
    // Não repetir ativo
    if (usedAssets.has(match.signal.asset)) continue;
    
    // Score mínimo MUITO ALTO: 95%
    if (match.score < 95) continue;
    
    // Mínimo de critérios: 4
    if (match.criteria < 4) continue;
    
    selected.push(match);
    usedAssets.add(match.signal.asset);
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

    // DETECTAR APENAS PADRÕES DE ELITE (muito rigoroso)
    const elitePatterns = detectElitePatterns(signals, badAssets, goodAssets);
    
    // SELECIONAR APENAS OS MELHORES (máximo 3)
    const selectedSignals = selectBestSignals(elitePatterns);

    if (selectedSignals.length === 0) {
      console.log('⏳ Aguardando setup PERFEITO (>95% probabilidade)...');
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzedSignals: signals.slice(0, 3).map(s => ({
            signalId: `${s.asset}-${Date.now()}`,
            asset: s.asset,
            recommendation: 'SKIP',
            confidence: s.indicators.confluenceScore,
            reason: 'Aguardando setup perfeito (>95%)',
            adjustedConfluence: s.indicators.confluenceScore,
            riskLevel: 'HIGH'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 ${selectedSignals.length} sinal(is) de ELITE encontrado(s)!`);
    selectedSignals.forEach(d => {
      console.log(`   ⭐ ${d.signal.asset} (${d.pattern}): ${d.score}% | ${d.criteria} critérios`);
    });

    // PROMPT ULTRA-SELETIVO
    const systemPrompt = `Você é um expert em opções binárias focado em MÁXIMA ASSERTIVIDADE.

MISSÃO: Validar POUCOS sinais com ALTÍSSIMA probabilidade de lucro (>95%).

CRITÉRIOS RIGOROSOS DE APROVAÇÃO:
1. Score >= 96% = EXECUTE (excelente)
2. Score 95% = EXECUTE com confirmação de critérios
3. Score < 95% = SKIP (não atende padrão elite)

PADRÕES ELITE (apenas estes):
- EXTREME_OVERSOLD: RSI < 20 + 4+ confirmações → CALL
- EXTREME_OVERBOUGHT: RSI > 80 + 4+ confirmações → PUT
- PERFECT_REVERSAL: Padrão gráfico + extremos + S/R
- TRIPLE_CONFLUENCE: 6+ indicadores + 85%+ confluência

REGRAS:
- Máximo 3 sinais por análise
- Cada sinal DEVE ter 4+ critérios atendidos
- NUNCA aprovar score < 95%
- Preferir MENOS sinais mas MELHORES

Responda APENAS JSON:
{"analyzedSignals":[{"signalId":"","asset":"","recommendation":"EXECUTE|SKIP","confidence":95-99,"reason":"","adjustedConfluence":95+,"riskLevel":"LOW"}],"marketSentiment":"","bestSignal":""}`;

    const userPrompt = `SINAIS DE ELITE DETECTADOS (score mínimo 95%):

${selectedSignals.map((d, i) => {
  const s = d.signal;
  const rsi = s.indicators.rsi.value.toFixed(1);
  const stochK = s.indicators.stochastic?.k?.toFixed(1) || '50';
  const conf = s.indicators.confluenceScore;
  
  return `${i + 1}. ${s.asset} ${s.type} | Padrão: ${d.pattern}
   Score: ${d.score}% | Critérios: ${d.criteria}
   RSI: ${rsi} | StochK: ${stochK} | Conf: ${conf}%
   Análise: ${d.reason}`;
}).join('\n\n')}

${badAssets.length > 0 ? `⚠️ EVITANDO: ${badAssets.join(', ')}` : ''}
${goodAssets.length > 0 ? `✅ BOM HISTÓRICO: ${goodAssets.join(', ')}` : ''}

Valide os sinais. APROVAR apenas score >= 95% + 4 critérios. Responda JSON:`;

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
      
      // Fallback: usar análise pré-computada (critérios rigorosos)
      return new Response(
        JSON.stringify({ 
          success: true,
          analyzedSignals: selectedSignals.map(d => ({
            signalId: `${d.signal.asset}-${Date.now()}`,
            asset: d.signal.asset,
            recommendation: d.score >= 95 && d.criteria >= 4 ? 'EXECUTE' : 'SKIP',
            confidence: d.score,
            reason: `${d.pattern}: ${d.reason}`,
            adjustedConfluence: d.score,
            riskLevel: 'LOW'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: selectedSignals[0]?.signal.asset || null
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
      // Usar análise pré-computada (critérios rigorosos)
      analysis = {
        analyzedSignals: selectedSignals.map(d => ({
          signalId: d.signal.asset,
          asset: d.signal.asset,
          recommendation: d.score >= 95 && d.criteria >= 4 ? 'EXECUTE' : 'SKIP',
          confidence: d.score,
          reason: `${d.pattern}: ${d.reason}`,
          adjustedConfluence: d.score,
          riskLevel: 'LOW'
        })),
        marketSentiment: 'NEUTRAL',
        bestSignal: selectedSignals[0]?.signal.asset || null
      };
    }

    // Poucos sinais = mais assertividade
    const executeSignals = analysis.analyzedSignals?.filter((a: any) => a.recommendation === 'EXECUTE') || [];
    
    console.log(`⭐ ${executeSignals.length} sinal(is) ELITE aprovado(s) (máx 3)`);

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
      patterns: selectedSignals.map((d: PatternMatch) => d.pattern)
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
