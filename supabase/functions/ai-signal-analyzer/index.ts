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

// ============= DEEP LEARNING ENGINE =============
async function buildDeepLearningProfile(supabase: any) {
  const profile = {
    totalTrades: 0,
    overallWinRate: 50,
    totalProfit: 0,
    assetProfiles: {} as Record<string, {
      wins: number; losses: number; ties: number; profit: number; winRate: number;
      callWins: number; callLosses: number; callWR: number;
      putWins: number; putLosses: number; putWR: number;
      bestDirection: 'CALL' | 'PUT' | 'NONE';
      consecutiveLosses: number;
      recentResults: string[];
      avgWinProfit: number;
      avgLossAmount: number;
    }>,
    hourProfiles: {} as Record<number, {
      wins: number; losses: number; winRate: number; profit: number;
      bestAssets: string[];
    }>,
    toxicPatterns: [] as string[],
    profitablePatterns: [] as string[],
    goldenSetups: [] as { asset: string; direction: string; hour: number; wr: number; trades: number }[],
  };

  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data: results } = await supabase
      .from('operation_results')
      .select('asset, result, profit, direction, created_at')
      .gte('created_at', fourteenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (!results || results.length === 0) return profile;

    let totalWins = 0, totalLosses = 0;
    const recentByAsset: Record<string, string[]> = {};
    const granular: Record<string, { wins: number; losses: number; profit: number }> = {};

    for (const r of results) {
      const isWin = r.result === 'win';
      const isLoss = r.result === 'loss';
      const isTie = r.result === 'tie';
      const profit = r.profit || 0;
      const dir = (r.direction || '').toUpperCase();
      const hour = new Date(r.created_at).getUTCHours();

      profile.totalProfit += profit;
      if (isWin) totalWins++;
      if (isLoss) totalLosses++;
      profile.totalTrades++;

      if (!profile.assetProfiles[r.asset]) {
        profile.assetProfiles[r.asset] = {
          wins: 0, losses: 0, ties: 0, profit: 0, winRate: 50,
          callWins: 0, callLosses: 0, callWR: 50,
          putWins: 0, putLosses: 0, putWR: 50,
          bestDirection: 'NONE', consecutiveLosses: 0,
          recentResults: [], avgWinProfit: 0, avgLossAmount: 0,
        };
      }
      const ap = profile.assetProfiles[r.asset];
      if (isWin) { ap.wins++; ap.avgWinProfit += profit; }
      if (isLoss) { ap.losses++; ap.avgLossAmount += Math.abs(profit); }
      if (isTie) ap.ties++;
      ap.profit += profit;

      if (dir === 'CALL') {
        if (isWin) ap.callWins++;
        if (isLoss) ap.callLosses++;
      } else if (dir === 'PUT') {
        if (isWin) ap.putWins++;
        if (isLoss) ap.putLosses++;
      }

      if (!recentByAsset[r.asset]) recentByAsset[r.asset] = [];
      if (recentByAsset[r.asset].length < 8) recentByAsset[r.asset].push(r.result);

      if (!profile.hourProfiles[hour]) {
        profile.hourProfiles[hour] = { wins: 0, losses: 0, winRate: 50, profit: 0, bestAssets: [] };
      }
      if (isWin) profile.hourProfiles[hour].wins++;
      if (isLoss) profile.hourProfiles[hour].losses++;
      profile.hourProfiles[hour].profit += profit;

      const gKey = `${r.asset}|${dir}|${hour}`;
      if (!granular[gKey]) granular[gKey] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) granular[gKey].wins++;
      if (isLoss) granular[gKey].losses++;
      granular[gKey].profit += profit;
    }

    const total = totalWins + totalLosses;
    profile.overallWinRate = total > 0 ? Math.round((totalWins / total) * 100) : 50;

    for (const [asset, ap] of Object.entries(profile.assetProfiles)) {
      const t = ap.wins + ap.losses;
      ap.winRate = t > 0 ? Math.round((ap.wins / t) * 100) : 50;
      const ct = ap.callWins + ap.callLosses;
      ap.callWR = ct > 0 ? Math.round((ap.callWins / ct) * 100) : 50;
      const pt = ap.putWins + ap.putLosses;
      ap.putWR = pt > 0 ? Math.round((ap.putWins / pt) * 100) : 50;
      ap.bestDirection = ap.callWR > ap.putWR ? 'CALL' : ap.putWR > ap.callWR ? 'PUT' : 'NONE';
      if (ap.wins > 0) ap.avgWinProfit = ap.avgWinProfit / ap.wins;
      if (ap.losses > 0) ap.avgLossAmount = ap.avgLossAmount / ap.losses;

      const recent = recentByAsset[asset] || [];
      ap.recentResults = recent.slice(0, 5);
      let streak = 0;
      for (const r of recent) { if (r === 'loss') streak++; else break; }
      ap.consecutiveLosses = streak;

      if (ap.winRate < 30 && t >= 5) {
        profile.toxicPatterns.push(`${asset}: WR ${ap.winRate}% em ${t} trades — EVITAR`);
      }
      if (streak >= 5) {
        profile.toxicPatterns.push(`${asset}: ${streak} losses seguidos — BLOQUEADO`);
      }

      if (ap.winRate >= 55 && t >= 4 && ap.profit > 0) {
        profile.profitablePatterns.push(`${asset}: WR ${ap.winRate}% lucro $${ap.profit.toFixed(0)}`);
      }
    }

    for (const [, hp] of Object.entries(profile.hourProfiles)) {
      const t = hp.wins + hp.losses;
      hp.winRate = t > 0 ? Math.round((hp.wins / t) * 100) : 50;
    }

    for (const [key, g] of Object.entries(granular)) {
      const t = g.wins + g.losses;
      if (t >= 3) {
        const wr = Math.round((g.wins / t) * 100);
        const [asset, direction, hourStr] = key.split('|');
        if (wr >= 55 && g.profit > 0) {
          profile.goldenSetups.push({ asset, direction, hour: parseInt(hourStr), wr, trades: t });
        }
      }
    }
    profile.goldenSetups.sort((a, b) => b.wr - a.wr);

  } catch (e) {
    console.error('Erro no deep learning:', e);
  }

  return profile;
}

