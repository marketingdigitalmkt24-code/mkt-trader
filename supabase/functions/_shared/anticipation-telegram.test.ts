import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canNotifyAnticipation } from './anticipation-telegram.ts';
import { sendIQAlert } from './telegram-iq-alert.ts';

const entryAt = Date.parse('2026-10-21T19:08:00Z');
const order = { strategy: 'FORCA_ANTECIPADA', authorized: true, timeframe: 'M1', entryAt, success: true, tradeId: '14372665294' };
test('anticipation Telegram accepts fresh confirmed IQ orders only', () => {
  assert.equal(canNotifyAnticipation(order, entryAt + 12000), true);
  for (const invalid of [{ authorized: false }, { timeframe: 'TEST' }, { success: false }, { tradeId: 'test-1' }, { strategy: 'VELA_FORCA' }]) {
    assert.equal(canNotifyAnticipation({ ...order, ...invalid }, entryAt + 12000), false);
  }
});
test('anticipation Telegram rejects future and expired signals', () => {
  assert.equal(canNotifyAnticipation(order, entryAt - 1), false);
  assert.equal(canNotifyAnticipation(order, entryAt + 60000), false);
});
test('confirmed anticipation is suppressed during the user Telegram pause', async () => {
  const now = Math.floor(Date.now() / 60000) * 60000;
  let calls = 0;
  const id = await sendIQAlert({ asset: 'TRON-OTC', direction: 'put', expiration: 1, entryAt: now,
    signalId: 'forca_antecipada-example', timeframe: 'M1', strategy: 'Antecipação de Força',
    brokerOrderId: '14372665294', accountType: 'PRACTICE' }, { lovableKey: 'fixture', telegramKey: 'fixture' }, async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(String(init?.body)).chat_id, '-1001743286485');
    return new Response(JSON.stringify({ ok: true, result: { message_id: 123 } }), { status: 200 });
  });
  assert.equal(calls, 0);
  assert.equal(id, undefined);
});