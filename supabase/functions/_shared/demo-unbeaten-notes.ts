import type { ScoreOutcome } from './demo-score-priority.ts';

export type UnbeatenNote = { cents: number; wins: number };
type Evidence = ScoreOutcome & { settled_at: string | null };

// Supplementary evidence only: never bypass chart eligibility or authorize placement.
export function unbeatenDemoNotes(rows: Evidence[], scores: ReadonlyMap<string, number>, observedAt: number): UnbeatenNote[] {
  const notes = new Map<number, { wins: number; loss: boolean }>();
  const seen = new Set<string>();
  for (const row of rows) {
    const settledAt = Date.parse(row.settled_at ?? '');
    const score = scores.get(row.signal_id);
    if (row.status !== 'confirmed' || !['PRACTICE','REAL'].includes(row.account_type)
      || !row.iq_option_id || !/^\d+$/.test(row.iq_option_id)
      || !['win', 'loss'].includes(row.result)
      || !Number.isFinite(observedAt) || !Number.isFinite(settledAt) || settledAt > observedAt
      || score == null || !Number.isFinite(score)) continue;
    const key = `${row.iq_option_id}:${row.result}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cents = Math.round(Number(score.toFixed(2)) * 100);
    const note = notes.get(cents) ?? { wins: 0, loss: false };
    if (row.result === 'loss') note.loss = true;
    else note.wins++;
    notes.set(cents, note);
  }
  return [...notes].filter(([, note]) => note.wins > 0 && !note.loss)
    .map(([cents, note]) => ({ cents, wins: note.wins }))
    .sort((a, b) => b.wins - a.wins || a.cents - b.cents);
}

export async function readUnbeatenDemoNotes(
  readPage: (from: number, to: number) => Promise<Evidence[]>,
  readScores: (ids: string[]) => Promise<{ signal_id: string; score: number }[]>,
  observedAt: number,
): Promise<UnbeatenNote[]> {
  const rows: Evidence[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await readPage(from, from + 999);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const ids = [...new Set(rows.map(row => row.signal_id))];
  const scores = new Map<string, number>();
  for (let from = 0; from < ids.length; from += 200) {
    for (const row of await readScores(ids.slice(from, from + 200))) scores.set(row.signal_id, row.score);
  }
  return unbeatenDemoNotes(rows, scores, observedAt);
}