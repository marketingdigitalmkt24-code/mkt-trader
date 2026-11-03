import { expect, test } from 'bun:test';
import { noteSupportBonus, selectTakashiByNote } from './demo-note-selection';
const takashi = (signal_id: string, _score: number) => ({ signal_id, _score, asset: 'GBP/USD-OTC', direction: 'CALL', entry_strategy: 'TAKASHI_BNF_V1', created_at: '2026-10-28T05:00:00Z' });
test('without unbeaten notes the highest current note wins', () => {
  expect(selectTakashiByNote([takashi('low', .14), takashi('high', 1.95)])?.signal_id).toBe('high');
});
test('unbeaten note with WINs helps a close candidate', () => {
  expect(selectTakashiByNote([takashi('a', 1.5), takashi('b', 1.7)], [{ cents: 150, wins: 3 }])?.signal_id).toBe('a');
});
test('note support is capped and never overrides a much stronger analysis', () => {
  expect(noteSupportBonus(1.5, [{ cents: 150, wins: 50 }])).toBe(0.5);
  expect(selectTakashiByNote([takashi('a', 1.5), takashi('b', 2.5)], [{ cents: 150, wins: 50 }])?.signal_id).toBe('b');
});
test('stays Takashi-only and accepts any finite note', () => {
  expect(selectTakashiByNote([{ ...takashi('other', 100), entry_strategy: 'FORCA_ANTECIPADA_V1' }, takashi('invalid', NaN), takashi('zero', 0)])?.signal_id).toBe('zero');
  expect(selectTakashiByNote([])).toBeNull();
});
test('Takashi, combined and separate Ichimoku/Recuo 21 compete for the single Demo slot by score', () => {
  const pick = selectTakashiByNote([takashi('t', 1.2), { ...takashi('i', 2.1), entry_strategy: 'ICHIMOKU_RECUO21' }, { ...takashi('r', 3), entry_strategy: 'RECUO_EMA21' }]);
  expect(pick?.signal_id).toBe('r');
});
