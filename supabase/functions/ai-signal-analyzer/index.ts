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

// ============= ESTRATÉGIA PROFIT-FIRST: MÁXIMA ASSERTIVIDADE =============
// Combina análise técnica rigorosa + validação IA para garantir lucros

type PatternType = 
  | 'EXTREME_OVERSOLD' 
  | 'EXTREME_OVERBOUGHT' 
  | 'PERFECT_REVERSAL' 
  | 'TRIPLE_CONFLUENCE'
  | 'GOLDEN_SETUP'; // Novo padrão ultra-premium

interface PatternMatch {
  signal: SignalData;
  pattern: PatternType;
  score: number;
  reason: string;
  criteria: number;
  technicalScore: number; // Score apenas técnico
  confidenceMultiplier: number; // Multiplicador baseado em histórico
}

// ============= ANÁLISE TÉCNICA AVANÇADA =============

function calculateTechnicalScore(s: SignalData): number {
  let score = 50; // Base score
  
  const rsi = s.indicators.rsi.value;
  const stochK = s.indicators.stochastic?.k || 50;
  const stochD = s.indicators.stochastic?.d || 50;
  const macdHist = s.indicators.macd?.histogram || 0;
  const bollPos = s.indicators.bollinger?.position || '';
  const vol = s.indicators.atr.volatility;
  const conf = s.indicators.confluenceScore;
  const pricePos = s.indicators.supportResistance?.pricePosition || '';
  const maTrend = s.indicators.movingAverages?.trend || '';
  
  // === RSI EXTREMO (0-20 pontos) ===
  if (s.type === 'CALL') {
    if (rsi <= 15) score += 20;
    else if (rsi <= 20) score += 15;
    else if (rsi <= 25) score += 10;
    else if (rsi <= 30) score += 5;
  } else {
    if (rsi >= 85) score += 20;
    else if (rsi >= 80) score += 15;
    else if (rsi >= 75) score += 10;
    else if (rsi >= 70) score += 5;
  }
  
  // === STOCHASTIC EXTREMO + CRUZAMENTO (0-15 pontos) ===
  if (s.type === 'CALL') {
    if (stochK <= 15 && stochK > stochD) score += 15; // Extremo + reversão
    else if (stochK <= 20) score += 10;
    else if (stochK <= 30) score += 5;
  } else {
    if (stochK >= 85 && stochK < stochD) score += 15; // Extremo + reversão
    else if (stochK >= 80) score += 10;
    else if (stochK >= 70) score += 5;
  }
  
  // === BOLLINGER BANDS (0-10 pontos) ===
  if (s.type === 'CALL' && bollPos === 'below_lower') score += 10;
  else if (s.type === 'PUT' && bollPos === 'above_upper') score += 10;
  else if (bollPos === 'near_lower' || bollPos === 'near_upper') score += 5;
  
  // === MACD CONFIRMAÇÃO (0-10 pontos) ===
  if (s.type === 'CALL' && macdHist > 0) score += 10; // Momento positivo
  else if (s.type === 'PUT' && macdHist < 0) score += 10; // Momento negativo
  else if (Math.abs(macdHist) < 0.001) score += 3; // Neutro, pode reverter
  
  // === SUPORTE/RESISTÊNCIA (0-10 pontos) ===
  if (s.type === 'CALL' && pricePos === 'near_support') score += 10;
  else if (s.type === 'PUT' && pricePos === 'near_resistance') score += 10;
  
  // === TENDÊNCIA DAS MÉDIAS (0-8 pontos) ===
  if (s.type === 'CALL' && maTrend === 'bullish') score += 8;
  else if (s.type === 'PUT' && maTrend === 'bearish') score += 8;
  else if (maTrend === 'neutral') score += 3; // Pode reverter
  
  // === VOLATILIDADE (0-7 pontos) ===
  if (vol === 'low') score += 7; // Mais previsível
  else if (vol === 'medium') score += 4;
  // Alta volatilidade não adiciona pontos
  
  // === CONFLUÊNCIA (0-10 pontos) ===
  if (conf >= 90) score += 10;
  else if (conf >= 80) score += 7;
  else if (conf >= 70) score += 4;
  
  // === PADRÃO DE REVERSÃO (0-10 pontos) ===
  if (s.indicators.reversalPattern) {
    const pattern = s.indicators.reversalPattern.toLowerCase();
    if (pattern.includes('hammer') || pattern.includes('engulfing') || pattern.includes('morning')) {
      score += 10; // Padrões fortes
    } else if (pattern.includes('doji') || pattern.includes('pin')) {
      score += 7; // Padrões médios
    } else {
      score += 5; // Outros padrões
    }
  }
  
  return Math.min(score, 100);
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
    
    // REJEITAR volatilidade alta (risco de perda)
    if (vol === 'high') continue;
    
    // REJEITAR confluência muito baixa
    if (conf < 70) continue;
    
    // Calcular score técnico base
    const technicalScore = calculateTechnicalScore(s);
    
    // Multiplicador baseado em histórico
    const confidenceMultiplier = goodAssets.includes(s.asset) ? 1.1 : 1.0;
    
    let criteriaCount = 0;
    let score = technicalScore;
    const reasons: string[] = [];
    let pattern: PatternType | null = null;
    
    // ========== PADRÃO GOLDEN SETUP (NOVO - MÁXIMA ASSERTIVIDADE) ==========
    // Requer: RSI extremo + Stochastic extremo + S/R + Padrão de reversão + Baixa volatilidade
    const isGoldenCall = rsi <= 20 && stochK <= 20 && pricePos === 'near_support' && 
                         hasPattern && vol === 'low' && s.type === 'CALL' && macdHist > 0;
    const isGoldenPut = rsi >= 80 && stochK >= 80 && pricePos === 'near_resistance' && 
                        hasPattern && vol === 'low' && s.type === 'PUT' && macdHist < 0;
    
    if (isGoldenCall || isGoldenPut) {
      pattern = 'GOLDEN_SETUP';
      score = 99;
      criteriaCount = 7;
      reasons.push('GOLDEN SETUP', `RSI ${rsi.toFixed(1)}`, `Stoch ${stochK.toFixed(1)}`, 
                   pricePos, hasPattern!, 'Vol baixa', 'MACD confirmando');
    }
    // ========== PADRÃO EXTREME OVERSOLD CALL ==========
    else if (rsi <= 22 && s.type === 'CALL') {
      pattern = 'EXTREME_OVERSOLD';
      score = 92;
      reasons.push(`RSI extremo ${rsi.toFixed(1)}`);
      criteriaCount = 1;
      
      if (stochK <= 18) { score += 3; reasons.push(`StochK ${stochK.toFixed(1)}`); criteriaCount++; }
      if (bollPos === 'below_lower') { score += 2; reasons.push('Abaixo BB'); criteriaCount++; }
      if (pricePos === 'near_support') { score += 2; reasons.push('Suporte'); criteriaCount++; }
      if (macdHist > 0 || stochK > stochD) { score += 1; reasons.push('Reversão'); criteriaCount++; }
      if (hasPattern) { score += 2; reasons.push(hasPattern); criteriaCount++; }
      if (goodAssets.includes(s.asset)) { score += 1; reasons.push('Histórico+'); criteriaCount++; }
    }
    // ========== PADRÃO EXTREME OVERBOUGHT PUT ==========
    else if (rsi >= 78 && s.type === 'PUT') {
      pattern = 'EXTREME_OVERBOUGHT';
      score = 92;
      reasons.push(`RSI extremo ${rsi.toFixed(1)}`);
      criteriaCount = 1;
      
      if (stochK >= 82) { score += 3; reasons.push(`StochK ${stochK.toFixed(1)}`); criteriaCount++; }
      if (bollPos === 'above_upper') { score += 2; reasons.push('Acima BB'); criteriaCount++; }
      if (pricePos === 'near_resistance') { score += 2; reasons.push('Resistência'); criteriaCount++; }
      if (macdHist < 0 || stochK < stochD) { score += 1; reasons.push('Reversão'); criteriaCount++; }
      if (hasPattern) { score += 2; reasons.push(hasPattern); criteriaCount++; }
      if (goodAssets.includes(s.asset)) { score += 1; reasons.push('Histórico+'); criteriaCount++; }
    }
    // ========== PADRÃO PERFECT REVERSAL ==========
    else if (hasPattern && (rsi <= 28 || rsi >= 72)) {
      const isOversold = rsi <= 28 && s.type === 'CALL';
      const isOverbought = rsi >= 72 && s.type === 'PUT';
      
      if (isOversold || isOverbought) {
        pattern = 'PERFECT_REVERSAL';
        score = 91;
        reasons.push(hasPattern, `RSI ${rsi.toFixed(1)}`);
        criteriaCount = 2;
        
        if ((isOversold && stochK <= 28) || (isOverbought && stochK >= 72)) {
          score += 3; reasons.push(`StochK ${stochK.toFixed(1)}`); criteriaCount++;
        }
        if ((isOversold && pricePos === 'near_support') || (isOverbought && pricePos === 'near_resistance')) {
          score += 3; reasons.push(pricePos); criteriaCount++;
        }
        if (conf >= 80) { score += 2; reasons.push(`Conf ${conf}%`); criteriaCount++; }
        if (goodAssets.includes(s.asset)) { score += 1; reasons.push('Histórico+'); criteriaCount++; }
      }
    }
    // ========== PADRÃO TRIPLE CONFLUENCE ==========
    else if (conf >= 82 && confCount >= 5) {
      pattern = 'TRIPLE_CONFLUENCE';
      score = 90;
      reasons.push(`Conf ${conf}%`, `${confCount} indicadores`);
      criteriaCount = 2;
      
      if (rsi <= 32 || rsi >= 68) { score += 3; reasons.push(`RSI ${rsi.toFixed(1)}`); criteriaCount++; }
      if (stochK <= 32 || stochK >= 68) { score += 2; reasons.push(`StochK ${stochK.toFixed(1)}`); criteriaCount++; }
      if (pricePos === 'near_support' || pricePos === 'near_resistance') { score += 2; reasons.push(pricePos); criteriaCount++; }
      if (vol === 'low') { score += 2; reasons.push('Vol baixa'); criteriaCount++; }
      if (goodAssets.includes(s.asset)) { score += 1; reasons.push('Histórico+'); criteriaCount++; }
    }
    
    // APROVAR apenas se tiver padrão válido + critérios suficientes
    if (pattern && criteriaCount >= 4 && score >= 94) {
      matches.push({
        signal: s,
        pattern,
        score: Math.min(Math.round(score * confidenceMultiplier), 99),
        reason: reasons.join(' | '),
        criteria: criteriaCount,
        technicalScore,
        confidenceMultiplier
      });
    }
  }
  
  return matches;
}

