import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

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
  historicalResults?: any[];
}

// ============= BUSCAR HISTÓRICO REAL =============
async function getRecentPerformance(supabase: any) {
  const result = {
    bestAssets: [] as string[],
    worstAssets: [] as string[],
    bestHours: [] as number[],
    worstHours: [] as number[],
    overallWinRate: 50,
    totalProfit: 0,
    recentLossStreaks: {} as Record<string, number>,
    assetWinRates: {} as Record<string, { wr: number; trades: number; profit: number }>,
  };

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: results } = await supabase
      .from('operation_results')
      .select('asset, result, profit, direction, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    if (!results || results.length === 0) return result;

    let totalWins = 0, totalLosses = 0;
    const assetStats: Record<string, { wins: number; losses: number; profit: number }> = {};
    const hourStats: Record<number, { wins: number; losses: number; profit: number }> = {};
    const recentByAsset: Record<string, string[]> = {};

    for (const r of results) {
      const isWin = r.result === 'win';
      const isLoss = r.result === 'loss';
      const profit = r.profit || 0;
      result.totalProfit += profit;
      if (isWin) totalWins++;
      if (isLoss) totalLosses++;

      if (!assetStats[r.asset]) assetStats[r.asset] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) assetStats[r.asset].wins++;
      if (isLoss) assetStats[r.asset].losses++;
      assetStats[r.asset].profit += profit;

      const hour = new Date(r.created_at).getUTCHours();
      if (!hourStats[hour]) hourStats[hour] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) hourStats[hour].wins++;
      if (isLoss) hourStats[hour].losses++;
      hourStats[hour].profit += profit;

      if (!recentByAsset[r.asset]) recentByAsset[r.asset] = [];
      if (recentByAsset[r.asset].length < 5) recentByAsset[r.asset].push(r.result);
    }

    const total = totalWins + totalLosses;
    result.overallWinRate = total > 0 ? Math.round((totalWins / total) * 100) : 50;

    for (const [asset, stats] of Object.entries(assetStats)) {
      const t = stats.wins + stats.losses;
      if (t < 2) continue;
      const wr = Math.round((stats.wins / t) * 100);
      result.assetWinRates[asset] = { wr, trades: t, profit: Math.round(stats.profit * 100) / 100 };
      if (wr >= 60 && stats.profit > 0) result.bestAssets.push(asset);
      if (wr < 35 && stats.profit < -100) result.worstAssets.push(asset);
    }

    for (const [hourStr, stats] of Object.entries(hourStats)) {
      const t = stats.wins + stats.losses;
      if (t < 3) continue;
      const wr = (stats.wins / t) * 100;
      const hour = parseInt(hourStr);
      if (wr >= 55 && stats.profit > 0) result.bestHours.push(hour);
      if (wr < 40 && stats.profit < -50) result.worstHours.push(hour);
    }

    for (const [asset, recent] of Object.entries(recentByAsset)) {
      let streak = 0;
      for (const r of recent) {
        if (r === 'loss') streak++;
        else break;
      }
      if (streak >= 2) result.recentLossStreaks[asset] = streak;
    }
  } catch (e) {
    console.error('Erro ao buscar performance:', e);
  }

  return result;
}

