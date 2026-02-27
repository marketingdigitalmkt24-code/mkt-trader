import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

interface AssetPerformance {
  asset: string;
  wins: number;
  losses: number;
  winRate: number;
  profit: number;
  trades: number;
}

// ============= LEARNING ENGINE: Aprendizado com operações passadas =============

interface LearnedPattern {
  // Performance por ativo
  assetPerformance: Map<string, AssetPerformance>;
  // Performance por direção (CALL/PUT) por ativo
  directionPerformance: Map<string, { callWinRate: number; putWinRate: number; callTrades: number; putTrades: number }>;
  // Horários mais lucrativos (hora UTC)
  hourlyPerformance: Map<number, { wins: number; losses: number; profit: number }>;
  // Performance por timeframe
  timeframePerformance: Map<string, { wins: number; losses: number; profit: number }>;
  // Sequências de loss por ativo (para evitar overtrading em ativos perdedores)
  recentLossStreaks: Map<string, number>;
  // Lucro total e métricas gerais
  totalProfit: number;
  totalTrades: number;
  overallWinRate: number;
  bestHours: number[];
  worstHours: number[];
  hasSufficientData: boolean;
}

async function buildLearningModel(): Promise<LearnedPattern> {
  const model: LearnedPattern = {
    assetPerformance: new Map(),
    directionPerformance: new Map(),
    hourlyPerformance: new Map(),
    timeframePerformance: new Map(),
    recentLossStreaks: new Map(),
    totalProfit: 0,
    totalTrades: 0,
    overallWinRate: 50,
    bestHours: [],
    worstHours: [],
    hasSufficientData: false,
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return model;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar resultados dos últimos 14 dias para aprendizado mais robusto
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: results, error } = await supabase
      .from('operation_results')
      .select('asset, result, profit, direction, timeframe, created_at')
      .gte('created_at', fourteenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !results || results.length === 0) {
      console.log('📚 Sem dados para aprendizado');
      return model;
    }

    model.totalTrades = results.length;
    model.hasSufficientData = results.length >= 5;

    console.log(`📚 LEARNING ENGINE: Analisando ${results.length} operações dos últimos 14 dias`);

    // ===== 1. Performance por ATIVO =====
    const assetStats: Record<string, { wins: number; losses: number; profit: number }> = {};
    // ===== 2. Performance por DIREÇÃO por ativo =====
    const dirStats: Record<string, { callWins: number; callLosses: number; putWins: number; putLosses: number }> = {};
    // ===== 3. Performance por HORA =====
    const hourStats: Record<number, { wins: number; losses: number; profit: number }> = {};
    // ===== 4. Performance por TIMEFRAME =====
    const tfStats: Record<string, { wins: number; losses: number; profit: number }> = {};
    // ===== 5. Sequência recente de losses por ativo =====
    const recentByAsset: Record<string, string[]> = {};

    let totalWins = 0;
    let totalLosses = 0;

    for (const r of results) {
      const isWin = r.result === 'win';
      const isLoss = r.result === 'loss';
      const profit = r.profit || 0;

      model.totalProfit += profit;
      if (isWin) totalWins++;
      if (isLoss) totalLosses++;

      // Asset performance
      if (!assetStats[r.asset]) assetStats[r.asset] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) assetStats[r.asset].wins++;
      if (isLoss) assetStats[r.asset].losses++;
      assetStats[r.asset].profit += profit;

      // Direction performance
      if (!dirStats[r.asset]) dirStats[r.asset] = { callWins: 0, callLosses: 0, putWins: 0, putLosses: 0 };
      if (r.direction === 'call' || r.direction === 'CALL') {
        if (isWin) dirStats[r.asset].callWins++;
        if (isLoss) dirStats[r.asset].callLosses++;
      } else {
        if (isWin) dirStats[r.asset].putWins++;
        if (isLoss) dirStats[r.asset].putLosses++;
      }

      // Hourly performance
      const hour = new Date(r.created_at).getUTCHours();
      if (!hourStats[hour]) hourStats[hour] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) hourStats[hour].wins++;
      if (isLoss) hourStats[hour].losses++;
      hourStats[hour].profit += profit;

      // Timeframe performance
      const tf = r.timeframe || 'M1';
      if (!tfStats[tf]) tfStats[tf] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) tfStats[tf].wins++;
      if (isLoss) tfStats[tf].losses++;
      tfStats[tf].profit += profit;

      // Recent results by asset (para detectar loss streaks)
      if (!recentByAsset[r.asset]) recentByAsset[r.asset] = [];
      if (recentByAsset[r.asset].length < 5) {
        recentByAsset[r.asset].push(r.result);
      }
    }

    // Processar asset performance
    for (const [asset, stats] of Object.entries(assetStats)) {
      const total = stats.wins + stats.losses;
      if (total < 1) continue;
      model.assetPerformance.set(asset, {
        asset,
        wins: stats.wins,
        losses: stats.losses,
        winRate: Math.round((stats.wins / total) * 1000) / 10,
        profit: Math.round(stats.profit * 100) / 100,
        trades: total,
      });
    }

    // Processar direction performance
    for (const [asset, ds] of Object.entries(dirStats)) {
      const callTotal = ds.callWins + ds.callLosses;
      const putTotal = ds.putWins + ds.putLosses;
      model.directionPerformance.set(asset, {
        callWinRate: callTotal > 0 ? Math.round((ds.callWins / callTotal) * 1000) / 10 : 50,
        putWinRate: putTotal > 0 ? Math.round((ds.putWins / putTotal) * 1000) / 10 : 50,
        callTrades: callTotal,
        putTrades: putTotal,
      });
    }

    // Processar hourly performance
    for (const [hourStr, hs] of Object.entries(hourStats)) {
      const hour = parseInt(hourStr);
      const total = hs.wins + hs.losses;
      model.hourlyPerformance.set(hour, hs);
      if (total >= 3) {
        const winRate = (hs.wins / total) * 100;
        if (winRate >= 60 && hs.profit > 0) model.bestHours.push(hour);
        if (winRate < 40 && hs.profit < 0) model.worstHours.push(hour);
      }
    }

    // Processar timeframe performance
    for (const [tf, ts] of Object.entries(tfStats)) {
      model.timeframePerformance.set(tf, ts);
    }

    // Processar loss streaks
    for (const [asset, recent] of Object.entries(recentByAsset)) {
      let streak = 0;
      for (const r of recent) {
        if (r === 'loss') streak++;
        else break;
      }
      if (streak >= 2) model.recentLossStreaks.set(asset, streak);
    }

    model.overallWinRate = totalWins + totalLosses > 0 ? Math.round((totalWins / (totalWins + totalLosses)) * 1000) / 10 : 50;

    // ===== LOGGING DO APRENDIZADO =====
    console.log(`\n🧠 ===== MODELO DE APRENDIZADO =====`);
    console.log(`   📊 Total: ${model.totalTrades} trades | Win Rate: ${model.overallWinRate}% | Lucro: $${model.totalProfit.toFixed(2)}`);
    
    // Top ativos
    const sortedAssets = Array.from(model.assetPerformance.values()).sort((a, b) => b.profit - a.profit);
    if (sortedAssets.length > 0) {
      console.log(`   🏆 TOP ATIVOS (por lucro):`);
      sortedAssets.slice(0, 5).forEach((a, i) => {
        const dir = model.directionPerformance.get(a.asset);
        const dirInfo = dir ? ` | CALL: ${dir.callWinRate}% (${dir.callTrades}) | PUT: ${dir.putWinRate}% (${dir.putTrades})` : '';
        console.log(`      ${i + 1}. ${a.asset}: WR ${a.winRate}% | ${a.trades} trades | $${a.profit}${dirInfo}`);
      });
    }

    // Piores ativos
    const worstAssets = sortedAssets.filter(a => a.profit < 0 && a.trades >= 2);
    if (worstAssets.length > 0) {
      console.log(`   ⛔ PIORES ATIVOS:`);
      worstAssets.forEach(a => console.log(`      ❌ ${a.asset}: WR ${a.winRate}% | $${a.profit}`));
    }

    if (model.bestHours.length > 0) console.log(`   ⏰ MELHORES HORÁRIOS (UTC): ${model.bestHours.join('h, ')}h`);
    if (model.worstHours.length > 0) console.log(`   🚫 PIORES HORÁRIOS (UTC): ${model.worstHours.join('h, ')}h`);

    // Timeframe
    model.timeframePerformance.forEach((ts, tf) => {
      const total = ts.wins + ts.losses;
      if (total >= 2) {
        const wr = Math.round((ts.wins / total) * 100);
        console.log(`   📏 ${tf}: WR ${wr}% | ${total} trades | $${ts.profit.toFixed(2)}`);
      }
    });

    // Loss streaks
    model.recentLossStreaks.forEach((streak, asset) => {
      console.log(`   ⚠️ ${asset}: ${streak} losses consecutivos recentes`);
    });

    console.log(`🧠 ================================\n`);

    return model;
  } catch (e) {
    console.error('Erro no Learning Engine:', e);
    return model;
  }
}

