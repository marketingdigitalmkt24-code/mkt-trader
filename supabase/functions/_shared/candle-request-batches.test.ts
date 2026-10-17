import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendCandleRequestBatches } from './candle-request-batches.ts';

test('all assets remain ranked with far fewer pacing waits', async () => {
  const assets = Array.from({ length: 175 }, (_, i) => i);
  const sent: number[] = [];
  let waits = 0;
  await sendCandleRequestBatches(assets, asset => sent.push(asset), async () => { waits++; });
  assert.deepEqual(sent, assets);
  assert.equal(waits, 10);
});
test('priority result asset is sent immediately without an initial wait', async () => {
  const events: string[] = [];
  await sendCandleRequestBatches(['expired-test', 'candidate'], asset => events.push(asset), async () => { events.push('wait'); });
  assert.deepEqual(events, ['expired-test', 'candidate']);
});