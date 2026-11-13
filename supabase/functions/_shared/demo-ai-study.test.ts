import { expect, test } from 'bun:test';
import { demoAiStudyCards, demoAiStudyPreviousSlot, demoAiStudySlot, requestDemoAiStudy, settleDemoAiStudy } from './demo-ai-study.ts';

const target = Date.parse('2026-11-13T16:48:00Z');
const second = target / 1000;
const signal = { signal_id: 'local-only', asset: 'EUR/USD', direction: 'CALL', payout: 0.85 };
const candles = Array.from({ length: 24 }, (_, i) => ({ t: second - 60 + i * 5, o: 100, h: 103, l: 99, c: 102 }));
const series = new Map([[signal.asset, candles]]);
const cards = demoAiStudyCards([{ strategy: 'TREND', reference: signal, ranked: [{ candidate: signal, score: 70 }] }], series, second);

test('limits the pilot to at most 288 slots and only settles after the minute closes', () => {
  expect(demoAiStudySlot(target - 900_000)).toBe(false);
  expect(demoAiStudySlot(target)).toBe(true);
  expect(demoAiStudySlot(target + 288 * 900_000)).toBe(false);
  expect(demoAiStudyPreviousSlot(target + 59_999)).toBe(null);
  expect(demoAiStudyPreviousSlot(target + 60_000)).toBe(target);
  expect(demoAiStudyPreviousSlot(target + 360_000)).toBe(null);
});

test('sends only pre-entry anonymous features and rejects an unknown candidate ID', async () => {
  const response = (choice: string) => (async (_url, options) => {
    const payload = JSON.parse(String(options?.body));
    const inputs = JSON.parse(payload.messages[1].content);
    expect(inputs[0].candidates[0].ohlcPpm.length).toBe(12);
    expect(String(options?.body).includes(signal.signal_id)).toBe(false);
    expect(String(options?.body).includes(signal.asset)).toBe(false);
    return Response.json({ choices: [{ message: { content: choice } }] });
  }) as typeof fetch;
  expect((await requestDemoAiStudy(cards, 'test', response('{"1":"99"}'))).status).toBe('invalid_response');
  const ok = await requestDemoAiStudy(cards, 'test', response('{"1":"1"}'));
  expect(ok.picks?.[0].model?.signal_id).toBe(signal.signal_id);
});

test('simulates both choices with the same payout rules and leaves missing candles ungraded', () => {
  const picks = [{ strategy: 'TREND', reference: signal, model: { ...signal, direction: 'PUT' } }];
  const result = settleDemoAiStudy(picks, series, second);
  expect(result.results[0].reference).toEqual({ status: 'win', netPerUnit: 0.85 });
  expect(result.results[0].model).toEqual({ status: 'loss', netPerUnit: -1 });
  expect(settleDemoAiStudy(picks, new Map([[signal.asset, candles.slice(0, -1)]]), second).complete).toBe(false);
});
