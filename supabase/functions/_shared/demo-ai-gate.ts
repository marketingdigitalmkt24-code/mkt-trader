import { DEMO_ANALYSIS_SEC, DEMO_CANDLE_SEC } from './demo-timing.ts';

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
        instructions: 'You decide test-only one-minute CALL/PUT binary entries for a trend+force+pullback strategy. Each candidate has 12 closed 5-second candles, oldest first, OHLC normalized in parts per million. A win pays payout x stake, a loss loses the stake. Choose the single candidate most likely to win with positive expected value, or "skip" if none is convincing. Use only the supplied data.',
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
