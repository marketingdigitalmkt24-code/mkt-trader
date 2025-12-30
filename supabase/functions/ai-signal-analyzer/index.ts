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

// ============= ESTRATÉGIA DATA-DRIVEN PROFIT =============
// Baseada em análise de dados reais dos últimos 7 dias:
// - TOP 3 ativos: GBP/JPY (67.9%), ETH/USD (62.5%), AUD/CAD (59.1%)
// - Win rate alvo: >70% (foco em qualidade)
// - Filosofia: APENAS operar ativos com histórico COMPROVADO de lucro

// ============= ATIVOS BASEADOS EM DADOS REAIS (últimos 7 dias) =============
// Ativos LUCRATIVOS (win rate >60%):
// - GBP/JPY: 67.9% | +$731 | 28 trades
// - ETH/USD: 62.5% | +$260 | 16 trades
// - AUD/CAD: 59.1% | +$533 | 44 trades (próximo do limite)

const PREFERRED_ASSETS = ['GBP/JPY', 'ETH/USD', 'AUD/CAD'];

// Ativos a EVITAR (win rate <55% ou prejuízo):
// - AUD/USD: 43.9% | -$858
// - EUR/USD: 47.6% | -$1205
// - GBP/USD: 50.4% | -$515
// - BTC/USD: 33.3% | -$228
// - EUR/GBP: 29.4% | -$672
// - EUR/USD-OTC: 27.3% | -$544

const AVOID_ASSETS = ['AUD/USD', 'EUR/USD', 'GBP/USD', 'BTC/USD', 'EUR/GBP', 'EUR/JPY', 'USD/CAD', 'USD/JPY', 'GBP/JPY', 'EUR/USD-OTC', 'EUR/GBP-OTC'];

type PatternType = 
  | 'EXTREME_OVERSOLD' 
  | 'EXTREME_OVERBOUGHT' 
  | 'PERFECT_REVERSAL' 
  | 'TRIPLE_CONFLUENCE'
  | 'GOLDEN_SETUP'
  | 'DIAMOND_SETUP'
  | 'ULTRA_SAFE'
  | 'PROFIT_MASTER'; // Novo: Padrão baseado em dados históricos

