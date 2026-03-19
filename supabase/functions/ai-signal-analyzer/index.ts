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
    assetDirectionStats: {} as Record<string, { callWR: number; putWR: number; callTrades: number; putTrades: number }>,
  };

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: results } = await supabase
      .from('operation_results')
      .select('asset, result, profit, direction, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(300);

    if (!results || results.length === 0) return result;

    let totalWins = 0, totalLosses = 0;
    const assetStats: Record<string, { wins: number; losses: number; profit: number }> = {};
    const hourStats: Record<number, { wins: number; losses: number }> = {};
    const recentByAsset: Record<string, string[]> = {};
    const dirStats: Record<string, { callWins: number; callLosses: number; putWins: number; putLosses: number }> = {};

    for (const r of results) {
      const isWin = r.result === 'win';
      const isLoss = r.result === 'loss';
      result.totalProfit += r.profit || 0;
      if (isWin) totalWins++;
      if (isLoss) totalLosses++;

      if (!assetStats[r.asset]) assetStats[r.asset] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) assetStats[r.asset].wins++;
      if (isLoss) assetStats[r.asset].losses++;
      assetStats[r.asset].profit += r.profit || 0;

      const hour = new Date(r.created_at).getUTCHours();
      if (!hourStats[hour]) hourStats[hour] = { wins: 0, losses: 0 };
      if (isWin) hourStats[hour].wins++;
      if (isLoss) hourStats[hour].losses++;

      if (!recentByAsset[r.asset]) recentByAsset[r.asset] = [];
      if (recentByAsset[r.asset].length < 6) recentByAsset[r.asset].push(r.result);

      // Direction stats
      const dir = (r.direction || '').toUpperCase();
      if (!dirStats[r.asset]) dirStats[r.asset] = { callWins: 0, callLosses: 0, putWins: 0, putLosses: 0 };
      if (dir === 'CALL' || dir === 'call') {
        if (isWin) dirStats[r.asset].callWins++;
        if (isLoss) dirStats[r.asset].callLosses++;
      } else if (dir === 'PUT' || dir === 'put') {
        if (isWin) dirStats[r.asset].putWins++;
        if (isLoss) dirStats[r.asset].putLosses++;
      }
    }

    const total = totalWins + totalLosses;
    result.overallWinRate = total > 0 ? Math.round((totalWins / total) * 100) : 50;

    for (const [asset, stats] of Object.entries(assetStats)) {
      const t = stats.wins + stats.losses;
      if (t < 2) continue;
      const wr = Math.round((stats.wins / t) * 100);
      result.assetWinRates[asset] = { wr, trades: t, profit: Math.round(stats.profit * 100) / 100 };
      if (wr >= 60 && stats.profit > 0) result.bestAssets.push(asset);
      if (wr < 30) result.worstAssets.push(asset);
    }

    for (const [hourStr, stats] of Object.entries(hourStats)) {
      const t = stats.wins + stats.losses;
      if (t < 3) continue;
      const wr = (stats.wins / t) * 100;
      const hour = parseInt(hourStr);
      if (wr >= 55) result.bestHours.push(hour);
      if (wr < 40) result.worstHours.push(hour);
    }

    for (const [asset, recent] of Object.entries(recentByAsset)) {
      let streak = 0;
      for (const r of recent) {
        if (r === 'loss') streak++;
        else break;
      }
      if (streak >= 2) result.recentLossStreaks[asset] = streak;
    }

    for (const [asset, ds] of Object.entries(dirStats)) {
      const callTotal = ds.callWins + ds.callLosses;
      const putTotal = ds.putWins + ds.putLosses;
      result.assetDirectionStats[asset] = {
        callWR: callTotal > 0 ? Math.round((ds.callWins / callTotal) * 100) : 50,
        putWR: putTotal > 0 ? Math.round((ds.putWins / putTotal) * 100) : 50,
        callTrades: callTotal,
        putTrades: putTotal,
      };
    }
  } catch (e) {
    console.error('Erro ao buscar performance:', e);
  }

  return result;
}

