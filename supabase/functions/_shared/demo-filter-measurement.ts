import { settleDemoAiStudy, type StudySignal } from './demo-ai-study.ts';

const PREFIX = 'demo-filter-measurement-v1';
type Candle = { t: number; o: number; h: number; l: number; c: number };
export type FilterMeasurement = {
  entryMinute: string;
  picks: { strategy: string; reference: StudySignal | null; model: StudySignal | null }[];
};
type Bucket = {
  download(path: string): Promise<{ data: Blob | null; error: unknown }>;
  upload(path: string, content: string, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown }>;
};
const key = (target: number, kind: string) => `${PREFIX}/minute-${Math.floor(target / 60_000) % 10}-${kind}.json`;
const options = { contentType: 'application/json', upsert: true };
const signal = (s: StudySignal | null): StudySignal | null => s && ({
  asset: s.asset, direction: s.direction, payout: s.payout, signal_id: s.signal_id,
});

export async function measureDemoFilters(
  bucket: Bucket, measurement: FilterMeasurement, series: Map<string, Candle[]>, target: number,
  now = Date.now, report: (event: unknown) => void = event => console.log('Demo filter measurement outcome:', JSON.stringify(event)),
) {
  // Twenty private rotating objects bound storage. Exact timestamps prevent reuse of an older slot.
  if (measurement.picks.length && now() < target + 60_000) {
    const snapshot = {
      entryMinute: measurement.entryMinute,
      picks: measurement.picks.map(pick => ({ strategy: pick.strategy, reference: signal(pick.reference), model: signal(pick.model) })),
    };
    await bucket.upload(key(target, 'decision'), JSON.stringify(snapshot), options);
  }
  await Promise.all([1, 2, 3, 4, 5].map(async age => {
    const entry = target - age * 60_000;
    const expected = new Date(entry).toISOString();
    const decision = await bucket.download(key(entry, 'decision'));
    if (!decision.data) return;
    const snapshot = JSON.parse(await decision.data.text()) as FilterMeasurement;
    if (snapshot.entryMinute !== expected) return;
    const previous = await bucket.download(key(entry, 'result'));
    if (previous.data) {
      const result = JSON.parse(await previous.data.text());
      if (result.entryMinute === expected) return;
    }
    const result = settleDemoAiStudy(snapshot.picks, series, entry / 1000);
    if (!result.complete && age < 5) return;
    const event = {
      version: PREFIX, entryMinute: expected, basis: 'simulated_quotes_per_unit',
      referencePolicy: 'demo-measured-selection-v7', comparisonPolicy: 'strict-filter-v6',
      ...result,
    };
    const saved = await bucket.upload(key(entry, 'result'), JSON.stringify(event), options);
    if (!saved.error) report(event);
  }));
}
