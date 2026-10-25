import { confirmedDemoWin, type DemoWinOrder } from './demo-win-scores.ts';

export async function readDemoWinningReferences<T extends { signal_id: string }>(
  readOrders: (from: number, to: number) => Promise<DemoWinOrder[]>,
  readCandidates: (ids: string[]) => Promise<T[]>,
): Promise<T[]> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const page = await readOrders(from, from + 999);
    for (const row of page) if (confirmedDemoWin(row)) ids.add(row.signal_id);
    if (page.length < 1000) break;
  }
  const references: T[] = [];
  const allIds = [...ids];
  for (let from = 0; from < allIds.length; from += 200) {
    const batch = allIds.slice(from, from + 200);
    const ownIds = new Set(batch);
    for (const candidate of await readCandidates(batch)) {
      if (ownIds.has(candidate.signal_id)) references.push(candidate);
    }
  }
  return references;
}