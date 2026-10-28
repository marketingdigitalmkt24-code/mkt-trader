import { expect, test } from 'bun:test';
import { selectChartWithNoteSupport, selectTakashiByNote } from './demo-note-selection';
const takashi = (signal_id: string, _score: number) => ({ signal_id, _score, asset: 'GBP/USD-OTC', direction: 'CALL', entry_strategy: 'TAKASHI_BNF_V1', created_at: '2026-10-28T05:00:00Z' });
test('restored Takashi selection accepts notes without any chart match', () => {
  const selected = selectTakashiByNote([takashi('low', .14), takashi('high', 1.95)]);
  expect(selected?.signal_id).toBe('high');
  expect(selected?._score).toBe(1.95);
});
test('previous historical note priority precedes numeric note with no chart-distance ranking', () => {
  expect(selectTakashiByNote([takashi('high', 9), takashi('priority', 2.23)], [223])?.signal_id).toBe('priority');
});
test('restored selection stays Takashi-only and accepts any finite note', () => {
  expect(selectTakashiByNote([{ ...takashi('other', 100), entry_strategy: 'VELA_FORCA' }, takashi('invalid', NaN), takashi('zero', 0)])?.signal_id).toBe('zero');
  expect(selectTakashiByNote([])).toBeNull();
});
test('more WIN without LOSS supports only eligible charts', () => {
  const candidates = [{ signal_id: 'a', _score: .14, _preferredPatternDistance: .8 }, { signal_id: 'b', _score: 4.9, _preferredPatternDistance: .2 }];
  expect(selectChartWithNoteSupport(candidates, [{ cents: 14, wins: 3 }, { cents: 490, wins: 1 }])?.signal_id).toBe('a');
  expect(selectChartWithNoteSupport([{ ...candidates[0], _preferredPatternDistance: 1.31 }, candidates[1]], [{ cents: 14, wins: 3 }])?.signal_id).toBe('b');
});
test('without supported notes chart distance chooses, not highest numeric note', () => {
  expect(selectChartWithNoteSupport([{ signal_id: 'a', _score: 0, _preferredPatternDistance: .1 }, { signal_id: 'b', _score: 9, _preferredPatternDistance: .5 }], [])?.signal_id).toBe('a');
});