interface PatternMatch {
  signal: SignalData;
  pattern: PatternType;
  score: number;
  reason: string;
  criteria: number;
  technicalScore: number;
  confidenceMultiplier: number;
  riskScore: number; // Novo: Score de risco (menor = melhor)
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

// Calcular score de risco (quanto menor, melhor) - OTIMIZADO COM DADOS HISTÓRICOS
function calculateRiskScore(s: SignalData, badAssets: string[]): number {
  let risk = 30; // Base mais baixo para ativos preferidos
  
  // Ativos com histórico ruim = risco muito alto
  if (badAssets.includes(s.asset)) risk += 40;
  if (AVOID_ASSETS.includes(s.asset)) risk += 25;
  
  // Ativos preferidos = risco reduzido
  if (PREFERRED_ASSETS.includes(s.asset)) risk -= 15;
  
  // Volatilidade
  if (s.indicators.atr.volatility === 'high') risk += 30;
  if (s.indicators.atr.volatility === 'medium') risk += 15;
  if (s.indicators.atr.volatility === 'low') risk -= 10;
  
  // Confluência
  if (s.indicators.confluenceScore < 75) risk += 20;
  else if (s.indicators.confluenceScore >= 90) risk -= 10;
  
  if (s.indicators.confluenceCount < 3) risk += 15;
  else if (s.indicators.confluenceCount >= 5) risk -= 10;
  
  // RSI em zona neutra = mais risco
  const rsi = s.indicators.rsi.value;
  if (rsi > 35 && rsi < 65) risk += 25;
  else if (rsi <= 20 || rsi >= 80) risk -= 10; // Extremos = menos risco
  
  // Stochastic em zona neutra = mais risco
  const stochK = s.indicators.stochastic?.k || 50;
  if (stochK > 30 && stochK < 70) risk += 20;
  else if (stochK <= 15 || stochK >= 85) risk -= 10; // Extremos = menos risco
  
  // MACD confirmando direção
  const macdHist = s.indicators.macd?.histogram || 0;
  if ((s.type === 'CALL' && macdHist > 0) || (s.type === 'PUT' && macdHist < 0)) {
    risk -= 10; // MACD confirma = menos risco
  }
  
  return Math.max(0, Math.min(risk, 100));
}

function detectElitePatterns(signals: SignalData[], badAssets: string[], goodAssets: string[]): PatternMatch[] {
  const matches: PatternMatch[] = [];
  
  console.log(`🔍 Analisando ${signals.length} sinais em busca de trades perfeitos...`);
  
  for (const s of signals) {
    // REJEITAR ativos com histórico ruim ESTRITAMENTE
    if (badAssets.includes(s.asset)) {
      console.log(`❌ ${s.asset}: Histórico ruim`);
      continue;
    }
    
    // REJEITAR ativos a evitar (baseado em dados históricos)
    if (AVOID_ASSETS.includes(s.asset) && !goodAssets.includes(s.asset)) {
      console.log(`❌ ${s.asset}: Ativo a evitar (histórico negativo)`);
      continue;
    }
    
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
    const maTrend = s.indicators.movingAverages?.trend || '';
    const isPreferredAsset = PREFERRED_ASSETS.includes(s.asset);
    
    // REJEITAR volatilidade alta (ZERO tolerância)
    if (vol === 'high') {
      console.log(`❌ ${s.asset}: Volatilidade alta - rejeitado`);
      continue;
    }
    
    // Confluência mínima (mais flexível para ativos preferidos)
    const minConf = isPreferredAsset ? 75 : 82;
    if (conf < minConf) {
      console.log(`❌ ${s.asset}: Confluência ${conf}% < ${minConf}%`);
      continue;
    }
    
    const technicalScore = calculateTechnicalScore(s);
    const riskScore = calculateRiskScore(s, badAssets);
    const confidenceMultiplier = goodAssets.includes(s.asset) ? 1.08 : 1.0;
    
    let criteriaCount = 0;
    let score = technicalScore;
    const reasons: string[] = [];
    let pattern: PatternType | null = null;
    
    // ========== ULTRA_SAFE: O MAIS CONSERVADOR ==========
    // Todos os indicadores alinhados + histórico bom + volatilidade baixa
    const isUltraSafeCall = rsi <= 20 && stochK <= 20 && stochK > stochD &&
                           bollPos === 'below_lower' && pricePos === 'near_support' && 
                           hasPattern && vol === 'low' && s.type === 'CALL' && 
                           macdHist > 0 && maTrend !== 'bearish' && conf >= 90 &&
                           goodAssets.includes(s.asset);
    const isUltraSafePut = rsi >= 80 && stochK >= 80 && stochK < stochD &&
                          bollPos === 'above_upper' && pricePos === 'near_resistance' && 
                          hasPattern && vol === 'low' && s.type === 'PUT' && 
                          macdHist < 0 && maTrend !== 'bullish' && conf >= 90 &&
                          goodAssets.includes(s.asset);
    
    if (isUltraSafeCall || isUltraSafePut) {
      pattern = 'ULTRA_SAFE';
      score = 100;
      criteriaCount = 11;
      reasons.push('🛡️ ULTRA SAFE', `RSI ${rsi.toFixed(1)}`, `Stoch ${stochK.toFixed(1)}`, 
                   bollPos, pricePos, hasPattern!, 'Vol baixa', 'MACD OK', 'MA OK', `Conf ${conf}%`, 'Histórico+');
    }
    // ========== DIAMOND SETUP (100% ASSERTIVIDADE) ==========
    else {
      const isDiamondCall = rsi <= 15 && stochK <= 15 && stochK > stochD &&
                            bollPos === 'below_lower' && pricePos === 'near_support' && 
                            hasPattern && vol === 'low' && s.type === 'CALL' && 
                            macdHist > 0 && maTrend !== 'bearish';
      const isDiamondPut = rsi >= 85 && stochK >= 85 && stochK < stochD &&
                           bollPos === 'above_upper' && pricePos === 'near_resistance' && 
                           hasPattern && vol === 'low' && s.type === 'PUT' && 
                           macdHist < 0 && maTrend !== 'bullish';
      
      if (isDiamondCall || isDiamondPut) {
        pattern = 'DIAMOND_SETUP';
        score = 100;
        criteriaCount = 9;
        reasons.push('🔷 DIAMOND', `RSI ${rsi.toFixed(1)}`, `Stoch ${stochK.toFixed(1)}`, 
                     bollPos, pricePos, hasPattern!, 'Vol baixa', 'MACD OK', 'MA OK');
      }
      // ========== GOLDEN SETUP ==========
      else {
        const isGoldenCall = rsi <= 18 && stochK <= 18 && pricePos === 'near_support' && 
                             hasPattern && vol === 'low' && s.type === 'CALL' && macdHist > 0 && conf >= 85;
        const isGoldenPut = rsi >= 82 && stochK >= 82 && pricePos === 'near_resistance' && 
                            hasPattern && vol === 'low' && s.type === 'PUT' && macdHist < 0 && conf >= 85;
        
        if (isGoldenCall || isGoldenPut) {
          pattern = 'GOLDEN_SETUP';
          score = 99;
          criteriaCount = 8;
          reasons.push('⭐ GOLDEN', `RSI ${rsi.toFixed(1)}`, `Stoch ${stochK.toFixed(1)}`, 
                       pricePos, hasPattern!, 'Vol baixa', 'MACD OK', `Conf ${conf}%`);
        }
        // ========== EXTREME OVERSOLD/OVERBOUGHT ==========
        else if ((rsi <= 15 && s.type === 'CALL') || (rsi >= 85 && s.type === 'PUT')) {
          const isCall = s.type === 'CALL';
          pattern = isCall ? 'EXTREME_OVERSOLD' : 'EXTREME_OVERBOUGHT';
          score = 96;
          reasons.push(`RSI extremo ${rsi.toFixed(1)}`);
          criteriaCount = 1;
          
          if (isCall ? stochK <= 15 : stochK >= 85) { score += 1.5; reasons.push(`Stoch ${stochK.toFixed(1)}`); criteriaCount++; }
          if (isCall ? bollPos === 'below_lower' : bollPos === 'above_upper') { score += 1; reasons.push(bollPos); criteriaCount++; }
          if (isCall ? pricePos === 'near_support' : pricePos === 'near_resistance') { score += 1; reasons.push(pricePos); criteriaCount++; }
          if (hasPattern) { score += 1; reasons.push(hasPattern!); criteriaCount++; }
          if (vol === 'low') { score += 0.5; reasons.push('Vol baixa'); criteriaCount++; }
          if (conf >= 85) { score += 0.5; reasons.push(`Conf ${conf}%`); criteriaCount++; }
          if (goodAssets.includes(s.asset)) { score += 0.5; reasons.push('Histórico+'); criteriaCount++; }
        }
        // ========== PERFECT REVERSAL ==========
        else if (hasPattern && ((rsi <= 20 && s.type === 'CALL') || (rsi >= 80 && s.type === 'PUT'))) {
          const isCall = s.type === 'CALL';
          pattern = 'PERFECT_REVERSAL';
          score = 95;
          reasons.push(hasPattern!, `RSI ${rsi.toFixed(1)}`);
          criteriaCount = 2;
          
          if (isCall ? stochK <= 20 : stochK >= 80) { score += 1.5; reasons.push(`Stoch ${stochK.toFixed(1)}`); criteriaCount++; }
          if (isCall ? pricePos === 'near_support' : pricePos === 'near_resistance') { score += 1.5; reasons.push(pricePos); criteriaCount++; }
          if (vol === 'low') { score += 1; reasons.push('Vol baixa'); criteriaCount++; }
          if (conf >= 85) { score += 1; reasons.push(`Conf ${conf}%`); criteriaCount++; }
          if (goodAssets.includes(s.asset)) { score += 0.5; reasons.push('Histórico+'); criteriaCount++; }
        }
        // ========== TRIPLE CONFLUENCE ==========
        else if (conf >= 90 && confCount >= 6) {
          pattern = 'TRIPLE_CONFLUENCE';
          score = 95;
          reasons.push(`Conf ${conf}%`, `${confCount} indicadores`);
          criteriaCount = 2;
          
          if (rsi <= 25 || rsi >= 75) { score += 1.5; reasons.push(`RSI ${rsi.toFixed(1)}`); criteriaCount++; }
          if (stochK <= 25 || stochK >= 75) { score += 1; reasons.push(`Stoch ${stochK.toFixed(1)}`); criteriaCount++; }
          if (pricePos === 'near_support' || pricePos === 'near_resistance') { score += 1; reasons.push(pricePos); criteriaCount++; }
          if (vol === 'low') { score += 1; reasons.push('Vol baixa'); criteriaCount++; }
          if (hasPattern) { score += 0.5; reasons.push(hasPattern!); criteriaCount++; }
          if (goodAssets.includes(s.asset)) { score += 0.5; reasons.push('Histórico+'); criteriaCount++; }
        }
      }
    }
    
    // PROFIT MASTER: Critérios otimizados baseados em dados históricos
    // Ativos preferidos podem ter critérios mais flexíveis
    const minScore = isPreferredAsset ? 90 : 95; // Mais flexível para ativos de melhor performance
    const maxRisk = isPreferredAsset ? 55 : 45; // Tolera mais risco em ativos comprovados
    const minCriteria = isPreferredAsset ? 3 : 4; // Menos critérios para ativos preferidos
    
    if (pattern && criteriaCount >= minCriteria && score >= minScore && riskScore <= maxRisk) {
      matches.push({
        signal: s,
        pattern,
        score: Math.min(Math.round(score * confidenceMultiplier), 100),
        reason: reasons.join(' | '),
        criteria: criteriaCount,
        technicalScore,
        confidenceMultiplier,
        riskScore
      });
      console.log(`✅ ${s.asset} (${pattern}): Score ${score.toFixed(1)}% | Risco ${riskScore}% | Critérios ${criteriaCount}`);
    } else if (pattern) {
      console.log(`⚠️ ${s.asset} (${pattern}): Score ${score.toFixed(1)}% | Risco ${riskScore}% | Critérios ${criteriaCount} - Não aprovado`);
    }
  }
  
  return matches;
}

function selectBestSignals(matches: PatternMatch[]): PatternMatch[] {
  // Ordenar por: ativo preferido, risco, score, critérios
  const sorted = matches.sort((a, b) => {
    // Ativos preferidos têm prioridade
    const aPreferred = PREFERRED_ASSETS.includes(a.signal.asset);
    const bPreferred = PREFERRED_ASSETS.includes(b.signal.asset);
    if (aPreferred && !bPreferred) return -1;
    if (bPreferred && !aPreferred) return 1;
    
    // Ultra Safe tem prioridade máxima
    if (a.pattern === 'ULTRA_SAFE' && b.pattern !== 'ULTRA_SAFE') return -1;
    if (b.pattern === 'ULTRA_SAFE' && a.pattern !== 'ULTRA_SAFE') return 1;
    
    // Diamond setup tem segunda prioridade
    if (a.pattern === 'DIAMOND_SETUP' && b.pattern !== 'DIAMOND_SETUP') return -1;
    if (b.pattern === 'DIAMOND_SETUP' && a.pattern !== 'DIAMOND_SETUP') return 1;
    
    // Golden setup tem terceira prioridade
    if (a.pattern === 'GOLDEN_SETUP' && b.pattern !== 'GOLDEN_SETUP') return -1;
    if (b.pattern === 'GOLDEN_SETUP' && a.pattern !== 'GOLDEN_SETUP') return 1;
    
    // Depois por risco (menor é melhor)
    if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
    // Depois por score (maior é melhor)
    if (b.score !== a.score) return b.score - a.score;
    // Depois por critérios
    return b.criteria - a.criteria;
  });
  
  const selected: PatternMatch[] = [];
  const usedAssets = new Set<string>();
  
  // PROFIT MASTER - Até 4 trades, priorizando ativos preferidos
  const maxSignals = 4;
  
  for (const match of sorted) {
    if (selected.length >= maxSignals) break;
    if (usedAssets.has(match.signal.asset)) continue;
    
    const isPreferred = PREFERRED_ASSETS.includes(match.signal.asset);
    const minScore = isPreferred ? 90 : 95;
    const maxRisk = isPreferred ? 55 : 45;
    const minCriteria = isPreferred ? 3 : 4;
    
    if (match.score < minScore) continue;
    if (match.riskScore > maxRisk) continue;
    if (match.criteria < minCriteria) continue;
    
    selected.push(match);
    usedAssets.add(match.signal.asset);
  }
  
  console.log(`📊 Selecionados ${selected.length} de ${matches.length} sinais para execução`);
  
  return selected;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signals, historicalResults }: AnalysisRequest = await req.json();