// ============= SCORING BASEADO EM APRENDIZADO =============

function calculateLearnedScore(s: SignalData, model: LearnedPattern): {
  score: number;
  adjustments: string[];
  shouldSkip: boolean;
  skipReason?: string;
} {
  let score = 0;
  const adjustments: string[] = [];
  const currentHour = new Date().getUTCHours();

  // 1. ATIVO COM HISTÓRICO TERRÍVEL → BLOQUEAR
  const assetPerf = model.assetPerformance.get(s.asset);
  if (assetPerf && assetPerf.trades >= 3 && assetPerf.winRate < 35 && assetPerf.profit < -50) {
    return { score: 0, adjustments: ['ATIVO BLOQUEADO: histórico péssimo'], shouldSkip: true, skipReason: `WR ${assetPerf.winRate}% | $${assetPerf.profit}` };
  }

  // 2. LOSS STREAK RECENTE → BLOQUEAR
  const lossStreak = model.recentLossStreaks.get(s.asset) || 0;
  if (lossStreak >= 3) {
    return { score: 0, adjustments: [`BLOQUEADO: ${lossStreak} losses consecutivos`], shouldSkip: true, skipReason: `${lossStreak} losses seguidos` };
  }

  // 3. HORÁRIO PÉSSIMO → BLOQUEAR
  if (model.worstHours.includes(currentHour)) {
    const hourData = model.hourlyPerformance.get(currentHour);
    if (hourData) {
      const total = hourData.wins + hourData.losses;
      const wr = Math.round((hourData.wins / total) * 100);
      return { score: 0, adjustments: [`HORÁRIO RUIM: ${currentHour}h UTC (WR: ${wr}%)`], shouldSkip: true, skipReason: `Horário ${currentHour}h desfavorável` };
    }
  }

  // ===== BONIFICAÇÕES =====

  // 4. Ativo com bom histórico
  if (assetPerf) {
    if (assetPerf.winRate >= 60 && assetPerf.profit > 0) {
      score += 15;
      adjustments.push(`ATIVO TOP: WR ${assetPerf.winRate}% | $${assetPerf.profit}`);
    } else if (assetPerf.winRate >= 50 && assetPerf.profit >= 0) {
      score += 8;
      adjustments.push(`ATIVO BOM: WR ${assetPerf.winRate}%`);
    } else if (assetPerf.winRate < 45 && assetPerf.trades >= 3) {
      score -= 10;
      adjustments.push(`ATIVO FRACO: WR ${assetPerf.winRate}%`);
    }
  }

  // 5. Direção com melhor taxa de acerto para este ativo
  const dirPerf = model.directionPerformance.get(s.asset);
  if (dirPerf) {
    const dirType = s.type;
    const dirWinRate = dirType === 'CALL' ? dirPerf.callWinRate : dirPerf.putWinRate;
    const dirTrades = dirType === 'CALL' ? dirPerf.callTrades : dirPerf.putTrades;
    const otherWinRate = dirType === 'CALL' ? dirPerf.putWinRate : dirPerf.callWinRate;

    if (dirTrades >= 2) {
      if (dirWinRate >= 65) {
        score += 12;
        adjustments.push(`DIREÇÃO FORTE: ${dirType} WR ${dirWinRate}%`);
      } else if (dirWinRate < 35 && dirTrades >= 3) {
        score -= 15;
        adjustments.push(`DIREÇÃO FRACA: ${dirType} WR ${dirWinRate}% (${otherWinRate === 'CALL' ? 'PUT' : 'CALL'} é melhor)`);
      }
    }
  }

  // 6. Horário favorável
  if (model.bestHours.includes(currentHour)) {
    score += 10;
    adjustments.push(`HORÁRIO TOP: ${currentHour}h UTC`);
  }

  // 7. Timeframe com melhor performance
  const tfPerf = model.timeframePerformance.get(s.timeframe);
  if (tfPerf) {
    const total = tfPerf.wins + tfPerf.losses;
    if (total >= 3) {
      const wr = (tfPerf.wins / total) * 100;
      if (wr >= 60 && tfPerf.profit > 0) {
        score += 8;
        adjustments.push(`TIMEFRAME BOM: ${s.timeframe} WR ${Math.round(wr)}%`);
      } else if (wr < 40 && tfPerf.profit < 0) {
        score -= 8;
        adjustments.push(`TIMEFRAME RUIM: ${s.timeframe} WR ${Math.round(wr)}%`);
      }
    }
  }

  // 8. Loss streak leve (2 losses) = cautela
  if (lossStreak === 2) {
    score -= 5;
    adjustments.push(`CAUTELA: 2 losses recentes`);
  }

  return { score, adjustments, shouldSkip: false };
}