// ============= SMART SIGNAL SCORING =============
// Nova lógica inteligente que busca LUCRO rápido
function scoreSignal(s: SignalData, perf: any, currentHour: number): {
  score: number;
  reason: string;
  risk: string;
  shouldExecute: boolean;
} {
  let score = 0;
  const reasons: string[] = [];
  let riskLevel = 'MEDIUM';

  const rsi = s.indicators.rsi.value;
  const stochK = s.indicators.stochastic?.k || 50;
  const stochD = s.indicators.stochastic?.d || 50;
  const bollPos = s.indicators.bollinger?.position || '';
  const macdHist = s.indicators.macd?.histogram || 0;
  const macdTrend = s.indicators.macd?.trend || 'neutral';
  const vol = s.indicators.atr?.volatility || 'medium';
  const conf = s.indicators.confluenceScore;
  const confCount = s.indicators.confluenceCount;
  const pricePos = s.indicators.supportResistance?.pricePosition || '';
  const hasPattern = s.indicators.reversalPattern;
  const maTrend = s.indicators.movingAverages?.trend || 'neutral';

  // === BLOQUEIOS ABSOLUTOS ===
  
  // 1. Volatilidade alta = perigo
  if (vol === 'high') {
    return { score: 0, reason: 'Volatilidade alta — risco de spike', risk: 'HIGH', shouldExecute: false };
  }

  // 2. Loss streak >= 4 neste ativo
  const lossStreak = perf.recentLossStreaks[s.asset] || 0;
  if (lossStreak >= 4) {
    return { score: 0, reason: `${lossStreak} losses consecutivos neste ativo`, risk: 'HIGH', shouldExecute: false };
  }

  // 3. Ativo com WR muito ruim e muitos trades
  const assetPerf = perf.assetWinRates[s.asset];
  if (assetPerf && assetPerf.trades >= 5 && assetPerf.wr < 30) {
    return { score: 0, reason: `Ativo com WR ${assetPerf.wr}% (${assetPerf.trades} trades)`, risk: 'HIGH', shouldExecute: false };
  }

  // === PONTUAÇÃO POSITIVA ===

  // RSI em zona extrema (principal indicador de reversão)
  if (s.type === 'CALL') {
    if (rsi <= 15) { score += 30; reasons.push(`RSI ultra-oversold ${rsi.toFixed(0)}`); }
    else if (rsi <= 20) { score += 25; reasons.push(`RSI oversold ${rsi.toFixed(0)}`); }
    else if (rsi <= 25) { score += 18; reasons.push(`RSI ${rsi.toFixed(0)}`); }
    else if (rsi <= 30) { score += 10; reasons.push(`RSI ${rsi.toFixed(0)}`); }
    else if (rsi <= 35) { score += 5; }
  } else {
    if (rsi >= 85) { score += 30; reasons.push(`RSI ultra-overbought ${rsi.toFixed(0)}`); }
    else if (rsi >= 80) { score += 25; reasons.push(`RSI overbought ${rsi.toFixed(0)}`); }
    else if (rsi >= 75) { score += 18; reasons.push(`RSI ${rsi.toFixed(0)}`); }
    else if (rsi >= 70) { score += 10; reasons.push(`RSI ${rsi.toFixed(0)}`); }
    else if (rsi >= 65) { score += 5; }
  }

  // Estocástico confirmando
  if (s.type === 'CALL' && stochK <= 20) { score += 15; reasons.push(`Stoch ${stochK.toFixed(0)}`); }
  else if (s.type === 'CALL' && stochK <= 30) { score += 8; }
  else if (s.type === 'PUT' && stochK >= 80) { score += 15; reasons.push(`Stoch ${stochK.toFixed(0)}`); }
  else if (s.type === 'PUT' && stochK >= 70) { score += 8; }

  // Bollinger confirmando
  if (s.type === 'CALL' && bollPos === 'below_lower') { score += 12; reasons.push('Bollinger ↓'); }
  else if (s.type === 'PUT' && bollPos === 'above_upper') { score += 12; reasons.push('Bollinger ↑'); }

  // Suporte/Resistência
  if (s.type === 'CALL' && pricePos === 'near_support') { score += 10; reasons.push('Suporte'); }
  else if (s.type === 'PUT' && pricePos === 'near_resistance') { score += 10; reasons.push('Resistência'); }

  // Padrão de reversão (vela)
  if (hasPattern) { score += 12; reasons.push(hasPattern); }

  // MACD confirmando
  if (s.type === 'CALL' && macdHist > 0) { score += 7; }
  else if (s.type === 'PUT' && macdHist < 0) { score += 7; }

  // Volatilidade baixa = melhor para scalping
  if (vol === 'low') { score += 8; reasons.push('Vol baixa'); riskLevel = 'LOW'; }

  // Confluência alta
  if (conf >= 85) { score += 10; }
  else if (conf >= 75) { score += 5; }

  // === AJUSTES BASEADOS NO HISTÓRICO ===

  // Ativo com bom histórico
  if (assetPerf && assetPerf.wr >= 60 && assetPerf.profit > 0) {
    score += 10;
    reasons.push(`Ativo WR ${assetPerf.wr}%`);
  }

  // Ativo com loss streak leve (2-3)
  if (lossStreak >= 2) {
    score -= 10;
    reasons.push(`${lossStreak}L seguidos`);
  }

  // Horário bom
  if (perf.bestHours.includes(currentHour)) {
    score += 8;
    reasons.push(`Hora boa (${currentHour}h)`);
  }

  // Horário ruim
  if (perf.worstHours.includes(currentHour)) {
    score -= 12;
    reasons.push(`Hora ruim (${currentHour}h)`);
  }

  // === DECISÃO FINAL ===
  // Score >= 50 = EXECUTE (indicadores técnicos fortes)
  // Score >= 40 = EXECUTE se ativo tem bom histórico
  const threshold = assetPerf && assetPerf.wr >= 55 ? 40 : 50;
  const shouldExecute = score >= threshold;

  return {
    score: Math.min(score, 100),
    reason: reasons.slice(0, 4).join(' | ') || 'Score insuficiente',
    risk: riskLevel,
    shouldExecute,
  };
}

