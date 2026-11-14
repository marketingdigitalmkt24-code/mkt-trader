import { settleDemoAiStudy, type StudySignal } from './demo-ai-study.ts';

const PREFIX = 'demo-filter-measurement-v1';
type Candle = { t: number; o: number; h: number; l: number; c: number };
export type FilterMeasurement = {
  entryMinute: string;
  comparisonPolicy?: 'strict-filter-v6' | 'previous-ranking-v7';
  referencePolicy?: string;
  picks: { strategy: string; reference: StudySignal | null; model: StudySignal | null }[];
};
type Bucket = {
  download(path: string): Promise<{ data: Blob | null; error: unknown }>;
  upload(path: string, content: string, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown }>;
};
const key = (target: number, kind: string, prefix: string) => `${prefix}/minute-${Math.floor(target / 60_000) % 10}-${kind}.json`;
const options = { contentType: 'application/json', upsert: true };
const signal = (s: StudySignal | null): StudySignal | null => s && ({
  asset: s.asset, direction: s.direction, payout: s.payout, signal_id: s.signal_id,
});

export async function measureDemoFilters(
  bucket: Bucket, measurement: FilterMeasurement, series: Map<string, Candle[]>, target: number,
  now = Date.now, report: (event: unknown) => void = event => console.log(
    measurement.comparisonPolicy === 'previous-ranking-v7' ? 'Demo ranking comparison outcome:' : 'Demo filter measurement outcome:',
    JSON.stringify(event)),
) {
  const comparisonPolicy = measurement.comparisonPolicy ?? 'strict-filter-v6';
  const prefix = comparisonPolicy === 'previous-ranking-v7' ? 'demo-ranking-comparison-v1' : PREFIX;
  const storageKey = (target: number, kind: string) => key(target, kind, prefix);
  // Twenty private rotating objects bound storage. Exact timestamps prevent reuse of an older slot.
  if (measurement.picks.length && now() < target + 60_000) {
    const snapshot = {
      entryMinute: measurement.entryMinute,
      referencePolicy: measurement.referencePolicy ?? 'demo-entry-quality-v8',
      comparisonPolicy,
      picks: measurement.picks.map(pick => ({ strategy: pick.strategy, reference: signal(pick.reference), model: signal(pick.model) })),
    };
    await bucket.upload(storageKey(target, 'decision'), JSON.stringify(snapshot), options);
  }
  await Promise.all([1, 2, 3, 4, 5].map(async age => {
    const entry = target - age * 60_000;
    const expected = new Date(entry).toISOString();
    const decision = await bucket.download(storageKey(entry, 'decision'));
    if (!decision.data) return;
    const snapshot = JSON.parse(await decision.data.text()) as FilterMeasurement;
    if (snapshot.entryMinute !== expected) return;
    const previous = await bucket.download(storageKey(entry, 'result'));
    if (previous.data) {
      const result = JSON.parse(await previous.data.text());
      if (result.entryMinute === expected) return;
    }
    const result = settleDemoAiStudy(snapshot.picks, series, entry / 1000);
    if (!result.complete && age < 5) return;
    const event = {
      version: prefix, entryMinute: expected, basis: 'simulated_quotes_per_unit',
      referencePolicy: snapshot.referencePolicy ?? 'demo-measured-selection-v7',
      comparisonPolicy: snapshot.comparisonPolicy ?? 'strict-filter-v6',
      ...result,
    };
    const saved = await bucket.upload(storageKey(entry, 'result'), JSON.stringify(event), options);
    if (!saved.error) report(event);
  }));
}