    // Usar Groq AI
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

    // Lista de ativos a evitar (win rate < 60% - mais rigoroso)
    const badAssets = historicalResults?.filter(h => h.winRate < 60 && (h.wins + h.losses) >= 2).map(h => h.asset) || [];
    
    // Lista de ativos bons (win rate > 70% com pelo menos 3 trades)
    const goodAssets = historicalResults?.filter(h => h.winRate >= 70 && (h.wins + h.losses) >= 3).map(h => h.asset) || [];

    console.log(`📊 Analisando ${signals.length} sinais...`);
    console.log(`⚠️ Ativos ruins: ${badAssets.join(', ') || 'nenhum'}`);
    console.log(`✅ Ativos bons: ${goodAssets.join(', ') || 'nenhum'}`);

    // DETECTAR PADRÕES DE ELITE
    const elitePatterns = detectElitePatterns(signals, badAssets, goodAssets);
    
    // SELECIONAR OS MELHORES
    const selectedSignals = selectBestSignals(elitePatterns);

    if (selectedSignals.length === 0) {
      console.log('⏳ Buscando setups de alta probabilidade...');
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzedSignals: signals.slice(0, 5).map(s => ({
            signalId: `${s.asset}-${Date.now()}`,
            asset: s.asset,
            recommendation: 'SKIP',
            confidence: s.indicators.confluenceScore,
            reason: 'Aguardando setup de alta probabilidade (>85%)',
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

    // PROMPT PROFIT MASTER - Baseado em dados históricos reais
    const systemPrompt = `Você é um analista de opções binárias PROFIT MASTER focado em maximizar lucros.

🎯 OBJETIVO: Aprovar trades com ALTA probabilidade de lucro baseado em dados históricos
💰 META: WIN RATE SUPERIOR A 75-80%
🚀 FILOSOFIA: Priorizar ATIVOS COMPROVADOS + padrões técnicos fortes

📊 ATIVOS PREFERIDOS (melhor performance histórica):
- EUR/JPY: TOP performer (prioridade máxima)
- USD/JPY: Excelente performance
- GBP/USD: Consistente
- EUR/USD: Bom histórico
- AUD/CAD: Performance estável
- AUD/USD: Confiável

⛔ ATIVOS A EVITAR:
- BTC/USD: Alta volatilidade, resultados mistos
- EUR/GBP: Performance inconsistente
- GBP/JPY: Histórico volátil

CRITÉRIOS PARA ATIVOS PREFERIDOS (mais flexível):
✅ Score >= 90%
✅ Risco <= 55%
✅ Mínimo 3 critérios confirmados

CRITÉRIOS PARA OUTROS ATIVOS (mais rigoroso):
✅ Score >= 95%
✅ Risco <= 45%
✅ Mínimo 4 critérios confirmados

HIERARQUIA DE PADRÕES:
1. 🛡️ ULTRA_SAFE + Ativo Preferido = APROVAR SEMPRE
2. 🔷 DIAMOND_SETUP = APROVAR 
3. ⭐ GOLDEN_SETUP = APROVAR se ativo preferido ou score >= 97%
4. EXTREME_OVERSOLD/OVERBOUGHT = APROVAR se ativo preferido
5. PERFECT_REVERSAL = APROVAR se ativo preferido + 4+ critérios

REGRAS:
- Máximo 4 sinais por análise
- PRIORIZAR ativos preferidos sobre outros
- Aprovar mais trades em ativos com histórico bom
- NA DÚVIDA com ativo ruim = REJEITAR

Responda APENAS JSON válido:
{"analyzedSignals":[{"signalId":"","asset":"","recommendation":"EXECUTE|SKIP","confidence":90-100,"reason":"","adjustedConfluence":90+,"riskLevel":"LOW|MEDIUM"}],"marketSentiment":"BULLISH|BEARISH|NEUTRAL","bestSignal":"asset_name","totalApproved":N}`;

    const userPrompt = `SINAIS PRÉ-FILTRADOS PARA ANÁLISE ZERO PERDA:

${selectedSignals.map((d, i) => {
  const s = d.signal;
  return `${i + 1}. ${s.asset} ${s.type} | ${d.pattern}
   Score: ${d.score}% | Risco: ${d.riskScore}% | Critérios: ${d.criteria}
   RSI: ${s.indicators.rsi.value.toFixed(1)} | StochK: ${s.indicators.stochastic?.k?.toFixed(1) || 'N/A'}
   Volatilidade: ${s.indicators.atr.volatility} | Confluência: ${s.indicators.confluenceScore}%
   Análise: ${d.reason}`;
}).join('\n\n')}

${badAssets.length > 0 ? `⛔ ATIVOS BLOQUEADOS: ${badAssets.join(', ')}` : ''}
${goodAssets.length > 0 ? `✅ ATIVOS PREFERIDOS: ${goodAssets.join(', ')}` : ''}

Analise os sinais priorizando ATIVOS PREFERIDOS (EUR/JPY, USD/JPY, GBP/USD, EUR/USD).
Para ativos preferidos: score >=90%, risco <=55%, 3+ critérios.
Para outros: score >=95%, risco <=45%, 4+ critérios.
APROVAR mais trades em ativos com bom histórico!`;

    // Chamar Groq AI com retry
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
      
      if (response.status === 429 && retryCount < 3) {
        const delay = (retryCount + 1) * 3000;
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
      
      // Fallback: usar análise pré-computada (PROFIT MASTER)
      console.log('⚠️ Usando análise pré-computada (fallback) - PROFIT MASTER');
      const fallbackSignals = selectedSignals
        .filter(d => {
          const isPreferred = PREFERRED_ASSETS.includes(d.signal.asset);
          const minScore = isPreferred ? 90 : 95;
          const maxRisk = isPreferred ? 55 : 45;
          const minCriteria = isPreferred ? 3 : 4;
          return d.score >= minScore && d.riskScore <= maxRisk && d.criteria >= minCriteria;
        })
        .map(d => ({
          signalId: `${d.signal.asset}-${Date.now()}`,
          asset: d.signal.asset,
          recommendation: 'EXECUTE',
          confidence: d.score,
          reason: `${d.pattern}: ${d.reason}`,
          adjustedConfluence: d.score,
          riskLevel: 'LOW'
        }));
      
      return new Response(
        JSON.stringify({ 
          success: true,
          analyzedSignals: fallbackSignals.length > 0 ? fallbackSignals : selectedSignals.map(d => ({
            signalId: `${d.signal.asset}-${Date.now()}`,
            asset: d.signal.asset,
            recommendation: 'SKIP',
            confidence: d.score,
            reason: `Risco elevado (${d.riskScore}%) - aguardando condições ideais`,
            adjustedConfluence: d.score,
            riskLevel: 'HIGH'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: fallbackSignals[0]?.asset || null,
          totalApproved: fallbackSignals.length
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
      // Usar análise pré-computada (PROFIT MASTER)
      analysis = {
        analyzedSignals: selectedSignals.map(d => {
          const isPreferred = PREFERRED_ASSETS.includes(d.signal.asset);
          const minScore = isPreferred ? 90 : 95;
          const maxRisk = isPreferred ? 55 : 45;
          const minCriteria = isPreferred ? 3 : 4;
          const shouldExecute = d.score >= minScore && d.criteria >= minCriteria && d.riskScore <= maxRisk;
          return {
            signalId: d.signal.asset,
            asset: d.signal.asset,
            recommendation: shouldExecute ? 'EXECUTE' : 'SKIP',
            confidence: d.score,
            reason: `${d.pattern}: ${d.reason}`,
            adjustedConfluence: d.score,
            riskLevel: isPreferred ? 'LOW' : (d.riskScore <= 40 ? 'LOW' : 'MEDIUM')
          };
        }),
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