// ============= ANÁLISE TÉCNICA =============

function calculateTechnicalScore(s: SignalData): number {
  let score = 50;
  const rsi = s.indicators.rsi.value;
  const stochK = s.indicators.stochastic?.k || 50;
  const stochD = s.indicators.stochastic?.d || 50;
  const macdHist = s.indicators.macd?.histogram || 0;
  const bollPos = s.indicators.bollinger?.position || '';
  const vol = s.indicators.atr.volatility;
  const conf = s.indicators.confluenceScore;
  const pricePos = s.indicators.supportResistance?.pricePosition || '';
  const maTrend = s.indicators.movingAverages?.trend || '';

  // RSI
  if (s.type === 'CALL') {
    if (rsi <= 15) score += 20; else if (rsi <= 20) score += 15; else if (rsi <= 25) score += 10; else if (rsi <= 30) score += 5;
  } else {
    if (rsi >= 85) score += 20; else if (rsi >= 80) score += 15; else if (rsi >= 75) score += 10; else if (rsi >= 70) score += 5;
  }

  // Stochastic
  if (s.type === 'CALL') {
    if (stochK <= 15 && stochK > stochD) score += 15; else if (stochK <= 20) score += 10; else if (stochK <= 30) score += 5;
  } else {
    if (stochK >= 85 && stochK < stochD) score += 15; else if (stochK >= 80) score += 10; else if (stochK >= 70) score += 5;
  }

  // Bollinger
  if (s.type === 'CALL' && bollPos === 'below_lower') score += 10;
  else if (s.type === 'PUT' && bollPos === 'above_upper') score += 10;
  else if (bollPos === 'near_lower' || bollPos === 'near_upper') score += 5;

  // MACD
  if (s.type === 'CALL' && macdHist > 0) score += 10;
  else if (s.type === 'PUT' && macdHist < 0) score += 10;

  // Support/Resistance
  if (s.type === 'CALL' && pricePos === 'near_support') score += 10;
  else if (s.type === 'PUT' && pricePos === 'near_resistance') score += 10;

  // MA Trend
  if (s.type === 'CALL' && maTrend === 'bullish') score += 8;
  else if (s.type === 'PUT' && maTrend === 'bearish') score += 8;

  // Volatility
  if (vol === 'low') score += 7; else if (vol === 'medium') score += 4;

  // Confluence
  if (conf >= 90) score += 10; else if (conf >= 80) score += 7; else if (conf >= 70) score += 4;

  // Reversal pattern
  if (s.indicators.reversalPattern) {
    const p = s.indicators.reversalPattern.toLowerCase();
    if (p.includes('hammer') || p.includes('engulfing') || p.includes('morning')) score += 10;
    else if (p.includes('doji') || p.includes('pin')) score += 7;
    else score += 5;
  }

  return Math.min(score, 100);
}