// ============= GROQ AI — DECISOR PRINCIPAL =============
async function analyzeWithGroq(signals: SignalData[], perf: any, currentHour: number): Promise<any[] | null> {
  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
  if (!GROQ_API_KEY) {
    console.log('⚠️ GROQ_API_KEY não configurada');
    return null;
  }

  try {
    const signalSummaries = signals.map(s => {
      const dirStats = perf.assetDirectionStats[s.asset];
      const assetPerf = perf.assetWinRates[s.asset];
      const lossStreak = perf.recentLossStreaks[s.asset] || 0;

      return {
        asset: s.asset,
        proposed_direction: s.type,
        price: s.price,
        rsi: Math.round(s.indicators.rsi.value),
        stochastic_k: Math.round(s.indicators.stochastic.k),
        bollinger_position: s.indicators.bollinger.position,
        macd_trend: s.indicators.macd.trend,
        macd_histogram: s.indicators.macd.histogram > 0 ? 'positive' : 'negative',
        support_resistance: s.indicators.supportResistance.pricePosition,
        volatility: s.indicators.atr.volatility,
        ma_trend: s.indicators.movingAverages.trend,
        confluence: s.indicators.confluenceScore,
        pattern: s.indicators.reversalPattern || 'none',
        loss_streak: lossStreak,
        asset_winrate: assetPerf ? `${assetPerf.wr}% (${assetPerf.trades} trades)` : 'no data',
        call_winrate: dirStats ? `${dirStats.callWR}% (${dirStats.callTrades} trades)` : 'no data',
        put_winrate: dirStats ? `${dirStats.putWR}% (${dirStats.putTrades} trades)` : 'no data',
      };
    });

    const systemPrompt = `Você é um trader profissional de opções binárias M1 (1 minuto). Seu ÚNICO objetivo é LUCRO RÁPIDO.

CONTEXTO:
- Hora atual: ${currentHour}h UTC
- Win rate geral: ${perf.overallWinRate}%
- P&L total: $${perf.totalProfit.toFixed(2)}
- Melhores ativos: ${perf.bestAssets.join(', ') || 'nenhum'}
- Piores ativos: ${perf.worstAssets.join(', ') || 'nenhum'}
- Melhores horários: ${perf.bestHours.join(', ') || 'nenhum'}
- Piores horários: ${perf.worstHours.join(', ') || 'nenhum'}

REGRAS CRÍTICAS:
1. NUNCA entre contra a tendência predominante. Se o MACD está bullish e preço subindo, CALL. Se bearish e caindo, PUT.
2. Para CALL: RSI deve estar em zona oversold (< 35), estocástico < 30, preço perto do suporte
3. Para PUT: RSI deve estar em zona overbought (> 65), estocástico > 70, preço perto da resistência
4. Se um ativo tem loss streak >= 3, NÃO execute
5. Prefira ativos com bom histórico de win rate na DIREÇÃO proposta
6. VOLATILIDADE ALTA = NÃO EXECUTE
7. Verifique se a direção proposta faz sentido com TODOS os indicadores, não apenas RSI
8. Se MACD contradiz a direção, pode ser melhor INVERTER ou SKIP
9. Analise o win rate POR DIREÇÃO (call_winrate vs put_winrate) — se uma direção tem WR muito baixo, evite-a

Retorne APENAS sinais com alta probabilidade de lucro. Seja RIGOROSO. É melhor não entrar do que perder dinheiro.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analise estes sinais e decida quais executar para LUCRO:\n${JSON.stringify(signalSummaries, null, 2)}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'trading_decisions',
            description: 'Decisões de trading para cada sinal',
            parameters: {
              type: 'object',
              properties: {
                decisions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      asset: { type: 'string', description: 'Nome do ativo' },
                      execute: { type: 'boolean', description: 'true = executar, false = pular' },
                      best_direction: { type: 'string', enum: ['CALL', 'PUT'], description: 'Melhor direção baseada nos indicadores' },
                      confidence: { type: 'number', description: 'Confiança de 0-100' },
                      reason: { type: 'string', description: 'Razão curta da decisão' },
                    },
                    required: ['asset', 'execute', 'best_direction', 'confidence', 'reason'],
                  },
                },
              },
              required: ['decisions'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'trading_decisions' } },
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Groq API [${response.status}]: ${errText}`);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log(`🧠 GROQ decisões: ${JSON.stringify(parsed.decisions)}`);
      return parsed.decisions || null;
    }
  } catch (e) {
    console.error(`❌ Groq falhou: ${e}`);
  }
  return null;
}

