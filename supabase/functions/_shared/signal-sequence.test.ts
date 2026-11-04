import { describe, expect, it } from 'vitest';
import { signalSequenceAction, signalSequenceDirection, SIGNAL_SEQUENCES } from './signal-sequence.ts';

const o = (entry_strategy: string, direction: string, result: string) => ({ status: 'confirmed', entry_strategy, direction, result });
const R = 'RECUO_EMA21', T = 'TENDENCIA_FORCA_RECUO', I = 'ICHIMOKU_RECUO21';

describe('Sequência de 3 sinais', () => {
  it('has the 11 distinct user sets (13 given, 2 repeated)', () => expect(Object.keys(SIGNAL_SEQUENCES)).toHaveLength(11));
  it('set 1: Recuo CALL LOSS, Tendência PUT WIN, Recuo CALL LOSS -> invert next signal', () => {
    const newest = [o(R, 'CALL', 'loss'), o(T, 'PUT', 'win'), o(R, 'CALL', 'loss')];
    expect(signalSequenceAction(newest)).toBe('inverted');
    const now = Date.parse('2026-11-04T01:00:01Z');
    expect(signalSequenceDirection({ entry_minute: '2026-11-04T01:00:00Z', entry_strategy: R, direction: 'CALL' }, newest, now)).toBe('put');
  });
  it('set 3: Ichimoku+Recuo PUT WIN, Tendência CALL LOSS, Ichimoku+Recuo PUT WIN -> follow', () => {
    const newest = [o(I, 'PUT', 'win'), o(T, 'CALL', 'loss'), o(I, 'PUT', 'win')];
    const now = Date.parse('2026-11-04T01:00:01Z');
    expect(signalSequenceDirection({ entry_minute: '2026-11-04T01:00:00Z', entry_strategy: T, direction: 'CALL' }, newest, now)).toBe('call');
  });
  it('different direction does not match', () => {
    expect(signalSequenceAction([o(R, 'PUT', 'loss'), o(T, 'PUT', 'win'), o(R, 'CALL', 'loss')])).toBeNull();
  });
  it('unconfirmed order does not match', () => {
    expect(signalSequenceAction([{ ...o(R, 'CALL', 'loss'), status: 'unknown' }, o(T, 'PUT', 'win'), o(R, 'CALL', 'loss')])).toBeNull();
  });
});