function calculateRiskScore(s: SignalData): number {
  let risk = 30;
  if (s.indicators.atr.volatility === 'high') risk += 30;
  if (s.indicators.atr.volatility === 'medium') risk += 15;
  if (s.indicators.atr.volatility === 'low') risk -= 10;
  if (s.indicators.confluenceScore < 75) risk += 20;
  else if (s.indicators.confluenceScore >= 90) risk -= 10;
  if (s.indicators.confluenceCount < 3) risk += 15;
  else if (s.indicators.confluenceCount >= 5) risk -= 10;

  const rsi = s.indicators.rsi.value;
  if (rsi > 35 && rsi < 65) risk += 25;
  else if (rsi <= 20 || rsi >= 80) risk -= 10;

  const stochK = s.indicators.stochastic?.k || 50;
  if (stochK > 30 && stochK < 70) risk += 20;
  else if (stochK <= 15 || stochK >= 85) risk -= 10;

  const macdHist = s.indicators.macd?.histogram || 0;
  if ((s.type === 'CALL' && macdHist > 0) || (s.type === 'PUT' && macdHist < 0)) risk -= 10;

  return Math.max(0, Math.min(risk, 100));
}

// ============= PATTERN DETECTION =============

type PatternType = 'EXTREME_OVERSOLD' | 'EXTREME_OVERBOUGHT' | 'PERFECT_REVERSAL' | 'TRIPLE_CONFLUENCE' | 'GOLDEN_SETUP' | 'DIAMOND_SETUP' | 'ULTRA_SAFE' | 'PROFIT_MASTER';

