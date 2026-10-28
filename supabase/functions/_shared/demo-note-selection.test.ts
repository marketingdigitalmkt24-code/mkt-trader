import { expect, test } from 'bun:test';
import { selectChartWithNoteSupport } from './demo-note-selection';
test('more WIN without LOSS supports only eligible charts', () => {
  const candidates = [{ signal_id: 'a', _score: .14, _preferredPatternDistance: .8 }, { signal_id: 'b', _score: 4.9, _preferredPatternDistance: .2 }];
  expect(selectChartWithNoteSupport(candidates, [{ cents: 14, wins: 3 }, { cents: 490, wins: 1 }])?.signal_id).toBe('a');
  expect(selectChartWithNoteSupport([{ ...candidates[0], _preferredPatternDistance: 1.31 }, candidates[1]], [{ cents: 14, wins: 3 }])?.signal_id).toBe('b');
});
test('without supported notes chart distance chooses, not highest numeric note', () => {
  expect(selectChartWithNoteSupport([{ signal_id: 'a', _score: 0, _preferredPatternDistance: .1 }, { signal_id: 'b', _score: 9, _preferredPatternDistance: .5 }], [])?.signal_id).toBe('a');
});