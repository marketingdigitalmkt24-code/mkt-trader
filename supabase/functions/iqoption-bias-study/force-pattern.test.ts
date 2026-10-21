import { describe, expect, test } from 'bun:test';
import { forcePattern } from './force-pattern';
const candles = () => Array.from({ length: 100 }, (_, i) => ({ t: i * 60, o: 10, c: 11, h: 12, l: 9 }));
describe('force candle research', () => {
  test('only closed candles determine the descriptive ratio', () => {
    const cs = candles(); cs[99] = { t: 5940, o: 10, c: 13, h: 13, l: 10 };
    const a = forcePattern(cs, 6000, 'CALL');
    const b = forcePattern([...cs, { t: 6000, o: 10, c: 999, h: 999, l: 1 }], 6000, 'CALL');
    expect(a).toEqual(b); expect('forceBodyRatio' in a && a.forceBodyRatio).toBe(3);
  });
  test('missing prior candle excludes entry', () => {
    expect(forcePattern(candles().filter(k => k.t !== 120), 6000, 'CALL').coverage).toBe('MISSING');
  });
});