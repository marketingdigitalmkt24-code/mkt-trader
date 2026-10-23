import { expect, test } from 'bun:test';
import { extendDemoChart } from './supabase/functions/_shared/demo-chart-snapshot';
const candle = (t: number) => ({ t, o: 100, c: 99, h: 101, l: 98 });
test('includes the entry candle and next closed candle', () => {
  expect(extendDemoChart([candle(60)], [candle(120), candle(180), candle(240)], 120, 240).map(k => k.t)).toEqual([60, 120, 180]);
});
test('does not show the next candle before its closure', () => {
  expect(extendDemoChart([candle(60)], [candle(120), candle(180)], 120, 239).map(k => k.t)).toEqual([60, 120]);
});
test('repairs a missed snapshot without duplicating saved candles', () => {
  expect(extendDemoChart([candle(60), candle(120)], [candle(120), candle(180)], 120, 300).map(k => k.t)).toEqual([60, 120, 180]);
});