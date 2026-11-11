import { expect, test } from 'bun:test';
import { mergeOpenPositions } from '../src/lib/open-positions';

const pos = (id: string, asset: string, pnl = 0) => ({ id, type: 'binary-option', asset, direction: 'CALL', invest: 2, pnl });

test('a broker position and the same recorded order appear only once', () => {
  const merged = mergeOpenPositions([pos('777', 'EUR/USD', 1.2)], [pos('777', 'EUR/USD')]);
  expect(merged.length).toBe(1);
  expect(merged[0].pnl).toBe(1.2); // live broker profit wins over the recorded placeholder
});

test('recorded orders still fill the gap between broker reads', () => {
  const merged = mergeOpenPositions([pos('777', 'EUR/USD')], [pos('888', 'GBP/USD')]);
  expect(merged.map(p => p.id)).toEqual(['777', '888']);
});

test('an order opened outside this app never enters the list', () => {
  const merged = mergeOpenPositions([], []);
  expect(merged.length).toBe(0);
});
