import { test, expect } from 'bun:test';
import { prepareTakashiCopy, waitForConfirmedCopy } from './copy-preparation';
const at = Date.parse('2026-10-25T21:58:00Z');
const candidate = { signal_id: 'takashi-bnf-v1-USD/VND-OTC-1792965480', asset: 'USD/VND-OTC', direction: 'CALL', entry_strategy: 'TAKASHI_BNF_V1', entry_minute: new Date(at).toISOString(), score: 1.59 };
const request = prepareTakashiCopy(candidate, at);
const order = { signal_id: request?.signalId ?? '', asset: candidate.asset, direction: 'PUT', iq_option_id: '14389792678', entry_strategy: 'TAKASHI_APOS_226_INVERTIDA', timeframe: 'M1', expiration_time: new Date(at + 60000).toISOString(), entry_price: 10 };
test('Takashi copy prepares the inverted direction in the current minute without selecting a stake', () => {
 expect(request).toMatchObject({ direction: 'put', entryAt: at, amount: 0 });
 expect(prepareTakashiCopy({ ...candidate, direction: 'PUT' }, at)?.direction).toBe('call');
 expect(prepareTakashiCopy(candidate, at + 30000)).toBeNull();
});
test('displayed zero Takashi score cannot prepare a copy', () => {
 expect(prepareTakashiCopy({ ...candidate, score: 0 }, at)).toBeNull();
 expect(prepareTakashiCopy({ ...candidate, score: 0.004 }, at)).toBeNull();
});
test('prepared client waits for both exact broker ID and executed principal queue', async () => {
 let clock = at, calls = 0;
 const result = await waitForConfirmedCopy(order.signal_id, at, async () => {
  calls++;
  return { order: calls === 1 ? { ...order, iq_option_id: null } : order, executed: calls >= 3 };
 }, () => clock, async () => { clock += 100; });
 expect(calls).toBe(3);
 expect(result).toEqual({ ok: true, timeframe: 'M1', expirationIso: new Date(at + 60000).toISOString() });
});
test('unconfirmed or unrelated principal cannot authorize prepared copy before expiry', async () => {
 let clock = at;
 const result = await waitForConfirmedCopy(order.signal_id, at, async () => ({ order: { ...order, signal_id: 'other-principal' }, executed: true }), () => clock, async () => { clock += 10000; });
 expect(result.ok).toBe(false);
 expect(clock).toBe(at + 30000);
});