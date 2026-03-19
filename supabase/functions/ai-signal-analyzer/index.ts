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
  historicalResults?: {
    asset: string;
    wins: number;
    losses: number;
    winRate: number;
  }[];
}

// ============= BUSCAR HISTÓRICO REAL DO BANCO =============
async function getRecentPerformance(supabase: any): Promise<{
  summary: string;
  bestAssets: string[];
  worstAssets: string[];
  bestHours: number[];
  worstHours: number[];
  overallWinRate: number;
  totalProfit: number;
  recentLossStreaks: Record<string, number>;
}> {
  const result = {
    summary: '',
    bestAssets: [] as string[],
    worstAssets: [] as string[],
    bestHours: [] as number[],
    worstHours: [] as number[],
    overallWinRate: 50,
    totalProfit: 0,
    recentLossStreaks: {} as Record<string, number>,
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

      // Asset
      if (!assetStats[r.asset]) assetStats[r.asset] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) assetStats[r.asset].wins++;
      if (isLoss) assetStats[r.asset].losses++;
      assetStats[r.asset].profit += profit;

      // Hour
      const hour = new Date(r.created_at).getUTCHours();
      if (!hourStats[hour]) hourStats[hour] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) hourStats[hour].wins++;
      if (isLoss) hourStats[hour].losses++;
      hourStats[hour].profit += profit;

      // Loss streaks
      if (!recentByAsset[r.asset]) recentByAsset[r.asset] = [];
      if (recentByAsset[r.asset].length < 5) recentByAsset[r.asset].push(r.result);
    }

    const total = totalWins + totalLosses;
    result.overallWinRate = total > 0 ? Math.round((totalWins / total) * 100) : 50;

    // Best/worst assets
    for (const [asset, stats] of Object.entries(assetStats)) {
      const t = stats.wins + stats.losses;
      if (t < 2) continue;
      const wr = (stats.wins / t) * 100;
      if (wr >= 60 && stats.profit > 0) result.bestAssets.push(asset);
      if (wr < 40 && stats.profit < -50) result.worstAssets.push(asset);
    }

    // Best/worst hours
    for (const [hourStr, stats] of Object.entries(hourStats)) {
      const t = stats.wins + stats.losses;
      if (t < 2) continue;
      const wr = (stats.wins / t) * 100;
      const hour = parseInt(hourStr);
      if (wr >= 60 && stats.profit > 0) result.bestHours.push(hour);
      if (wr < 35 && stats.profit < 0) result.worstHours.push(hour);
    }

    // Loss streaks
    for (const [asset, recent] of Object.entries(recentByAsset)) {
      let streak = 0;
      for (const r of recent) {
        if (r === 'loss') streak++;
        else break;
      }
      if (streak >= 2) result.recentLossStreaks[asset] = streak;
    }

    result.summary = `Últimos 7 dias: ${totalWins}W/${totalLosses}L (WR: ${result.overallWinRate}%) | P&L: $${result.totalProfit.toFixed(2)}`;
    
  } catch (e) {
    console.error('Erro ao buscar performance:', e);
  }

  return result;
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signals }: AnalysisRequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

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

    // Buscar performance real
    const perf = await getRecentPerformance(supabase);
    console.log(`📊 Performance: ${perf.summary}`);
    if (perf.bestAssets.length > 0) console.log(`✅ Melhores ativos: ${perf.bestAssets.join(', ')}`);
    if (perf.worstAssets.length > 0) console.log(`❌ Piores ativos: ${perf.worstAssets.join(', ')}`);

    const currentHour = new Date().getUTCHours();
    const isWorstHour = perf.worstHours.includes(currentHour);

    // Preparar dados dos sinais para a IA
    const signalSummaries = signals.map(s => ({
      asset: s.asset,
      direction: s.type,
      price: s.price,
      rsi: Math.round(s.indicators.rsi.value * 10) / 10,
      stochastic_k: Math.round(s.indicators.stochastic.k * 10) / 10,
      macd_trend: s.indicators.macd.trend,
      bollinger_position: s.indicators.bollinger.position,
      support_resistance: s.indicators.supportResistance.pricePosition,
      ma_trend: s.indicators.movingAverages.trend,
      volatility: s.indicators.atr.volatility,
      confluence_score: s.indicators.confluenceScore,
      confluence_count: s.indicators.confluenceCount,
      reversal_pattern: s.indicators.reversalPattern || 'none',
      confirmations: s.confirmations.length,
      recent_loss_streak: perf.recentLossStreaks[s.asset] || 0,
      is_worst_asset: perf.worstAssets.includes(s.asset),
      is_best_asset: perf.bestAssets.includes(s.asset),
    }));

    // ============= CHAMAR LOVABLE AI (Gemini) =============
    const systemPrompt = `Você é um analista de trading de OPÇÕES BINÁRIAS especializado em operações M1 (1 minuto).
Sua meta é LUCRO RÁPIDO e CONSISTENTE. Analise os sinais e decida quais executar.

REGRAS CRÍTICAS:
1. PRIORIZE sinais com RSI em zona extrema (< 25 para CALL, > 75 para PUT)
2. Estocástico deve confirmar a exaustão (< 25 CALL, > 75 PUT)  
3. EVITE volatilidade alta (ATR high) — risco de spike
4. Bollinger abaixo da banda inferior = forte sinal CALL, acima = forte PUT
5. Padrão de reversão (Hammer, Engulfing) aumenta a confiança
6. Se o ativo teve 3+ losses consecutivos recentes, NÃO EXECUTE
7. Se o ativo é marcado como "worst_asset", exija confirmações EXTRAS
8. Horário atual: ${currentHour}h UTC${isWorstHour ? ' (HORÁRIO RUIM - seja mais exigente)' : ''}

PERFORMANCE RECENTE DO SISTEMA:
${perf.summary}
${perf.bestAssets.length > 0 ? `Melhores ativos: ${perf.bestAssets.join(', ')}` : 'Sem ativos destaque'}
${perf.worstAssets.length > 0 ? `EVITAR: ${perf.worstAssets.join(', ')}` : ''}

ESTRATÉGIA: Busque a MELHOR oportunidade de reversão certeira. Prefira 1 trade muito bom a 3 medianos.
Se NENHUM sinal é realmente bom, não execute nenhum — é melhor não operar do que perder.

IMPORTANTE: A inversão será aplicada DEPOIS — analise os sinais como estão (CALL = espera subir, PUT = espera cair).`;

    const userPrompt = `Analise estes ${signalSummaries.length} sinais e retorne APENAS os que devem ser executados:

${JSON.stringify(signalSummaries, null, 2)}

Responda usando a tool "analyze_signals".`;

    console.log(`🤖 Enviando ${signals.length} sinais para Lovable AI (Gemini)...`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'analyze_signals',
            description: 'Return analysis results for trading signals',
            parameters: {
              type: 'object',
              properties: {
                decisions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      asset: { type: 'string', description: 'Asset symbol e.g. EUR/USD' },
                      action: { type: 'string', enum: ['EXECUTE', 'SKIP'] },
                      confidence: { type: 'number', description: 'Confidence 0-100' },
                      reason: { type: 'string', description: 'Short reason in Portuguese' },
                      risk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                    },
                    required: ['asset', 'action', 'confidence', 'reason', 'risk'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['decisions'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'analyze_signals' } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`❌ Lovable AI error [${aiResponse.status}]: ${errText}`);
      
      // Fallback: aprovar sinais com confluência >= 75% e sem loss streak
      const fallbackApproved = signals
        .filter(s => 
          s.indicators.confluenceScore >= 75 && 
          !perf.worstAssets.includes(s.asset) &&
          (perf.recentLossStreaks[s.asset] || 0) < 3
        )
        .sort((a, b) => b.indicators.confluenceScore - a.indicators.confluenceScore)
        .slice(0, 2);

      console.log(`⚠️ Fallback: ${fallbackApproved.length} sinais aprovados por confluência`);

      return new Response(
        JSON.stringify({
          success: true,
          analyzedSignals: signals.map(s => {
            const approved = fallbackApproved.find(f => f.asset === s.asset);
            return {
              signalId: `${s.asset}-${Date.now()}`,
              asset: s.asset,
              recommendation: approved ? 'EXECUTE' : 'SKIP',
              confidence: s.indicators.confluenceScore,
              reason: approved ? `Fallback: confluência ${s.indicators.confluenceScore}%` : 'Não aprovado',
              adjustedConfluence: s.indicators.confluenceScore,
              riskLevel: s.indicators.atr.volatility === 'high' ? 'HIGH' : 'MEDIUM',
            };
          }),
          marketSentiment: 'NEUTRAL',
          bestSignal: fallbackApproved[0]?.asset || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    
    // Parse tool call response
    let decisions: any[] = [];
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        decisions = parsed.decisions || [];
      }
    } catch (e) {
      console.error('❌ Erro ao parsear resposta IA:', e);
    }

    console.log(`🧠 IA retornou ${decisions.length} decisões`);

    const executeDecisions = decisions.filter((d: any) => d.action === 'EXECUTE');
    const skipDecisions = decisions.filter((d: any) => d.action === 'SKIP');

    console.log(`✅ EXECUTE: ${executeDecisions.length} | ⏭️ SKIP: ${skipDecisions.length}`);
    for (const d of executeDecisions) {
      console.log(`   ✅ ${d.asset}: ${d.reason} (${d.confidence}% conf, ${d.risk} risk)`);
    }
    for (const d of skipDecisions) {
      console.log(`   ⏭️ ${d.asset}: ${d.reason}`);
    }

    // Mapear resposta
    const analyzedSignals = signals.map(s => {
      const decision = decisions.find((d: any) => 
        d.asset?.toUpperCase() === s.asset.toUpperCase()
      );

      if (decision && decision.action === 'EXECUTE') {
        return {
          signalId: `${s.asset}-${Date.now()}`,
          asset: s.asset,
          recommendation: 'EXECUTE',
          confidence: decision.confidence || s.indicators.confluenceScore,
          reason: decision.reason || 'IA aprovou',
          adjustedConfluence: decision.confidence || s.indicators.confluenceScore,
          riskLevel: decision.risk || 'MEDIUM',
        };
      }

      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: 'SKIP',
        confidence: s.indicators.confluenceScore,
        reason: decision?.reason || 'IA não aprovou',
        adjustedConfluence: s.indicators.confluenceScore,
        riskLevel: 'HIGH',
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        analyzedSignals,
        marketSentiment: 'NEUTRAL',
        bestSignal: executeDecisions[0]?.asset || null,
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
