import { expect, test } from 'bun:test';
import { demoChartComparison } from './src/lib/demo-chart-comparison';
const entry = 120;
const candle = { t: entry, o: 100, c: 99, h: 101, l: 98 };
test('PUT prediction agrees with a closed falling candle', () => {
  expect(demoChartComparison([candle], entry, 'PUT', 180)?.agrees).toBe(true);
});
test('CALL prediction disagrees with a closed falling candle', () => {
  expect(demoChartComparison([candle], entry, 'CALL', 180)?.agrees).toBe(false);
});
test('flat candle is neutral, not a successful prediction', () => {
  expect(demoChartComparison([{ ...candle, c: 100 }], entry, 'PUT', 180)?.agrees).toBeNull();
});
test('unclosed or missing target candle cannot confirm prediction', () => {
  expect(demoChartComparison([candle], entry, 'PUT', 179)).toBeNull();
  expect(demoChartComparison([{ ...candle, t: 60 }], entry, 'PUT', 180)).toBeNull();
});