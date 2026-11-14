import { DEMO_ANALYSIS_SEC, DEMO_CANDLE_SEC } from './demo-timing.ts';
import { AI_CHART_STRATEGIES, aiChartTimely } from './demo-ai-strategies.ts';

// One-hour PRACTICE-only pilot: GPT-6 Astra (high) decides card 2 entries.
export const DEMO_AI_GATE_VERSION = 'demo-ai-gate-astra-v1';
export const DEMO_AI_GATE_MODEL = 'openai/gpt-6-astra';
export const DEMO_AI_GATE_START = Date.parse('2026-11-13T23:35:00Z');
export const DEMO_AI_GATE_END = DEMO_AI_GATE_START + 60 * 60_000;
const MAX_CHOICES = 3;
const BARS = DEMO_CANDLE_SEC / DEMO_ANALYSIS_SEC;
type Candle = { t: number; o: number; h: number; l: number; c: number };
type Cand = { signal_id: string; asset: string; direction: string; payout?: number | null };

export function demoAiGateActive(target: number) {
  return target >= DEMO_AI_GATE_START && target < DEMO_AI_GATE_END;
}

/** Returns the chosen signal_id, null for skip/failure (failure never opens an order). */
export async function demoAiGateDecide<T extends { candidate: Cand; score?: number }>(
  ranked: T[], series: Map<string, Candle[]>, entrySec: number, key: string, timeoutMs = 20_000, fetcher = fetch,
): Promise<{ status: string; signalId: string | null }> {
  const choices = ranked.slice(0, MAX_CHOICES).flatMap((entry, i) => {
    const bars = series.get(entry.candidate.asset)?.filter(c => c.t + DEMO_ANALYSIS_SEC <= entrySec).slice(-BARS);
    if (!bars || bars.length !== BARS || !(bars[0].o > 0)) return [];
    const rel = (p: number) => Math.round((p / bars[0].o - 1) * 1e6);
    return [{ id: String(i + 1), signalId: entry.candidate.signal_id, direction: entry.candidate.direction,
      payout: entry.candidate.payout ?? null, technicalScore: Math.round(entry.score ?? 0),
      ohlcPpm: bars.map(c => [c.o, c.h, c.l, c.c].map(rel)) }];
  });
  if (!choices.length) return { status: 'no_candidates', signalId: null };
  const ids = ['skip', ...choices.map(c => c.id)];
  try {
    const res = await fetcher('https://ai.gateway.lovable.dev/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Lovable-API-Key': key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({
        model: DEMO_AI_GATE_MODEL, stream: true, store: false, reasoning: { effort: 'high' },
        instructions: `You decide test-only one-minute CALL/PUT binary entries for a trend+force+pullback strategy. Each candidate has ${BARS} closed ${DEMO_ANALYSIS_SEC}-second candles, oldest first, OHLC normalized in parts per million. A win pays payout x stake, a loss loses the stake. Choose the single candidate most likely to win with positive expected value, or "skip" if none is convincing. Use only the supplied data.`,
        input: [{ role: 'user', content: JSON.stringify(choices.map(({ signalId: _s, ...c }) => c)) }],
        text: { format: { type: 'json_schema', name: 'entry_choice', strict: true, schema: {
          type: 'object', additionalProperties: false, required: ['choice'],
          properties: { choice: { type: 'string', enum: ids } },
        } } },
      }),
    });
    if (!res.ok || !res.body) return { status: `http_${res.status}`, signalId: null };
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '', text = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') text += ev.delta;
        } catch { /* ignore partial */ }
      }
    }
    const choice = JSON.parse(text)?.choice;
    if (choice === 'skip') return { status: 'skip', signalId: null };
    const picked = choices.find(c => c.id === choice);
    return picked ? { status: 'ok', signalId: picked.signalId } : { status: 'invalid_response', signalId: null };
  } catch (e) {
    return { status: (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'error', signalId: null };
  }
}

