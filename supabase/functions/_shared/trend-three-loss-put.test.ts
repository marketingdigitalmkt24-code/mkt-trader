import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threeTrendLosses, freshTrendPut, notifyTrendPut } from './trend-three-loss-put.ts';
const entry = Date.parse('2026-10-22T03:46:00Z');
const rows = ['USD/JPY-OTC', 'NZD/JPY-OTC', 'USD/SGD-OTC'].map((asset, i) => ({
  signal_id: `t7-${asset}-TENDENCIA-${entry / 1000 - (i + 1) * 60}`,
  created_at: new Date(entry - (i + 1) * 60000).toISOString(), entry_strategy: 'TENDENCIA', result: 'loss',
}));
test('00:43, 00:44 and 00:45 Trend losses across assets authorize 00:46', () => {
  assert.equal(threeTrendLosses(rows, entry), true);
  assert.equal(threeTrendLosses(rows, entry + 60000), false);
});
test('win, tie, pending, other strategy or missing minute cannot authorize PUT', () => {
  for (const result of ['win', 'tie', 'test7_open', 'expired']) {
    assert.equal(threeTrendLosses([{ ...rows[0], result }, ...rows.slice(1)], entry), false);
  }
  assert.equal(threeTrendLosses([{ ...rows[0], entry_strategy: 'VELA_FORCA' }, ...rows.slice(1)], entry), false);
  assert.equal(threeTrendLosses(rows.slice(1), entry), false);
});
test('duplicate selected minute fails closed; study observations do not affect sequence', () => {
  assert.equal(threeTrendLosses([...rows, rows[0]], entry), false);
  assert.equal(threeTrendLosses([...rows, { ...rows[0], signal_id: 'study-force-first-x', result: 'win' }], entry), true);
});
test('no entry before the loss closes or at/after 30 seconds, no rolling forward', () => {
  assert.equal(freshTrendPut(entry, entry - 1), false);
  assert.equal(freshTrendPut(entry, entry), true);
  assert.equal(freshTrendPut(entry, entry + 29999), true);
  assert.equal(freshTrendPut(entry, entry + 30000), false);
});
test('Telegram requires a confirmed numeric IQ order in its original minute', () => {
  assert.equal(notifyTrendPut({ success: true, tradeId: '14372665294' }, entry, entry + 12000), true);
  assert.equal(notifyTrendPut({ success: false }, entry, entry + 12000), false);
  assert.equal(notifyTrendPut({ success: true, tradeId: 'TEST' }, entry, entry + 12000), false);
  assert.equal(notifyTrendPut({ success: true, tradeId: '14372665294' }, entry, entry + 60000), false);
});