// ============= FALLBACK: SCORING LOCAL =============
function localScoreSignal(s: SignalData, perf: any, currentHour: number): {
  score: number;
  bestDirection: 'CALL' | 'PUT';
  reason: string;
  shouldExecute: boolean;
} {
  let score = 0;
  const reasons: string[] = [];

  const rsi = s.indicators.rsi.value;
  const stochK = s.indicators.stochastic?.k || 50;
  const bollPos = s.indicators.bollinger?.position || '';
  const macdTrend = s.indicators.macd?.trend || 'neutral';
  const vol = s.indicators.atr?.volatility || 'medium';
  const pricePos = s.indicators.supportResistance?.pricePosition || '';
  const hasPattern = s.indicators.reversalPattern;
  const lossStreak = perf.recentLossStreaks[s.asset] || 0;
  const assetPerf = perf.assetWinRates[s.asset];

  // Bloqueios
  if (vol === 'high') return { score: 0, bestDirection: s.type, reason: 'Volatilidade alta', shouldExecute: false };
  if (lossStreak >= 4) return { score: 0, bestDirection: s.type, reason: `${lossStreak} losses`, shouldExecute: false };
  if (assetPerf && assetPerf.trades >= 5 && assetPerf.wr < 25) return { score: 0, bestDirection: s.type, reason: `WR ${assetPerf.wr}%`, shouldExecute: false };

  // Determinar melhor direção baseado em TODOS os indicadores
  let callScore = 0, putScore = 0;

  // RSI
  if (rsi <= 20) callScore += 25;
  else if (rsi <= 30) callScore += 15;
  else if (rsi <= 35) callScore += 8;
  if (rsi >= 80) putScore += 25;
  else if (rsi >= 70) putScore += 15;
  else if (rsi >= 65) putScore += 8;

  // Estocástico
  if (stochK <= 20) callScore += 15;
  else if (stochK <= 30) callScore += 8;
  if (stochK >= 80) putScore += 15;
  else if (stochK >= 70) putScore += 8;

  // Bollinger
  if (bollPos === 'below_lower') callScore += 12;
  if (bollPos === 'above_upper') putScore += 12;

  // MACD — indica tendência
  if (macdTrend === 'bullish') callScore += 10;
  if (macdTrend === 'bearish') putScore += 10;

  // Suporte/Resistência
  if (pricePos === 'near_support') callScore += 10;
  if (pricePos === 'near_resistance') putScore += 10;

  // Padrão de vela
  if (hasPattern) {
    if (s.type === 'CALL') callScore += 10;
    else putScore += 10;
  }

  // Histórico por direção
  const dirStats = perf.assetDirectionStats[s.asset];
  if (dirStats) {
    if (dirStats.callWR >= 55 && dirStats.callTrades >= 3) callScore += 8;
    if (dirStats.putWR >= 55 && dirStats.putTrades >= 3) putScore += 8;
    if (dirStats.callWR < 35 && dirStats.callTrades >= 3) callScore -= 10;
    if (dirStats.putWR < 35 && dirStats.putTrades >= 3) putScore -= 10;
  }

  const bestDirection: 'CALL' | 'PUT' = callScore >= putScore ? 'CALL' : 'PUT';
  score = Math.max(callScore, putScore);

  if (vol === 'low') { score += 8; reasons.push('Vol baixa'); }
  if (assetPerf && assetPerf.wr >= 55) { score += 8; reasons.push(`WR ${assetPerf.wr}%`); }
  if (perf.bestHours.includes(currentHour)) score += 5;
  if (perf.worstHours.includes(currentHour)) score -= 10;
  if (lossStreak >= 2) score -= 8;

  reasons.push(`RSI ${rsi.toFixed(0)}`, `Stoch ${stochK.toFixed(0)}`, bestDirection);

  return {
    score: Math.min(score, 100),
    bestDirection,
    reason: reasons.slice(0, 4).join(' | '),
    shouldExecute: score >= 45,
  };
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

    // 1. Tentar Groq AI como DECISOR PRINCIPAL
    const groqDecisions = await analyzeWithGroq(signals, perf, currentHour);

    // 2. Scoring local como fallback
    const localScores = signals.map(s => ({
      signal: s,
      ...localScoreSignal(s, perf, currentHour),
    }));

    // 3. Combinar: Groq tem prioridade
    const analyzedSignals = signals.map(s => {
      const groqPick = groqDecisions?.find(d => d.asset?.toUpperCase() === s.asset.toUpperCase());
      const localResult = localScores.find(ls => ls.signal.asset === s.asset)!;

      if (groqPick) {
        const shouldExecute = groqPick.execute && groqPick.confidence >= 55;
        console.log(`🧠 GROQ ${s.asset}: ${groqPick.execute ? '✅' : '❌'} ${groqPick.best_direction} conf=${groqPick.confidence} | ${groqPick.reason}`);
        return {
          signalId: `${s.asset}-${Date.now()}`,
          asset: s.asset,
          recommendation: shouldExecute ? 'EXECUTE' : 'SKIP',
          confidence: groqPick.confidence,
          reason: `GROQ: ${groqPick.reason}`,
          adjustedConfluence: groqPick.confidence,
          riskLevel: groqPick.confidence >= 70 ? 'LOW' : 'MEDIUM',
          bestDirection: groqPick.best_direction,
        };
      }

      // Fallback local
      console.log(`📐 LOCAL ${s.asset}: ${localResult.shouldExecute ? '✅' : '❌'} ${localResult.bestDirection} score=${localResult.score} | ${localResult.reason}`);
      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: localResult.shouldExecute ? 'EXECUTE' : 'SKIP',
        confidence: localResult.score,
        reason: `LOCAL: ${localResult.reason}`,
        adjustedConfluence: localResult.score,
        riskLevel: localResult.score >= 60 ? 'LOW' : 'MEDIUM',
        bestDirection: localResult.bestDirection,
      };
    });

    const approved = analyzedSignals.filter(a => a.recommendation === 'EXECUTE');
    console.log(`🎯 ${approved.length}/${signals.length} sinais aprovados (Groq: ${groqDecisions ? 'ativo' : 'fallback local'})`);

    return new Response(
      JSON.stringify({
        success: true,
        analyzedSignals,
        marketSentiment: 'NEUTRAL',
        bestSignal: approved.sort((a, b) => b.confidence - a.confidence)[0]?.asset || null,
        engine: groqDecisions ? 'GROQ' : 'LOCAL',
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