interface PatternMatch {
  signal: SignalData;
  pattern: PatternType;
  score: number;
  reason: string;
  criteria: number;
  technicalScore: number;
  riskScore: number;
  learnedScore: number;
  learnedAdjustments: string[];
}

function detectPatterns(signals: SignalData[], model: LearnedPattern): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const s of signals) {
    // APRENDIZADO: verificar se deve pular este sinal
    const learned = calculateLearnedScore(s, model);
    if (model.hasSufficientData && learned.shouldSkip) {
      console.log(`🧠 SKIP ${s.asset}: ${learned.skipReason}`);
      continue;
    }

    // Rejeitar volatilidade alta
    if (s.indicators.atr.volatility === 'high') {
      console.log(`❌ ${s.asset}: Volatilidade alta`);
      continue;
    }

    // Confluência mínima (relaxado se ativo é TOP no aprendizado)
    const assetPerf = model.assetPerformance.get(s.asset);
    const isTopAsset = assetPerf && assetPerf.winRate >= 60 && assetPerf.profit > 0;
    const minConf = isTopAsset ? 65 : 70;
    if (s.indicators.confluenceScore < minConf) {
      console.log(`❌ ${s.asset}: Confluência ${s.indicators.confluenceScore}% < ${minConf}%`);
      continue;
    }

    const technicalScore = calculateTechnicalScore(s);
    const riskScore = calculateRiskScore(s);
    
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

    let pattern: PatternType | null = null;
    let score = technicalScore;
    let criteriaCount = 0;
    const reasons: string[] = [];

    // ========== PROFIT_MASTER: Baseado em aprendizado ==========
    if (model.hasSufficientData && isTopAsset && learned.score >= 20) {
      pattern = 'PROFIT_MASTER';
      score = Math.min(technicalScore + learned.score, 100);
      criteriaCount = 5;
      reasons.push(`🧠 PROFIT_MASTER`, `WR ${assetPerf!.winRate}%`, `$${assetPerf!.profit}`, ...learned.adjustments.slice(0, 3));
    }
    // ========== DIAMOND SETUP ==========
    else {
      const isDiamondCall = rsi <= 20 && stochK <= 20 && stochK > stochD &&
        bollPos === 'below_lower' && pricePos === 'near_support' &&
        hasPattern && vol === 'low' && s.type === 'CALL' && macdHist > 0;
      const isDiamondPut = rsi >= 80 && stochK >= 80 && stochK < stochD &&
        bollPos === 'above_upper' && pricePos === 'near_resistance' &&
        hasPattern && vol === 'low' && s.type === 'PUT' && macdHist < 0;

      if (isDiamondCall || isDiamondPut) {
        pattern = 'DIAMOND_SETUP';
        score = 98;
        criteriaCount = 9;
        reasons.push('🔷 DIAMOND', `RSI ${rsi.toFixed(1)}`, `Stoch ${stochK.toFixed(1)}`, bollPos, pricePos);
      }
      // ========== GOLDEN SETUP ==========
      else {
        const isGoldenCall = rsi <= 22 && stochK <= 22 && pricePos === 'near_support' &&
          hasPattern && vol === 'low' && s.type === 'CALL' && macdHist > 0 && conf >= 80;
        const isGoldenPut = rsi >= 78 && stochK >= 78 && pricePos === 'near_resistance' &&
          hasPattern && vol === 'low' && s.type === 'PUT' && macdHist < 0 && conf >= 80;

        if (isGoldenCall || isGoldenPut) {
          pattern = 'GOLDEN_SETUP';
          score = 99;
          criteriaCount = 8;
          reasons.push('⭐ GOLDEN', `RSI ${rsi.toFixed(1)}`, pricePos, `Conf ${conf}%`);
        }
        // ========== EXTREME OVERSOLD/OVERBOUGHT ==========
        else if ((rsi <= 20 && s.type === 'CALL') || (rsi >= 80 && s.type === 'PUT')) {
          pattern = s.type === 'CALL' ? 'EXTREME_OVERSOLD' : 'EXTREME_OVERBOUGHT';
          score = 96;
          criteriaCount = 1;
          reasons.push(`RSI extremo ${rsi.toFixed(1)}`);
          if (s.type === 'CALL' ? stochK <= 20 : stochK >= 80) { score += 1.5; criteriaCount++; }
          if (s.type === 'CALL' ? bollPos === 'below_lower' : bollPos === 'above_upper') { score += 1; criteriaCount++; }
          if (s.type === 'CALL' ? pricePos === 'near_support' : pricePos === 'near_resistance') { score += 1; criteriaCount++; }
          if (hasPattern) { score += 1; criteriaCount++; }
          if (vol === 'low') { score += 0.5; criteriaCount++; }
        }
        // ========== PERFECT REVERSAL ==========
        else if (hasPattern && ((rsi <= 25 && s.type === 'CALL') || (rsi >= 75 && s.type === 'PUT'))) {
          pattern = 'PERFECT_REVERSAL';
          score = 95;
          criteriaCount = 2;
          reasons.push(hasPattern!, `RSI ${rsi.toFixed(1)}`);
          if (s.type === 'CALL' ? stochK <= 25 : stochK >= 75) { score += 1.5; criteriaCount++; }
          if (s.type === 'CALL' ? pricePos === 'near_support' : pricePos === 'near_resistance') { score += 1.5; criteriaCount++; }
          if (vol === 'low') { score += 1; criteriaCount++; }
        }
        // ========== TRIPLE CONFLUENCE ==========
        else if (conf >= 85 && confCount >= 5) {
          pattern = 'TRIPLE_CONFLUENCE';
          score = 95;
          criteriaCount = 2;
          reasons.push(`Conf ${conf}%`, `${confCount} indicadores`);
          if (rsi <= 25 || rsi >= 75) { score += 1.5; criteriaCount++; }
          if (stochK <= 25 || stochK >= 75) { score += 1; criteriaCount++; }
          if (vol === 'low') { score += 1; criteriaCount++; }
        }
      }
    }

    if (!pattern) continue;

    // APLICAR APRENDIZADO AO SCORE FINAL
    const finalScore = Math.min(Math.round(score + (model.hasSufficientData ? learned.score * 0.5 : 0)), 100);
    const finalRisk = Math.max(0, riskScore + (model.hasSufficientData && learned.score < 0 ? 10 : 0));

    // Critérios adaptativos
    const minScore = isTopAsset ? 82 : (model.hasSufficientData ? 88 : 85);
    const maxRisk = isTopAsset ? 65 : (model.hasSufficientData ? 55 : 55);
    const minCriteria = isTopAsset ? 2 : 3;

    if (finalScore >= minScore && finalRisk <= maxRisk && criteriaCount >= minCriteria) {
      matches.push({
        signal: s,
        pattern,
        score: finalScore,
        reason: [...reasons, ...learned.adjustments].join(' | '),
        criteria: criteriaCount,
        technicalScore,
        riskScore: finalRisk,
        learnedScore: learned.score,
        learnedAdjustments: learned.adjustments,
      });
      console.log(`✅ ${s.asset} (${pattern}): Score ${finalScore}% | Risco ${finalRisk}% | Aprendizado: ${learned.score > 0 ? '+' : ''}${learned.score}`);
    } else if (pattern) {
      console.log(`⚠️ ${s.asset} (${pattern}): Score ${finalScore}% | Risco ${finalRisk}% - Não aprovado`);
    }
  }

  return matches;
}

