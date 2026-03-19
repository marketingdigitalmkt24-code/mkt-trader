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
// Analisa 14 dias de dados para extrair padrões granulares
async function buildDeepLearningProfile(supabase: any) {
  const profile = {
    totalTrades: 0,
    overallWinRate: 50,
    totalProfit: 0,
    // Por ativo
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
    // Por horário UTC
    hourProfiles: {} as Record<number, {
      wins: number; losses: number; winRate: number; profit: number;
      bestAssets: string[];
    }>,
    // Padrões tóxicos a evitar
    toxicPatterns: [] as string[],
    // Padrões lucrativos a replicar
    profitablePatterns: [] as string[],
    // Melhor combinação ativo+direção+horário
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
    // Granular: ativo + direção + hora
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

      // Asset profile
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

      // Recent results for streak
      if (!recentByAsset[r.asset]) recentByAsset[r.asset] = [];
      if (recentByAsset[r.asset].length < 8) recentByAsset[r.asset].push(r.result);

      // Hour profile
      if (!profile.hourProfiles[hour]) {
        profile.hourProfiles[hour] = { wins: 0, losses: 0, winRate: 50, profit: 0, bestAssets: [] };
      }
      if (isWin) profile.hourProfiles[hour].wins++;
      if (isLoss) profile.hourProfiles[hour].losses++;
      profile.hourProfiles[hour].profit += profit;

      // Granular key
      const gKey = `${r.asset}|${dir}|${hour}`;
      if (!granular[gKey]) granular[gKey] = { wins: 0, losses: 0, profit: 0 };
      if (isWin) granular[gKey].wins++;
      if (isLoss) granular[gKey].losses++;
      granular[gKey].profit += profit;
    }

    // Calculate rates
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

      // Streak
      const recent = recentByAsset[asset] || [];
      ap.recentResults = recent.slice(0, 5);
      let streak = 0;
      for (const r of recent) { if (r === 'loss') streak++; else break; }
      ap.consecutiveLosses = streak;

      // Toxic patterns
      if (ap.winRate < 35 && t >= 5) {
        profile.toxicPatterns.push(`${asset}: WR ${ap.winRate}% em ${t} trades — EVITAR`);
      }
      if (ap.callWR < 30 && ct >= 3) {
        profile.toxicPatterns.push(`${asset} CALL: WR ${ap.callWR}% — EVITAR CALL`);
      }
      if (ap.putWR < 30 && pt >= 3) {
        profile.toxicPatterns.push(`${asset} PUT: WR ${ap.putWR}% — EVITAR PUT`);
      }
      if (streak >= 3) {
        profile.toxicPatterns.push(`${asset}: ${streak} losses seguidos — BLOQUEADO`);
      }

      // Profitable patterns
      if (ap.winRate >= 60 && t >= 4 && ap.profit > 0) {
        profile.profitablePatterns.push(`${asset}: WR ${ap.winRate}% lucro $${ap.profit.toFixed(0)}`);
      }
      if (ap.callWR >= 65 && ct >= 3) {
        profile.profitablePatterns.push(`${asset} CALL: WR ${ap.callWR}% — BOM PARA CALL`);
      }
      if (ap.putWR >= 65 && pt >= 3) {
        profile.profitablePatterns.push(`${asset} PUT: WR ${ap.putWR}% — BOM PARA PUT`);
      }
    }

    for (const [hourStr, hp] of Object.entries(profile.hourProfiles)) {
      const t = hp.wins + hp.losses;
      hp.winRate = t > 0 ? Math.round((hp.wins / t) * 100) : 50;
    }

    // Golden setups: combinações com WR >= 60% e >= 3 trades
    for (const [key, g] of Object.entries(granular)) {
      const t = g.wins + g.losses;
      if (t >= 3) {
        const wr = Math.round((g.wins / t) * 100);
        const [asset, direction, hourStr] = key.split('|');
        if (wr >= 60 && g.profit > 0) {
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

// ============= GROQ AI — ESTRATEGISTA ADAPTATIVO =============
async function groqAdaptiveStrategy(
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
    // Preparar dados ricos para a Groq
    const signalSummaries = signals.map(s => {
      const ap = profile.assetProfiles[s.asset];
      return {
        asset: s.asset,
        proposed_direction: s.type,
        price: s.price,
        // Indicadores técnicos
        rsi: Math.round(s.indicators.rsi.value),
        stochastic_k: Math.round(s.indicators.stochastic.k),
        stochastic_d: Math.round(s.indicators.stochastic.d),
        bollinger_position: s.indicators.bollinger.position,
        macd_trend: s.indicators.macd.trend,
        macd_histogram: s.indicators.macd.histogram.toFixed(6),
        ma_trend: s.indicators.movingAverages.trend,
        ema9_vs_ema21: s.indicators.movingAverages.ema9 > s.indicators.movingAverages.ema21 ? 'ema9_above' : 'ema9_below',
        support_resistance: s.indicators.supportResistance.pricePosition,
        volatility: s.indicators.atr.volatility,
        pattern: s.indicators.reversalPattern || 'none',
        confluence: s.indicators.confluenceScore,
        // Histórico do ativo
        asset_total_wr: ap ? `${ap.winRate}%` : 'sem dados',
        asset_call_wr: ap ? `${ap.callWR}% (${ap.callWins + ap.callLosses} trades)` : 'sem dados',
        asset_put_wr: ap ? `${ap.putWR}% (${ap.putWins + ap.putLosses} trades)` : 'sem dados',
        asset_best_direction: ap?.bestDirection || 'NONE',
        asset_loss_streak: ap?.consecutiveLosses || 0,
        asset_recent: ap?.recentResults?.join(',') || '',
        asset_profit: ap ? `$${ap.profit.toFixed(0)}` : '$0',
      };
    });

    // Perfil de horário atual
    const hourProfile = profile.hourProfiles[currentHour];
    const hourInfo = hourProfile 
      ? `WR: ${hourProfile.winRate}% (${hourProfile.wins}W/${hourProfile.losses}L) Lucro: $${hourProfile.profit.toFixed(0)}`
      : 'sem dados';

    const systemPrompt = `Você é um ESTRATEGISTA DE TRADING ADAPTATIVO especializado em opções binárias M1 (1 minuto).
Seu objetivo ÚNICO é MAXIMIZAR LUCRO e MINIMIZAR PERDAS.

═══════════════════════════════════════
📊 PERFIL DE APRENDIZADO (últimos 14 dias)
═══════════════════════════════════════
Total trades: ${profile.totalTrades}
Win Rate geral: ${profile.overallWinRate}%
P&L total: $${profile.totalProfit.toFixed(2)}
Hora atual: ${currentHour}h UTC
Perfil hora atual: ${hourInfo}

🏆 SETUPS LUCRATIVOS COMPROVADOS:
${profile.goldenSetups.slice(0, 8).map((g: any) => `• ${g.asset} ${g.direction} às ${g.hour}h: WR ${g.wr}% (${g.trades} trades)`).join('\n') || '• Nenhum setup lucrativo identificado ainda'}

✅ PADRÕES QUE DÃO LUCRO:
${profile.profitablePatterns.slice(0, 6).join('\n') || '• Nenhum padrão lucrativo'}

⛔ PADRÕES TÓXICOS (NUNCA REPETIR):
${profile.toxicPatterns.slice(0, 8).join('\n') || '• Nenhum padrão tóxico'}

═══════════════════════════════════════
🧠 REGRAS DA ESTRATÉGIA ADAPTATIVA
═══════════════════════════════════════

REGRA 1 - DIREÇÃO INTELIGENTE:
- Analise o win rate POR DIREÇÃO de cada ativo
- Se CALL tem WR < 40% neste ativo, NÃO faça CALL
- Se PUT tem WR < 40% neste ativo, NÃO faça PUT
- Use a direção com MELHOR WR histórico QUANDO os indicadores confirmam

REGRA 2 - MOMENTUM vs REVERSÃO:
- Se MACD é bullish + EMA9 > EMA21 + RSI entre 40-65: tendência de ALTA → CALL
- Se MACD é bearish + EMA9 < EMA21 + RSI entre 35-60: tendência de BAIXA → PUT
- REVERSÃO só quando RSI < 20 ou > 80 COM estocástico confirmando E padrão de vela
- NUNCA entre em reversão contra tendência forte do MACD

REGRA 3 - FILTROS DE PROTEÇÃO:
- Loss streak >= 3: NÃO EXECUTE esse ativo
- Volatilidade alta (ATR high): NÃO EXECUTE
- Hora com WR < 40% no histórico: NÃO EXECUTE
- Ativo sem dados históricos: baixe a confiança para < 50

REGRA 4 - GOLDEN SETUPS:
- Se a combinação ativo+direção+hora está nos SETUPS LUCRATIVOS COMPROVADOS: BOOST +20 confiança
- Priorize esses setups sobre novos

REGRA 5 - APRENDIZADO:
- Analise os resultados recentes do ativo (últimos 5 trades)
- Se teve 2+ wins recentes na mesma direção, pode continuar
- Se teve 2+ losses recentes, mude a estratégia ou pule

IMPORTANTE: Retorne APENAS trades com alta probabilidade de LUCRO. É MELHOR não entrar do que perder.
Máximo 2 sinais aprovados por ciclo.`;

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
          { role: 'user', content: `Analise estes ${signals.length} sinais e decida a MELHOR estratégia para LUCRO RÁPIDO:\n\n${JSON.stringify(signalSummaries, null, 2)}` },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'trading_strategy',
            description: 'Estratégia de trading adaptativa baseada em aprendizado',
            parameters: {
              type: 'object',
              properties: {
                market_analysis: { type: 'string', description: 'Análise breve do mercado atual (max 100 chars)' },
                decisions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      asset: { type: 'string' },
                      execute: { type: 'boolean', description: 'true SOMENTE se alta chance de lucro' },
                      best_direction: { type: 'string', enum: ['CALL', 'PUT'] },
                      confidence: { type: 'number', description: '0-100, mínimo 65 para executar' },
                      strategy: { type: 'string', enum: ['MOMENTUM', 'REVERSAL', 'GOLDEN_SETUP'], description: 'Tipo de estratégia usada' },
                      reason: { type: 'string', description: 'Razão técnica curta' },
                    },
                    required: ['asset', 'execute', 'best_direction', 'confidence', 'strategy', 'reason'],
                  },
                },
              },
              required: ['market_analysis', 'decisions'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'trading_strategy' } },
        temperature: 0.05, // Máxima precisão
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) console.log('⚠️ Groq rate limit, usando fallback');
      else console.error(`❌ Groq [${response.status}]: ${errText}`);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      console.log(`🧠 GROQ Análise: ${parsed.market_analysis}`);
      console.log(`🧠 GROQ Decisões: ${JSON.stringify(parsed.decisions)}`);
      return parsed.decisions || null;
    }
  } catch (e) {
    console.error(`❌ Groq falhou: ${e}`);
  }
  return null;
}

