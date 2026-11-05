import { expect, test } from 'bun:test';
import { selectDemoByRotation, nextRotationOrder } from './demo-profit-selection.ts';
import { demoCohort } from './demo-226-policy.ts';

const c = (id: string, strategy: string, score = 2) => ({ signal_id: id, asset: id, direction: 'CALL', entry_strategy: strategy, created_at: '2026-11-03T03:50:00Z', _score: score });
const all = [c('t', 'TENDENCIA_FORCA_RECUO'), c('i', 'ICHIMOKU'), c('r', 'RECUO_EMA21', 9)];

test('only the four chosen strategies may enter the Demo', () => {
  for (const s of ['ICHIMOKU_RECUO21', 'TENDENCIA_FORCA_RECUO', 'ICHIMOKU', 'RECUO_EMA21']) expect(demoCohort(1, s)).toBe('indicator');
  for (const s of ['TAKASHI_BNF_V1', 'TENDENCIA', 'VELA_FORCA', 'ROMPIMENTO', 'REVERSAO_RSI', 'KDJ']) expect(demoCohort(9, s)).toBeNull();
  expect(selectDemoByRotation([c('k', 'KDJ', 99), c('x', 'TAKASHI_BNF_V1', 99)], null)).toBeNull();
});

test('Ichimoku + Recuo 21 keeps priority', () => {
  expect(selectDemoByRotation([...all, c('k', 'ICHIMOKU_RECUO21', 0.1)], 'TENDENCIA_FORCA_RECUO')?.signal_id).toBe('k');
});

test('others rotate after the previous slot, ignoring note and profit', () => {
  expect(nextRotationOrder('TENDENCIA_FORCA_RECUO')).toEqual(['ICHIMOKU', 'RECUO_EMA21', 'TENDENCIA_FORCA_RECUO']);
  expect(selectDemoByRotation(all, 'TENDENCIA_FORCA_RECUO')?.signal_id).toBe('i');
  expect(selectDemoByRotation(all, 'ICHIMOKU')?.signal_id).toBe('r');
  expect(selectDemoByRotation(all, 'RECUO_EMA21')?.signal_id).toBe('t');
});

test('a strategy without a signal that minute passes its turn to the next one', () => {
  expect(selectDemoByRotation([c('t', 'TENDENCIA_FORCA_RECUO'), c('r', 'RECUO_EMA21')], 'TENDENCIA_FORCA_RECUO')?.signal_id).toBe('r');
});

test('notes never choose the asset inside any of the four strategies', () => {
  for (const strategy of ['TENDENCIA_FORCA_RECUO', 'ICHIMOKU_RECUO21', 'ICHIMOKU', 'RECUO_EMA21']) {
    const low = c('a', strategy, 1);
    const high = c('z', strategy, 99);
    expect(selectDemoByRotation([high, low], null)?.signal_id).toBe('a');
    expect(selectDemoByRotation([{...high, _score: -999}, {...low, _score: Number.NaN}], null)?.signal_id).toBe('a');
  }
});

test('missing or non-finite notes never reject an active strategy', () => {
  for (const strategy of ['TENDENCIA_FORCA_RECUO', 'ICHIMOKU_RECUO21', 'ICHIMOKU', 'RECUO_EMA21']) {
    for (const score of [null, undefined, Number.NaN, -100, Infinity]) {
      expect(demoCohort(score, strategy)).toBe('indicator');
    }
  }
});
