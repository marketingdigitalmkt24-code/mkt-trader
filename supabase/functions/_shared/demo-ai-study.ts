import { DEMO_ANALYSIS_SEC, DEMO_CANDLE_SEC } from './demo-timing.ts';

export const DEMO_AI_VERSION = 'demo-ai-study-v1';
export const DEMO_AI_MODEL = 'openai/gpt-6.1-sol';
const PERIOD = 15 * 60_000;
const STUDY_START = Date.parse('2026-11-13T16:48:00Z');
const STUDY_END = STUDY_START + 3 * 24 * 60 * 60_000;
const CANDIDATES_PER_CARD = 3;
const BARS = DEMO_CANDLE_SEC / DEMO_ANALYSIS_SEC;
type Candle = { t: number; o: number; h: number; l: number; c: number };
export type StudySignal = { asset: string; direction: string; payout: number | null; signal_id: string };
type StudyRank = { candidate: StudySignal; score: number };
type StudyCard = { strategy: string; reference: StudySignal | null; ranked: StudyRank[] };
type Choice = { id: string; signal: StudySignal; score: number; candles: number[][] };
type Card = { strategy: string; reference: StudySignal | null; choices: Choice[] };
type StudyPick = { strategy: string; reference: StudySignal | null; model: StudySignal | null };
type Outcome = { status: 'no_entry' | 'missing_candles' } | { status: 'win' | 'loss' | 'tie'; netPerUnit: number };

export function demoAiStudySlot(target: number) {
  return demoAiStudyActive(target) && (target - STUDY_START) % PERIOD === 0;
}

export function demoAiStudyActive(target: number) {
  return target >= STUDY_START && target < STUDY_END;
}

export function demoAiStudyPreviousSlot(target: number) {
  const slot = STUDY_START + Math.floor((target - STUDY_START - 1) / PERIOD) * PERIOD;
  const age = target - slot;
  return demoAiStudySlot(slot) && age >= 60_000 && age <= 5 * 60_000 ? slot : null;
}

export function demoAiStudyCards(cards: StudyCard[], series: Map<string, Candle[]>, entrySec: number): Card[] {
  return cards.flatMap(card => {
    const choices: Choice[] = [];
    for (const { candidate, score } of card.ranked) {
      if (choices.length >= CANDIDATES_PER_CARD) break;
      if (candidate.payout === null || !(candidate.payout > 0 && candidate.payout <= 1)) continue;
      const bars = series.get(candidate.asset)?.filter(c => c.t + DEMO_ANALYSIS_SEC <= entrySec).slice(-BARS);
      if (bars?.length !== BARS || bars.some((c, i) => c.t !== entrySec - (BARS - i) * DEMO_ANALYSIS_SEC)) continue;
      const base = bars[0].o;
      if (!(base > 0)) continue;
      const relative = (price: number) => Math.round((price / base - 1) * 1e6);
      const { asset, direction, payout, signal_id } = candidate;
      choices.push({
        id: String(choices.length + 1), signal: { asset, direction, payout, signal_id }, score,
        candles: bars.map(c => [c.o, c.h, c.l, c.c].map(relative)),
      });
    }
    if (!choices.length) return [];
    const reference = card.reference && {
      asset: card.reference.asset, direction: card.reference.direction,
      payout: card.reference.payout, signal_id: card.reference.signal_id,
    };
    return [{ strategy: card.strategy, reference, choices }];
  });
}

export async function requestDemoAiStudy(cards: Card[], key: string, fetcher = fetch) {
  const properties = Object.fromEntries(cards.map((card, i) => [
    String(i + 1), { type: 'string', enum: ['skip', ...card.choices.map(c => c.id)] },
  ]));
  // Anonymous candidate IDs and market features only. Account identifiers and trade history stay local.
  const input = cards.map((card, i) => ({
    card: String(i + 1), strategy: card.strategy,
    candidates: card.choices.map(c => ({
      id: c.id, direction: c.signal.direction, payout: c.signal.payout, technicalScore: Math.round(c.score),
      ohlcPpm: c.candles,
    })),
  }));
  const response = await fetcher('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEMO_AI_MODEL, reasoning_effort: 'high', max_completion_tokens: 1536,
      messages: [
        { role: 'system', content: `You rank test-only one-minute CALL/PUT signals. Each candidate contains ${BARS} closed ${DEMO_ANALYSIS_SEC}-second candles, oldest first, normalized OHLC in parts per million. Favor coherent movement and better net payout, discount noisy or exhausted moves. A win pays payout times stake, a loss loses the stake. Pick one candidate ID or skip for each card. Use only the supplied data. Return the JSON choices only.` },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: { type: 'json_schema', json_schema: {
        name: 'demo_signal_choices', strict: true,
        schema: { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) },
      } },
    }),
  });
  if (!response.ok) return { status: `http_${response.status}` as const, picks: null };
  const body = await response.json();
  const message = body?.choices?.[0]?.message;
  if (typeof message?.content !== 'string' || message.refusal) return { status: 'invalid_response', picks: null };
  let parsed: unknown;
  try { parsed = JSON.parse(message.content); }
  catch { return { status: 'invalid_response', picks: null }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== cards.length) {
    return { status: 'invalid_response', picks: null };
  }
  const values = parsed as Record<string, unknown>;
  const picks: StudyPick[] = [];
  for (const [i, card] of cards.entries()) {
    const id = values[String(i + 1)];
    const selected = card.choices.find(c => c.id === id);
    if (!selected && id !== 'skip') return { status: 'invalid_response', picks: null };
    picks.push({ strategy: card.strategy, reference: card.reference, model: selected?.signal ?? null });
  }
  return { status: 'ok', picks };
}

function outcome(signal: StudySignal | null, series: Map<string, Candle[]>, entrySec: number): Outcome {
  if (!signal) return { status: 'no_entry' };
  const bars = series.get(signal.asset)?.filter(c => c.t >= entrySec && c.t < entrySec + DEMO_CANDLE_SEC);
  if (!bars || bars.length !== BARS || bars.some((c, i) => c.t !== entrySec + i * DEMO_ANALYSIS_SEC)
    || !(bars[0].o > 0 && bars[BARS - 1].c > 0) || !Number.isFinite(bars[0].o) || !Number.isFinite(bars[BARS - 1].c)
    || (signal.direction !== 'CALL' && signal.direction !== 'PUT')
    || signal.payout === null || !(signal.payout > 0 && signal.payout <= 1)) return { status: 'missing_candles' };
  const move = bars[BARS - 1].c - bars[0].o;
  if (move === 0) return { status: 'tie', netPerUnit: 0 };
  const win = (move > 0) === (signal.direction === 'CALL');
  return win ? { status: 'win', netPerUnit: signal.payout } : { status: 'loss', netPerUnit: -1 };
}

export function settleDemoAiStudy(picks: StudyPick[], series: Map<string, Candle[]>, entrySec: number) {
  const results = picks.map(({ strategy, reference, model }) => ({
    strategy, referenceSignal: reference?.signal_id ?? null, modelSignal: model?.signal_id ?? null,
    reference: outcome(reference, series, entrySec), model: outcome(model, series, entrySec),
  }));
  const complete = results.every(row => row.reference.status !== 'missing_candles' && row.model.status !== 'missing_candles');
  return { results, complete };
}