// ============= TENTAR LOVABLE AI COMO BÔNUS =============
async function tryLovableAI(signals: SignalData[], perf: any, currentHour: number): Promise<any[] | null> {
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return null;

    const signalSummaries = signals.map(s => ({
      asset: s.asset,
      direction: s.type,
      rsi: Math.round(s.indicators.rsi.value),
      stoch: Math.round(s.indicators.stochastic.k),
      bollinger: s.indicators.bollinger.position,
      support_resistance: s.indicators.supportResistance.pricePosition,
      volatility: s.indicators.atr.volatility,
      confluence: s.indicators.confluenceScore,
      pattern: s.indicators.reversalPattern || 'none',
      loss_streak: perf.recentLossStreaks[s.asset] || 0,
    }));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: `Analista de opções binárias M1. Hora: ${currentHour}h UTC. WR geral: ${perf.overallWinRate}%. Retorne APENAS sinais com alta chance de lucro rápido.` },
          { role: 'user', content: `Sinais: ${JSON.stringify(signalSummaries)}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'decide',
            description: 'Trading decisions',
            parameters: {
              type: 'object',
              properties: {
                picks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      asset: { type: 'string' },
                      execute: { type: 'boolean' },
                      boost: { type: 'number', description: 'Score adjustment -20 to +20' },
                    },
                    required: ['asset', 'execute', 'boost'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['picks'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'decide' } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 402) console.log('⚠️ Lovable AI: créditos insuficientes, usando análise local');
      else if (response.status === 429) console.log('⚠️ Lovable AI: rate limit, usando análise local');
      else console.log(`⚠️ Lovable AI [${response.status}]: ${errText}`);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log(`🧠 Lovable AI respondeu: ${JSON.stringify(parsed.picks)}`);
      return parsed.picks || null;
    }
  } catch (e) {
    console.log(`⚠️ Lovable AI falhou: ${e}`);
  }
  return null;
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signals }: AnalysisRequest = await req.json();

    if (!signals || signals.length === 0) {
      return new Response(
        JSON.stringify({ success: true, analyzedSignals: [], message: 'No signals' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const perf = await getRecentPerformance(supabase);
    const currentHour = new Date().getUTCHours();

    console.log(`📊 WR: ${perf.overallWinRate}% | P&L: $${perf.totalProfit.toFixed(2)} | Hora: ${currentHour}h UTC`);
    if (perf.bestAssets.length > 0) console.log(`✅ Top: ${perf.bestAssets.join(', ')}`);
    if (perf.worstAssets.length > 0) console.log(`❌ Evitar: ${perf.worstAssets.join(', ')}`);

    // 1. Score local inteligente
    const scored = signals.map(s => ({
      signal: s,
      ...scoreSignal(s, perf, currentHour),
    }));

    // 2. Tentar Lovable AI como ajuste (opcional)
    const aiPicks = await tryLovableAI(
      signals.filter((_, i) => scored[i].shouldExecute || scored[i].score >= 35),
      perf,
      currentHour
    );

    // 3. Aplicar boost da IA se disponível
    if (aiPicks) {
      for (const pick of aiPicks) {
        const idx = scored.findIndex(s => s.signal.asset.toUpperCase() === pick.asset?.toUpperCase());
        if (idx >= 0) {
          scored[idx].score = Math.min(100, Math.max(0, scored[idx].score + (pick.boost || 0)));
          if (pick.execute === false && scored[idx].shouldExecute) {
            scored[idx].shouldExecute = false;
            scored[idx].reason += ' | IA vetou';
          } else if (pick.execute === true && !scored[idx].shouldExecute && scored[idx].score >= 35) {
            scored[idx].shouldExecute = true;
            scored[idx].reason += ' | IA aprovou';
          }
        }
      }
    }

    // 4. Selecionar os melhores (max 3)
    const approved = scored
      .filter(s => s.shouldExecute)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    console.log(`🎯 ${approved.length}/${signals.length} sinais aprovados para execução`);
    for (const a of approved) {
      console.log(`   ✅ ${a.signal.asset} (${a.signal.type}): Score ${a.score} | ${a.reason}`);
    }
    for (const s of scored.filter(s => !s.shouldExecute)) {
      console.log(`   ⏭️ ${s.signal.asset}: Score ${s.score} | ${s.reason}`);
    }

    const analyzedSignals = signals.map(s => {
      const result = scored.find(sc => sc.signal.asset === s.asset)!;
      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: result.shouldExecute ? 'EXECUTE' : 'SKIP',
        confidence: result.score,
        reason: result.reason,
        adjustedConfluence: result.score,
        riskLevel: result.risk,
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        analyzedSignals,
        marketSentiment: 'NEUTRAL',
        bestSignal: approved[0]?.signal.asset || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in AI signal analyzer:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        analyzedSignals: [],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
