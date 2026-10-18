import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entrySubmissionDelay } from './entry-schedule.ts';

test('confirmed signal at candle :00 submits immediately without another-minute wait', () => {
  const opening = Date.parse('2026-10-18T10:13:00-03:00');
  assert.equal(entrySubmissionDelay(opening, opening), 0);
  assert.equal(entrySubmissionDelay(opening, opening + 3463), 0);
});
test('future candle keeps its :00 target with bounded transport lead', () => {
  const opening = Date.parse('2026-10-18T10:13:00-03:00');
  assert.equal(entrySubmissionDelay(opening, opening - 1000), 880);
});