// ============= FALLBACK LOCAL INTELIGENTE =============
function localAdaptiveScore(s: SignalData, profile: any, currentHour: number): {
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
  const maTrend = s.indicators.movingAverages?.trend || 'neutral';
  const ema9Above = (s.indicators.movingAverages?.ema9 || 0) > (s.indicators.movingAverages?.ema21 || 0);

  const ap = profile.assetProfiles[s.asset];
  const hp = profile.hourProfiles[currentHour];
  const reasons: string[] = [];

  // === BLOQUEIOS ABSOLUTOS ===
  if (vol === 'high') return { score: 0, bestDirection: s.type, strategy: 'BLOCKED', reason: 'Volatilidade alta', shouldExecute: false };
  if (ap?.consecutiveLosses >= 3) return { score: 0, bestDirection: s.type, strategy: 'BLOCKED', reason: `${ap.consecutiveLosses}L seguidos`, shouldExecute: false };
  if (hp && hp.winRate < 35 && (hp.wins + hp.losses) >= 5) return { score: 0, bestDirection: s.type, strategy: 'BLOCKED', reason: `Hora ${currentHour}h WR ${hp.winRate}%`, shouldExecute: false };

  // === DETERMINAR MELHOR DIREÇÃO ===
  let callScore = 0, putScore = 0;

  // 1. MOMENTUM: MACD + EMA
  if (macdTrend === 'bullish' && ema9Above) { callScore += 20; }
  if (macdTrend === 'bearish' && !ema9Above) { putScore += 20; }

  // 2. RSI
  if (rsi <= 15) { callScore += 30; reasons.push(`RSI ${rsi.toFixed(0)}`); }
  else if (rsi <= 25) { callScore += 22; reasons.push(`RSI ${rsi.toFixed(0)}`); }
  else if (rsi <= 35) { callScore += 10; }
  if (rsi >= 85) { putScore += 30; reasons.push(`RSI ${rsi.toFixed(0)}`); }
  else if (rsi >= 75) { putScore += 22; reasons.push(`RSI ${rsi.toFixed(0)}`); }
  else if (rsi >= 65) { putScore += 10; }

  // 3. Estocástico
  if (stochK <= 15) callScore += 18;
  else if (stochK <= 25) callScore += 12;
  if (stochK >= 85) putScore += 18;
  else if (stochK >= 75) putScore += 12;

  // 4. Bollinger
  if (bollPos === 'below_lower') callScore += 12;
  if (bollPos === 'above_upper') putScore += 12;

  // 5. S/R
  if (pricePos === 'near_support') callScore += 10;
  if (pricePos === 'near_resistance') putScore += 10;

  // 6. Padrão de vela
  if (hasPattern) {
    if (s.type === 'CALL') callScore += 10;
    else putScore += 10;
    reasons.push(hasPattern);
  }

  // === AJUSTES DO APRENDIZADO ===
  if (ap) {
    // Histórico por direção
    if (ap.callWR >= 60 && (ap.callWins + ap.callLosses) >= 3) { callScore += 12; reasons.push(`CALL WR ${ap.callWR}%`); }
    if (ap.putWR >= 60 && (ap.putWins + ap.putLosses) >= 3) { putScore += 12; reasons.push(`PUT WR ${ap.putWR}%`); }
    if (ap.callWR < 35 && (ap.callWins + ap.callLosses) >= 3) callScore -= 15;
    if (ap.putWR < 35 && (ap.putWins + ap.putLosses) >= 3) putScore -= 15;
  }

  // Golden setup check
  const isGolden = profile.goldenSetups.find((g: any) =>
    g.asset === s.asset && g.hour === currentHour
  );
  if (isGolden) {
    if (isGolden.direction === 'CALL') callScore += 15;
    else putScore += 15;
    reasons.push('Golden Setup');
  }

  if (vol === 'low') { callScore += 5; putScore += 5; }
  if (hp && hp.winRate >= 55) { callScore += 5; putScore += 5; }

  const bestDirection: 'CALL' | 'PUT' = callScore >= putScore ? 'CALL' : 'PUT';
  const score = Math.min(Math.max(callScore, putScore), 100);
  const strategy = isGolden ? 'GOLDEN_SETUP' : (rsi <= 25 || rsi >= 75) ? 'REVERSAL' : 'MOMENTUM';

  return {
    score,
    bestDirection,
    strategy,
    reason: reasons.slice(0, 4).join(' | ') || `${bestDirection} score=${score}`,
    shouldExecute: score >= 45,
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

    // Deep learning profile
    const profile = await buildDeepLearningProfile(supabase);
    const currentHour = new Date().getUTCHours();

    console.log(`═══ DEEP LEARNING PROFILE ═══`);
    console.log(`📊 ${profile.totalTrades} trades | WR: ${profile.overallWinRate}% | P&L: $${profile.totalProfit.toFixed(2)} | Hora: ${currentHour}h`);
    if (profile.goldenSetups.length > 0) console.log(`🏆 Golden: ${profile.goldenSetups.slice(0, 3).map(g => `${g.asset} ${g.direction} ${g.hour}h WR${g.wr}%`).join(' | ')}`);
    if (profile.toxicPatterns.length > 0) console.log(`⛔ Tóxicos: ${profile.toxicPatterns.slice(0, 3).join(' | ')}`);

    // 1. Groq como estrategista principal
    const groqDecisions = await groqAdaptiveStrategy(signals, profile, currentHour);

    // 2. Fallback local
    const localResults = signals.map(s => ({
      signal: s,
      ...localAdaptiveScore(s, profile, currentHour),
    }));

    // 3. Combinar — com VALIDAÇÕES RÍGIDAS
    const analyzedSignals = signals.map(s => {
      const groqPick = groqDecisions?.find(d => d.asset?.toUpperCase() === s.asset.toUpperCase());
      const local = localResults.find(l => l.signal.asset === s.asset)!;
      const ap = profile.assetProfiles[s.asset];
      
      // ===== BLOQUEIO ABSOLUTO: Groq NÃO pode aprovar ativos tóxicos =====
      const isToxic = ap && (
        ap.consecutiveLosses >= 3 ||
        (ap.winRate < 40 && (ap.wins + ap.losses) >= 5)
      );
      
      // RSI artefato check (RSI 0 ou 100 = dados ruins)
      const rsi = s.indicators.rsi.value;
      const isDataArtifact = rsi <= 1 || rsi >= 99;
      
      // WR geral muito baixo = parar de operar
      const overallWRTooLow = profile.totalTrades >= 20 && profile.overallWinRate < 45;
      
      if (isToxic) {
        console.log(`🚫 BLOQUEIO ${s.asset}: ${ap.consecutiveLosses}L seguidos | WR ${ap.winRate}% — Groq IGNORADO`);
        return {
          signalId: `${s.asset}-${Date.now()}`,
          asset: s.asset,
          recommendation: 'SKIP',
          confidence: 0,
          reason: `BLOCKED: ${ap.consecutiveLosses}L seguidos, WR ${ap.winRate}%`,
          adjustedConfluence: 0,
          riskLevel: 'HIGH',
          bestDirection: s.type,
        };
      }
      
      if (isDataArtifact) {
        console.log(`🚫 DADOS RUINS ${s.asset}: RSI=${rsi.toFixed(1)} é artefato — REJEITADO`);
        return {
          signalId: `${s.asset}-${Date.now()}`,
          asset: s.asset,
          recommendation: 'SKIP',
          confidence: 0,
          reason: `BLOCKED: RSI ${rsi.toFixed(1)} é artefato de dados`,
          adjustedConfluence: 0,
          riskLevel: 'HIGH',
          bestDirection: s.type,
        };
      }

      if (groqPick) {
        // Confiança mínima aumentada para 80% (era 60%)
        const shouldExecute = groqPick.execute && groqPick.confidence >= 80 && !overallWRTooLow;
        const emoji = shouldExecute ? '✅' : '❌';
        const skipReason = overallWRTooLow ? ' [WR GERAL BAIXO]' : groqPick.confidence < 80 ? ' [CONF<80]' : '';
        console.log(`🧠 GROQ ${emoji} ${s.asset} ${groqPick.best_direction} conf=${groqPick.confidence} [${groqPick.strategy}] ${groqPick.reason}${skipReason}`);
        return {
          signalId: `${s.asset}-${Date.now()}`,
          asset: s.asset,
          recommendation: shouldExecute ? 'EXECUTE' : 'SKIP',
          confidence: groqPick.confidence,
          reason: `GROQ[${groqPick.strategy}]: ${groqPick.reason}`,
          adjustedConfluence: groqPick.confidence,
          riskLevel: groqPick.confidence >= 85 ? 'LOW' : 'MEDIUM',
          bestDirection: groqPick.best_direction,
        };
      }

      const shouldExecLocal = local.shouldExecute && local.score >= 60 && !overallWRTooLow;
      const emoji = shouldExecLocal ? '✅' : '❌';
      console.log(`📐 LOCAL ${emoji} ${s.asset} ${local.bestDirection} score=${local.score} [${local.strategy}] ${local.reason}`);
      return {
        signalId: `${s.asset}-${Date.now()}`,
        asset: s.asset,
        recommendation: shouldExecLocal ? 'EXECUTE' : 'SKIP',
        confidence: local.score,
        reason: `LOCAL[${local.strategy}]: ${local.reason}`,
        adjustedConfluence: local.score,
        riskLevel: local.score >= 70 ? 'LOW' : 'MEDIUM',
        bestDirection: local.bestDirection,
      };
    });

    const approved = analyzedSignals.filter(a => a.recommendation === 'EXECUTE');
    console.log(`🎯 ${approved.length}/${signals.length} aprovados (Engine: ${groqDecisions ? 'GROQ' : 'LOCAL'})`);

    return new Response(
      JSON.stringify({
        success: true,
        analyzedSignals,
        marketSentiment: 'ADAPTIVE',
        bestSignal: approved.sort((a, b) => b.confidence - a.confidence)[0]?.asset || null,
        engine: groqDecisions ? 'GROQ_ADAPTIVE' : 'LOCAL_ADAPTIVE',
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