function selectBestSignals(matches: PatternMatch[], model: LearnedPattern): PatternMatch[] {
  const sorted = matches.sort((a, b) => {
    // PROFIT_MASTER tem prioridade (aprendizado)
    if (a.pattern === 'PROFIT_MASTER' && b.pattern !== 'PROFIT_MASTER') return -1;
    if (b.pattern === 'PROFIT_MASTER' && a.pattern !== 'PROFIT_MASTER') return 1;
    // Diamond > Golden > Others
    if (a.pattern === 'DIAMOND_SETUP' && b.pattern !== 'DIAMOND_SETUP') return -1;
    if (b.pattern === 'DIAMOND_SETUP' && a.pattern !== 'DIAMOND_SETUP') return 1;
    if (a.pattern === 'GOLDEN_SETUP' && b.pattern !== 'GOLDEN_SETUP') return -1;
    if (b.pattern === 'GOLDEN_SETUP' && a.pattern !== 'GOLDEN_SETUP') return 1;
    // Learned score bonus
    if (a.learnedScore !== b.learnedScore) return b.learnedScore - a.learnedScore;
    // Risk
    if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
    // Score
    return b.score - a.score;
  });

  const selected: PatternMatch[] = [];
  const usedAssets = new Set<string>();
  const maxSignals = 6;

  for (const match of sorted) {
    if (selected.length >= maxSignals) break;
    if (usedAssets.has(match.signal.asset)) continue;
    selected.push(match);
    usedAssets.add(match.signal.asset);
  }

  console.log(`📊 Selecionados ${selected.length} de ${matches.length} sinais para execução`);
  return selected;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signals, historicalResults }: AnalysisRequest = await req.json();

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) throw new Error('Groq AI service not configured');

    if (!signals || signals.length === 0) {
      return new Response(
        JSON.stringify({ success: true, analyzedSignals: [], message: 'No signals to analyze' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== LEARNING ENGINE: Construir modelo de aprendizado =====
    const model = await buildLearningModel();

    const mode = model.hasSufficientData ? 'LEARNED' : 'TÉCNICA PURA';
    console.log(`\n📊 Analisando ${signals.length} sinais (MODO: ${mode})...`);

    // Detectar padrões usando aprendizado
    const elitePatterns = detectPatterns(signals, model);
    const selectedSignals = selectBestSignals(elitePatterns, model);

    if (selectedSignals.length === 0) {
      console.log('⏳ Nenhum setup aprovado pelo modelo de aprendizado...');
      return new Response(
        JSON.stringify({
          success: true,
          analyzedSignals: signals.slice(0, 5).map(s => ({
            signalId: `${s.asset}-${Date.now()}`,
            asset: s.asset,
            recommendation: 'SKIP',
            confidence: s.indicators.confluenceScore,
            reason: 'Aguardando setup aprovado pelo modelo de aprendizado',
            adjustedConfluence: s.indicators.confluenceScore,
            riskLevel: 'HIGH'
          })),
          marketSentiment: 'NEUTRAL',
          bestSignal: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 ${selectedSignals.length} sinal(is) aprovado(s) pelo modelo!`);

    // ===== PROMPT COM CONTEXTO DE APRENDIZADO =====
    const learningSummary = model.hasSufficientData ? `
📊 DADOS DE APRENDIZADO (últimos 14 dias):
- Win Rate geral: ${model.overallWinRate}%
- Total trades: ${model.totalTrades}
- Lucro total: $${model.totalProfit.toFixed(2)}
${model.bestHours.length > 0 ? `- Melhores horários: ${model.bestHours.join('h, ')}h UTC` : ''}
${model.worstHours.length > 0 ? `- Piores horários: ${model.worstHours.join('h, ')}h UTC` : ''}
` : '⚠️ Dados insuficientes - usando análise técnica pura';

    const preferredAssets = Array.from(model.assetPerformance.values())
      .filter(a => a.winRate >= 50 && a.profit >= 0)
      .map(a => a.asset);
    const avoidAssets = Array.from(model.assetPerformance.values())
      .filter(a => a.winRate < 35 && a.profit < -50 && a.trades >= 3)
      .map(a => a.asset);

    const systemPrompt = `Você é um trader de opções binárias que APRENDE com resultados passados para maximizar lucro.

🧠 MODO: ${mode} - Decisões baseadas em dados reais de performance
${learningSummary}

REGRAS BASEADAS EM APRENDIZADO:
1. ✅ Padrão PROFIT_MASTER (aprendizado aprovou) = EXECUTE
2. ✅ DIAMOND/GOLDEN em ativo com bom histórico = EXECUTE
3. ✅ Ativo TOP + score >=82% = EXECUTE
4. ❌ Ativo com WR <35% e prejuízo = SKIP
5. ❌ Horário com histórico ruim = SKIP
6. ❌ 3+ losses consecutivos no ativo = SKIP
7. ⚡ Priorize ativos e direções com melhor win rate histórico

Responda APENAS JSON válido:
{"analyzedSignals":[{"signalId":"","asset":"","recommendation":"EXECUTE|SKIP","confidence":80-100,"reason":"","adjustedConfluence":80+,"riskLevel":"LOW|MEDIUM"}],"marketSentiment":"BULLISH|BEARISH|NEUTRAL","bestSignal":"asset_name"}`;

    const userPrompt = `SINAIS PRÉ-FILTRADOS PELO MODELO DE APRENDIZADO:

${selectedSignals.map((d, i) => {
  const s = d.signal;
  const dirPerf = model.directionPerformance.get(s.asset);
  const dirInfo = dirPerf ? `${s.type} WR: ${s.type === 'CALL' ? dirPerf.callWinRate : dirPerf.putWinRate}%` : '';
  return `${i + 1}. ${s.asset} ${s.type} | ${d.pattern}
   Score: ${d.score}% | Risco: ${d.riskScore}% | Aprendizado: ${d.learnedScore > 0 ? '+' : ''}${d.learnedScore}
   ${dirInfo}
   Ajustes: ${d.learnedAdjustments.join(', ') || 'N/A'}`;
}).join('\n\n')}`;

    // Chamar Groq AI
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
      console.error('Groq AI error:', response.status);
      // Fallback: usar análise pré-computada
      const fallbackSignals = selectedSignals.map(d => ({
        signalId: `${d.signal.asset}-${Date.now()}`,
        asset: d.signal.asset,
        recommendation: 'EXECUTE',
        confidence: d.score,
        reason: `${d.pattern}: ${d.learnedAdjustments[0] || 'Setup técnico forte'}`,
        adjustedConfluence: d.score,
        riskLevel: d.riskScore <= 40 ? 'LOW' : 'MEDIUM'
      }));

      return new Response(
        JSON.stringify({
          success: true,
          analyzedSignals: fallbackSignals,
          marketSentiment: 'NEUTRAL',
          bestSignal: fallbackSignals[0]?.asset || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error('No response from AI');

    console.log('AI Response:', content);

    let analysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      try {
        analysis = JSON.parse(jsonStr);
      } catch {
        let fixed = jsonStr;
        fixed += ']'.repeat(Math.max(0, (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length));
        fixed += '}'.repeat(Math.max(0, (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length));
        analysis = JSON.parse(fixed);
      }
    } catch {
      console.error('Failed to parse AI response, using pre-computed analysis');
      analysis = {
        analyzedSignals: selectedSignals.map(d => ({
          signalId: d.signal.asset,
          asset: d.signal.asset,
          recommendation: d.score >= 85 && d.riskScore <= 55 ? 'EXECUTE' : 'SKIP',
          confidence: d.score,
          reason: `${d.pattern}: ${d.learnedAdjustments[0] || 'Setup técnico'}`,
          adjustedConfluence: d.score,
          riskLevel: d.riskScore <= 40 ? 'LOW' : 'MEDIUM'
        })),
        marketSentiment: 'NEUTRAL',
        bestSignal: selectedSignals[0]?.signal.asset || null
      };
    }

    const executeSignals = analysis.analyzedSignals?.filter((a: any) => a.recommendation === 'EXECUTE') || [];
    console.log(`⭐ ${executeSignals.length} sinal(is) aprovado(s) pela IA + Aprendizado`);

    // Mapear todos os sinais
    const allSignalAnalysis = signals.map(s => {
      const aiResult = analysis.analyzedSignals?.find((a: any) => a.asset === s.asset);
      if (aiResult) return aiResult;
      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: 'SKIP',
        confidence: s.indicators.confluenceScore,
        reason: 'Não aprovado pelo modelo de aprendizado',
        adjustedConfluence: s.indicators.confluenceScore,
        riskLevel: 'HIGH'
      };
    });

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