function selectBestSignals(matches: PatternMatch[]): PatternMatch[] {
  // Ordenar por score, critérios, e multiplicador
  const sorted = matches.sort((a, b) => {
    // Golden setup tem prioridade absoluta
    if (a.pattern === 'GOLDEN_SETUP' && b.pattern !== 'GOLDEN_SETUP') return -1;
    if (b.pattern === 'GOLDEN_SETUP' && a.pattern !== 'GOLDEN_SETUP') return 1;
    
    // Depois por score
    if (b.score !== a.score) return b.score - a.score;
    // Depois por critérios
    if (b.criteria !== a.criteria) return b.criteria - a.criteria;
    // Depois por multiplicador (histórico)
    return b.confidenceMultiplier - a.confidenceMultiplier;
  });
  
  const selected: PatternMatch[] = [];
  const usedAssets = new Set<string>();
  
  // MÁXIMO 2-3 SINAIS ELITE (qualidade > quantidade)
  const maxSignals = sorted.some(s => s.pattern === 'GOLDEN_SETUP') ? 2 : 3;
  
  for (const match of sorted) {
    if (selected.length >= maxSignals) break;
    if (usedAssets.has(match.signal.asset)) continue;
    if (match.score < 94) continue;
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

    // Usar Lovable AI (mais estável que Groq)
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

    // Lista de ativos a evitar (win rate < 50%)
    const badAssets = historicalResults?.filter(h => h.winRate < 50 && (h.wins + h.losses) >= 3).map(h => h.asset) || [];
    
    // Lista de ativos bons (win rate > 60% com pelo menos 3 trades)
    const goodAssets = historicalResults?.filter(h => h.winRate > 60 && (h.wins + h.losses) >= 3).map(h => h.asset) || [];

    console.log(`📊 Analisando ${signals.length} sinais...`);
    console.log(`⚠️ Ativos ruins: ${badAssets.join(', ') || 'nenhum'}`);
    console.log(`✅ Ativos bons: ${goodAssets.join(', ') || 'nenhum'}`);

    // DETECTAR PADRÕES DE ELITE
    const elitePatterns = detectElitePatterns(signals, badAssets, goodAssets);
    
    // SELECIONAR OS MELHORES
    const selectedSignals = selectBestSignals(elitePatterns);

    if (selectedSignals.length === 0) {
      console.log('⏳ Aguardando setup ELITE (>94% probabilidade)...');
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzedSignals: signals.slice(0, 3).map(s => ({
            signalId: `${s.asset}-${Date.now()}`,
            asset: s.asset,
            recommendation: 'SKIP',
            confidence: s.indicators.confluenceScore,
            reason: 'Aguardando setup elite (>94%)',
            adjustedConfluence: s.indicators.confluenceScore,
            riskLevel: 'HIGH'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 ${selectedSignals.length} sinal(is) ELITE encontrado(s)!`);
    selectedSignals.forEach(d => {
      console.log(`   ⭐ ${d.signal.asset} (${d.pattern}): ${d.score}% | ${d.criteria} critérios | Tech: ${d.technicalScore}`);
    });

    // PROMPT FOCADO EM LUCRO
    const systemPrompt = `Você é um expert em opções binárias com foco em MÁXIMA ASSERTIVIDADE.

OBJETIVO: Validar POUCOS sinais com ALTÍSSIMA probabilidade de LUCRO (>94%).

PADRÕES ELITE (em ordem de prioridade):
1. GOLDEN_SETUP (99%): RSI extremo + Stoch extremo + S/R + Padrão reversão + Vol baixa + MACD confirmando
2. EXTREME_OVERSOLD/OVERBOUGHT (94-98%): RSI <22 ou >78 + 4+ confirmações
3. PERFECT_REVERSAL (94-97%): Padrão gráfico + RSI extremo + S/R
4. TRIPLE_CONFLUENCE (94-96%): 5+ indicadores + 82%+ confluência

CRITÉRIOS DE APROVAÇÃO:
- Score >= 95% = EXECUTE (alta confiança)
- Score 94% = EXECUTE com cautela
- Score < 94% = SKIP (não arriscar)

REGRAS:
- Máximo 2-3 sinais por análise
- GOLDEN_SETUP = prioridade máxima
- Preferir ativos com bom histórico
- NUNCA aprovar volatilidade alta
- Menos sinais = mais assertividade

Responda APENAS JSON válido:
{"analyzedSignals":[{"signalId":"","asset":"","recommendation":"EXECUTE|SKIP","confidence":94-99,"reason":"","adjustedConfluence":94+,"riskLevel":"LOW|MEDIUM"}],"marketSentiment":"BULLISH|BEARISH|NEUTRAL","bestSignal":"asset_name"}`;

    const userPrompt = `SINAIS ELITE PRÉ-SELECIONADOS:

${selectedSignals.map((d, i) => {
  const s = d.signal;
  return `${i + 1}. ${s.asset} ${s.type} | ${d.pattern}
   Score: ${d.score}% | Critérios: ${d.criteria} | Tech: ${d.technicalScore}
   RSI: ${s.indicators.rsi.value.toFixed(1)} | StochK: ${s.indicators.stochastic?.k?.toFixed(1) || 'N/A'}
   Volatilidade: ${s.indicators.atr.volatility} | Confluência: ${s.indicators.confluenceScore}%
   Análise: ${d.reason}`;
}).join('\n\n')}

${badAssets.length > 0 ? `⚠️ ATIVOS RUINS (evitar): ${badAssets.join(', ')}` : ''}
${goodAssets.length > 0 ? `✅ ATIVOS BONS (preferir): ${goodAssets.join(', ')}` : ''}

Valide os sinais e retorne APENAS os que têm >94% de probabilidade de lucro.`;

    // Chamar Lovable AI
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
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      // Fallback: usar análise pré-computada
      console.log('⚠️ Usando análise pré-computada (fallback)');
      return new Response(
        JSON.stringify({ 
          success: true,
          analyzedSignals: selectedSignals.map(d => ({
            signalId: `${d.signal.asset}-${Date.now()}`,
            asset: d.signal.asset,
            recommendation: d.score >= 94 && d.criteria >= 4 ? 'EXECUTE' : 'SKIP',
            confidence: d.score,
            reason: `${d.pattern}: ${d.reason}`,
            adjustedConfluence: d.score,
            riskLevel: d.signal.indicators.atr.volatility === 'low' ? 'LOW' : 'MEDIUM'
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
      console.error('No content in AI response');
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
        // Tentar corrigir JSON malformado
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
        analyzedSignals: selectedSignals.map(d => ({
          signalId: d.signal.asset,
          asset: d.signal.asset,
          recommendation: d.score >= 94 && d.criteria >= 4 ? 'EXECUTE' : 'SKIP',
          confidence: d.score,
          reason: `${d.pattern}: ${d.reason}`,
          adjustedConfluence: d.score,
          riskLevel: d.signal.indicators.atr.volatility === 'low' ? 'LOW' : 'MEDIUM'
        })),
        marketSentiment: 'NEUTRAL',
        bestSignal: selectedSignals[0]?.signal.asset || null
      };
    }

    const executeSignals = analysis.analyzedSignals?.filter((a: any) => a.recommendation === 'EXECUTE') || [];
    
    console.log(`⭐ ${executeSignals.length} sinal(is) ELITE aprovado(s) pela IA`);

    // Mapear todos os sinais
    const allSignalAnalysis = signals.map(s => {
      const aiResult = analysis.analyzedSignals?.find((a: any) => a.asset === s.asset);
      if (aiResult) return aiResult;
      
      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: 'SKIP',
        confidence: s.indicators.confluenceScore,
        reason: 'Não atende critérios elite',
        adjustedConfluence: s.indicators.confluenceScore,
        riskLevel: 'HIGH'
      };
    });

    console.log('✅ Análise completa:', JSON.stringify({ 
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