export const AI_CHART_VERSION = 'demo-ai-two-charts-v1';
type ChartCandidate = Cand & { entry_strategy: string; quality: number };
export function chartChoices(candidates: ChartCandidate[], series: Map<string, Candle[]>, entrySec: number) {
  return AI_CHART_STRATEGIES.flatMap(strategy => candidates.filter(c => c.entry_strategy === strategy)
    .sort((a, b) => a.asset.localeCompare(b.asset)).slice(0, 3).flatMap((c, index) => {
      const bars = series.get(c.asset)?.filter(b => b.t + 60 <= entrySec).slice(-60);
      if (!bars || bars.length !== 60 || bars.some((b, i) => b.t !== entrySec - (60 - i) * 60)) return [];
      return [{ id: `${strategy}:${index}`, signalId: c.signal_id, strategy, asset: c.asset,
        direction: c.direction, payout: c.payout, candles: bars.map(b => [b.t, b.o, b.h, b.l, b.c]) }];
    }));
}
export function validateChartPicks(value: unknown, choices: ReturnType<typeof chartChoices>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  const result: Record<string, string | null> = {};
  for (const strategy of AI_CHART_STRATEGIES) {
    const id = response[strategy];
    if (id === 'skip') { result[strategy] = null; continue; }
    const pick = choices.find(c => c.id === id && c.strategy === strategy);
    if (!pick) return null;
    result[strategy] = pick.signalId;
  }
  return result;
}

// Maintains the existing raw-HTTP Responses client, batching both cards into one bounded call.
export async function requestChartDecisions(candidates: ChartCandidate[], series: Map<string, Candle[]>, entryMs: number,
  key: string, fetcher = fetch): Promise<{ status: string; picks: Record<string, string | null> | null; error?: string; pause?: boolean }> {
  const choices = chartChoices(candidates, series, entryMs / 1000);
  if (!choices.length) return { status: 'no_candidates', picks: null };
  const properties = Object.fromEntries(AI_CHART_STRATEGIES.map(strategy => [strategy,
    { type: 'string', enum: ['skip', ...choices.filter(c => c.strategy === strategy).map(c => c.id)] }]));
  try {
    const res = await fetcher('https://ai.gateway.lovable.dev/v1/responses', {
      method: 'POST', headers: { 'Lovable-API-Key': key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({ model: DEMO_AI_GATE_MODEL, stream: true, store: false,
        reasoning: { effort: 'high', summary: 'auto' }, include: ['reasoning.encrypted_content'],
        instructions: 'Decide two independent PRACTICE-only one-minute binary option entries using real closed IQ Option M1 OHLC candles (time,open,high,low,close). IA_ROMPIMENTO_M1 is confirmed breakout continuation; IA_RECUO_M1 is trend resumption after a pullback. Assess structure, support/resistance, exhaustion and opposing wicks, select at most one supplied candidate PER strategy or skip. Never reverse the supplied direction, invent data, assume guaranteed profit or use future candles. Win gains payout times stake; loss loses stake. Skip when evidence is weak or payout is missing. No news feed is provided: do not invent news safety. Return the required JSON choices.',
        input: [{ role: 'user', content: JSON.stringify(choices.map(({ signalId: _s, ...c }) => c)) }],
        text: { format: { type: 'json_schema', name: 'two_chart_choices', strict: true,
          schema: { type: 'object', additionalProperties: false, required: [...AI_CHART_STRATEGIES], properties } } },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = typeof body.message === 'string' ? body.message : typeof body.error?.message === 'string' ? body.error.message : `Falha da IA (${res.status})`;
      return { status: `http_${res.status}`, picks: null, error: message, pause: [401,402,403,404,429].includes(res.status) };
    }
    if (!res.body) return { status: 'empty', picks: null };
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '', text = '', refusal = false, failed = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
          if (event.type?.includes('refusal')) refusal = true;
          if (event.type === 'error' || event.type === 'response.failed') failed = true;
        } catch { /* malformed event never selects an order */ }
      }
    }
    if (refusal || failed) return { status: refusal ? 'refused' : 'stream_error', picks: null, pause: true,
      error: refusal ? 'A IA recusou a análise; análises automáticas pausadas.' : 'A IA interrompeu a análise; análises automáticas pausadas.' };
    if (!aiChartTimely(entryMs, Date.now())) return { status: 'late', picks: null };
    const picks = validateChartPicks(JSON.parse(text), choices);
    return { status: picks ? 'ok' : 'invalid_response', picks };
  } catch { return { status: 'error', picks: null }; }
}