// ============= GROQ AI — FAST PROFIT STRATEGIST =============
async function aiAdaptiveStrategy(
  signals: SignalData[],
  profile: any,
  currentHour: number
): Promise<any[] | null> {
  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
  if (!GROQ_API_KEY) {
    console.log('⚠️ GROQ_API_KEY não configurada');
    return null;
  }

  try {
    const signalSummaries = signals.map(s => {
      const ap = profile.assetProfiles[s.asset];
      return {
        asset: s.asset,
        proposed_direction: s.type,
        price: s.price,
        rsi: Math.round(s.indicators.rsi.value),
        stochastic_k: Math.round(s.indicators.stochastic.k),
        bollinger_position: s.indicators.bollinger.position,
        macd_trend: s.indicators.macd.trend,
        macd_histogram: s.indicators.macd.histogram.toFixed(6),
        ma_trend: s.indicators.movingAverages.trend,
        ema9_vs_ema21: s.indicators.movingAverages.ema9 > s.indicators.movingAverages.ema21 ? 'ema9_above' : 'ema9_below',
        support_resistance: s.indicators.supportResistance.pricePosition,
        volatility: s.indicators.atr.volatility,
        pattern: s.indicators.reversalPattern || 'none',
        edge_scanner: s.indicators.strategy === 'EDGE' ? (s.type === 'CALL' ? 'BUY' : 'SELL') : 'none',
        confluence: s.indicators.confluenceScore,
        confirmations: s.confirmations?.length || 0,
        asset_wr: ap ? `${ap.winRate}%` : 'sem dados',
        asset_call_wr: ap ? `${ap.callWR}%` : 'N/A',
        asset_put_wr: ap ? `${ap.putWR}%` : 'N/A',
        asset_best_dir: ap?.bestDirection || 'NONE',
        asset_streak: ap?.consecutiveLosses || 0,
        asset_recent: ap?.recentResults?.slice(0, 5).join(',') || '',
      };
    });

    const hourProfile = profile.hourProfiles[currentHour];
    const hourInfo = hourProfile 
      ? `WR: ${hourProfile.winRate}% (${hourProfile.wins}W/${hourProfile.losses}L)`
      : 'sem dados';

    const systemPrompt = `Você é um TRADER PROFISSIONAL de opções binárias IQ Option com EXPIRAÇÃO DE 1 MINUTO. Aprove só entradas A FAVOR da tendência, com pavio de rejeição em suporte/resistência e momentum forte para o preço andar 1 minuto no sentido da operação. Evite mercado lateral, velas de exaustão e entradas contra a tendência. Priorize setups com histórico vencedor e rejeite os com perdas recentes.

═══ PERFIL DE APRENDIZADO (14 dias) ═══
Trades: ${profile.totalTrades} | WR: ${profile.overallWinRate}% | P&L: $${profile.totalProfit.toFixed(2)}
Hora: ${currentHour}h UTC | ${hourInfo}

🏆 SETUPS LUCRATIVOS:
${profile.goldenSetups.slice(0, 5).map((g: any) => `${g.asset} ${g.direction} ${g.hour}h WR${g.wr}%`).join(' | ') || 'Nenhum'}

⛔ TÓXICOS:
${profile.toxicPatterns.slice(0, 5).join(' | ') || 'Nenhum'}

═══ ESTRATÉGIA IQ OPTION (opções binárias/digitais M1 e M5) ═══

OBJETIVO: Sempre escolher a MELHOR entrada disponível para WIN. Não fique em espera: em cada ciclo, avalie cada ativo e dê a direção mais provável.

REGRA PRINCIPAL — A FAVOR DA TENDÊNCIA:
- Tendência de alta (EMA21 > SMA50, preço acima) → prefira CALL (pullback ou continuação)
- Tendência de baixa (EMA21 < SMA50, preço abaixo) → prefira PUT
- NUNCA recomende contra a tendência maior.
- RSI/Estocástico extremos NÃO são obrigatórios: em tendência forte, extremo = força (continuação).
- Pavio longo de rejeição a favor da tendência (fundo de vela em alta / topo em baixa) = entrada forte.

SÓ TENDÊNCIA MUITO FORTE: os sinais já chegam filtrados com EMA9/EMA21/SMA50 alinhadas e MACD a favor. APROVE (execute=true) apenas se o momentum for forte e contínuo na direção da tendência (MACD histograma a favor, EMA9 afastada da EMA21). REJEITE se o preço estiver colado em suporte (para PUT) ou resistência (para CALL), pois o movimento pode travar.
REJEITE apenas se: volatilidade ALTA extrema, tendência totalmente lateral e indicadores contraditórios, ou setup tóxico no histórico.

EDGE SCANNER (IQ Option): campo edge_scanner = BUY/SELL significa que a última vela fechada rejeitou o preço com pavio longo contra a tendência e fechou a favor, com preço acima (BUY) ou abaixo (SELL) das médias EMA21/SMA50. É o gatilho prioritário: se não houver exaustão extrema nem setup tóxico, APROVE com confiança 70+ na direção do edge_scanner.

CONFIANÇA: 55-65 = boa entrada a favor da tendência; 66-80 = tendência + pavio/S&R; 80+ = tudo alinhado.
Sempre informe best_direction CALL ou PUT (nunca NONE) e uma confiança realista.`;

    let response: Response | null = null;
    let usedModel = '';
    const attempts: { model: string; json: boolean }[] = [
      { model: 'llama-3.3-70b-versatile', json: true },
      { model: 'llama-3.3-70b-versatile', json: false },
      // Llama bloqueado na conta Groq (model_not_found) — usa GPT-OSS 120B da própria Groq até liberar
      { model: 'openai/gpt-oss-120b', json: true },
    ];
    for (const att of attempts) {
    const body: any = {
        model: att.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analise estes ${signals.length} sinais para operações de 1 MINUTO (M1) A FAVOR DA TENDÊNCIA:\n\n${JSON.stringify(signalSummaries)}\n\nResponda APENAS com um objeto JSON válido (sem texto fora do JSON) no formato: {"analysis":"...","decisions":[{"asset":"...","execute":true,"best_direction":"CALL","confidence":0,"strategy":"MOMENTUM","reason":"..."}]}. Uma decisão por ativo. Razões curtas (máx 20 palavras).` },
        ],
        temperature: 0.1,
        max_tokens: 3000,
      };
    if (att.json) body.response_format = { type: 'json_object' };
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    usedModel = att.model;
    if (response.ok || response.status === 429 || response.status >= 500) break;
    const errBody = await response.text();
    console.log(`⚠️ Groq ${att.model} (json=${att.json}) [${response.status}]: ${errBody.slice(0, 300)}`);
    response = null;
    }
    if (!response) return null;

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        console.log('⚠️ Groq rate limit, usando fallback local');
      } else {
        console.error(`❌ Groq API [${response.status}]: ${errText}`);
      }
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const match = String(content).match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : content);
      console.log(`🧠 Groq ${usedModel} OK`);

      console.log(`🧠 Groq Análise: ${parsed.analysis}`);
      console.log(`🧠 Groq Decisões: ${JSON.stringify(parsed.decisions)}`);
      return parsed.decisions || null;
    }
  } catch (e) {
    console.error(`❌ AI falhou: ${e}`);
  }
  return null;
}

// ============= FALLBACK LOCAL — FAST PROFIT =============
function localFastProfitScore(s: SignalData, profile: any, currentHour: number): {
  score: number;
  bestDirection: 'CALL' | 'PUT';
  strategy: string;
  reason: string;
  shouldExecute: boolean;
} {
  const rsi = s.indicators.rsi.value;
  const stochK = s.indicators.stochastic?.k || 50;
  const bollPos = s.indicators.bollinger?.position || '';
  const macdTrend = s.indicators.macd?.trend || 'neutral';
  const vol = s.indicators.atr?.volatility || 'medium';
  const pricePos = s.indicators.supportResistance?.pricePosition || '';
  const hasPattern = s.indicators.reversalPattern;
  const ema9Above = (s.indicators.movingAverages?.ema9 || 0) > (s.indicators.movingAverages?.ema21 || 0);

  const ap = profile.assetProfiles[s.asset];
  const reasons: string[] = [];

  // BLOQUEIOS: apenas os mais críticos
  if (vol === 'high') return { score: 0, bestDirection: s.type, strategy: 'BLOCKED', reason: 'Volatilidade alta', shouldExecute: false };
  if (ap?.consecutiveLosses >= 5) return { score: 0, bestDirection: s.type, strategy: 'BLOCKED', reason: `${ap.consecutiveLosses}L seguidos`, shouldExecute: false };

  let callScore = 0, putScore = 0;

  // RSI — peso forte para exaustão
  if (rsi <= 15) { callScore += 35; reasons.push(`RSI ${rsi.toFixed(0)} ultra`); }
  else if (rsi <= 25) { callScore += 25; reasons.push(`RSI ${rsi.toFixed(0)}`); }
  else if (rsi <= 35) { callScore += 12; }
  if (rsi >= 85) { putScore += 35; reasons.push(`RSI ${rsi.toFixed(0)} ultra`); }
  else if (rsi >= 75) { putScore += 25; reasons.push(`RSI ${rsi.toFixed(0)}`); }
  else if (rsi >= 65) { putScore += 12; }

  // Estocástico
  if (stochK <= 15) callScore += 20;
  else if (stochK <= 25) callScore += 14;
  if (stochK >= 85) putScore += 20;
  else if (stochK >= 75) putScore += 14;

  // MACD + EMA momentum
  if (macdTrend === 'bullish' && ema9Above) { callScore += 15; reasons.push('Momentum alta'); }
  if (macdTrend === 'bearish' && !ema9Above) { putScore += 15; reasons.push('Momentum baixa'); }

  // Bollinger
  if (bollPos === 'below_lower') { callScore += 12; reasons.push('BB inferior'); }
  if (bollPos === 'above_upper') { putScore += 12; reasons.push('BB superior'); }

  // S/R
  if (pricePos === 'near_support') { callScore += 10; reasons.push('Suporte'); }
  if (pricePos === 'near_resistance') { putScore += 10; reasons.push('Resistência'); }

  // Padrão de vela
  if (hasPattern) {
    if (s.type === 'CALL') callScore += 12;
    else putScore += 12;
    reasons.push(hasPattern);
  }

  // Aprendizado histórico
  if (ap) {
    if (ap.callWR >= 55 && (ap.callWins + ap.callLosses) >= 3) callScore += 10;
    if (ap.putWR >= 55 && (ap.putWins + ap.putLosses) >= 3) putScore += 10;
    if (ap.callWR < 30 && (ap.callWins + ap.callLosses) >= 5) callScore -= 15;
    if (ap.putWR < 30 && (ap.putWins + ap.putLosses) >= 5) putScore -= 15;
  }

  // Golden setup boost
  const isGolden = profile.goldenSetups.find((g: any) =>
    g.asset === s.asset && g.hour === currentHour
  );
  if (isGolden) {
    if (isGolden.direction === 'CALL') callScore += 15;
    else putScore += 15;
    reasons.push('Golden Setup');
  }

  if (vol === 'low') { callScore += 5; putScore += 5; }

  const bestDirection: 'CALL' | 'PUT' = callScore >= putScore ? 'CALL' : 'PUT';
  const score = Math.min(Math.max(callScore, putScore), 100);
  const strategy = isGolden ? 'GOLDEN_SETUP' : (rsi <= 25 || rsi >= 75) ? 'EXHAUSTION' : 'MOMENTUM';

  return {
    score,
    bestDirection,
    strategy,
    reason: reasons.slice(0, 4).join(' | ') || `${bestDirection} score=${score}`,
    shouldExecute: score >= 40, // Threshold baixo para fast profit
  };
}

// ============= MAIN =============
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signals }: { signals: SignalData[] } = await req.json();

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

    const profile = await buildDeepLearningProfile(supabase);
    const currentHour = new Date().getUTCHours();

    console.log(`═══ FAST PROFIT ENGINE ═══`);
    console.log(`📊 ${profile.totalTrades} trades | WR: ${profile.overallWinRate}% | P&L: $${profile.totalProfit.toFixed(2)} | Hora: ${currentHour}h`);
    if (profile.goldenSetups.length > 0) console.log(`🏆 Golden: ${profile.goldenSetups.slice(0, 3).map(g => `${g.asset} ${g.direction} ${g.hour}h WR${g.wr}%`).join(' | ')}`);
    if (profile.toxicPatterns.length > 0) console.log(`⛔ Tóxicos: ${profile.toxicPatterns.slice(0, 3).join(' | ')}`);

    // 1. Lovable AI como estrategista principal
    const aiDecisions = await aiAdaptiveStrategy(signals, profile, currentHour);

    // 2. Fallback local
    const localResults = signals.map(s => ({
      signal: s,
      ...localFastProfitScore(s, profile, currentHour),
    }));

    // 3. Combinar decisões
    const analyzedSignals = signals.map(s => {
      const aiPick = aiDecisions?.find(d => d.asset?.toUpperCase() === s.asset.toUpperCase());
      const local = localResults.find(l => l.signal.asset === s.asset)!;
      const ap = profile.assetProfiles[s.asset];

      // Sem bloqueio por ativo: o filtro de setup vencedor é feito no gerador (todos os pares)
      if (aiPick) {
        const shouldExecute = aiPick.execute && aiPick.confidence >= 50;
        const emoji = shouldExecute ? '✅' : '❌';
        console.log(`🧠 AI ${emoji} ${s.asset} ${aiPick.best_direction} conf=${aiPick.confidence} [${aiPick.strategy}] ${aiPick.reason}`);
        return {
          signalId: `${s.asset}-${Date.now()}`,
          asset: s.asset,
          recommendation: shouldExecute ? 'EXECUTE' : 'SKIP',
          confidence: aiPick.confidence,
          reason: `AI[${aiPick.strategy}]: ${aiPick.reason}`,
          adjustedConfluence: aiPick.confidence,
          riskLevel: aiPick.confidence >= 75 ? 'LOW' : 'MEDIUM',
          bestDirection: aiPick.best_direction,
        };
      }

      const shouldExecLocal = local.shouldExecute && local.score >= 65;
      const emoji = shouldExecLocal ? '✅' : '❌';
      console.log(`📐 LOCAL ${emoji} ${s.asset} ${local.bestDirection} score=${local.score} [${local.strategy}] ${local.reason}`);
      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: shouldExecLocal ? 'EXECUTE' : 'SKIP',
        confidence: local.score,
        reason: `LOCAL[${local.strategy}]: ${local.reason}`,
        adjustedConfluence: local.score,
        riskLevel: local.score >= 65 ? 'LOW' : 'MEDIUM',
        bestDirection: local.bestDirection,
      };
    });

    const approved = analyzedSignals.filter(a => a.recommendation === 'EXECUTE');
    console.log(`🎯 FAST PROFIT: ${approved.length}/${signals.length} aprovados (Engine: ${aiDecisions ? 'GROQ_AI' : 'LOCAL'})`);

    return new Response(
      JSON.stringify({
        success: true,
        analyzedSignals,
        marketSentiment: 'FAST_PROFIT',
        bestSignal: approved.sort((a, b) => b.confidence - a.confidence)[0]?.asset || null,
        engine: aiDecisions ? 'GROQ_AI_FAST_PROFIT' : 'LOCAL_FAST_PROFIT',
        learningProfile: {
          totalTrades: profile.totalTrades,
          winRate: profile.overallWinRate,
          goldenSetups: profile.goldenSetups.length,
          toxicPatterns: profile.toxicPatterns.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error', analyzedSignals: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
