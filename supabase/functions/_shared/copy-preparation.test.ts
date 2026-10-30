import { test, expect } from 'bun:test';
import { prepareTakashiCopy, prepareCopyPlacement, waitForConfirmedCopy } from './copy-preparation';
const at = Date.parse('2026-10-25T21:58:00Z');
const candidate = { signal_id: 'takashi-bnf-v1-USD/VND-OTC-1792965480', asset: 'USD/VND-OTC', direction: 'CALL', entry_strategy: 'TAKASHI_BNF_V1', entry_minute: new Date(at).toISOString(), score: 1.59 };
const request = prepareTakashiCopy(candidate, at);
const order = { signal_id: request?.signalId ?? '', asset: candidate.asset, direction: 'PUT', iq_option_id: '14389792678', entry_strategy: 'TAKASHI_APOS_226_INVERTIDA', timeframe: 'M1', expiration_time: new Date(at + 60000).toISOString(), entry_price: 10 };
test('Takashi copy prepares the inverted direction in the current minute without selecting a stake', () => {
 expect(request).toMatchObject({ direction: 'put', entryAt: at, amount: 0 });
 expect(prepareTakashiCopy({ ...candidate, direction: 'PUT' }, at)?.direction).toBe('call');
 expect(prepareTakashiCopy(candidate, at + 30000)).toBeNull();
});
test('accepted Takashi opening can prepare a copy even with displayed zero score', () => {
 expect(prepareTakashiCopy({ ...candidate, score: 0 }, at)?.direction).toBe('put');
 expect(prepareTakashiCopy({ ...candidate, score: 0.004 }, at)?.direction).toBe('put');
 expect(prepareTakashiCopy({ ...candidate, score: NaN }, at)).toBeNull();
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
test('confirmation arriving after the first read is detected on the 25ms retry without an extra pause', async () => {
 let clock = at, calls = 0;
 const delays: number[] = [];
 const result = await waitForConfirmedCopy(order.signal_id, at, async () => {
  calls++;
  return { order, executed: clock >= at + 1 };
 }, () => clock, async delayMs => { delays.push(delayMs); clock += delayMs; });
 expect(result.ok).toBe(true);
 expect(calls).toBe(2);
 expect(delays).toEqual([25]);
 expect(clock).toBe(at + 25);
});
test('confirmation polling stops at the original 30-second boundary', async () => {
 let clock = at + 29990, calls = 0;
 const delays: number[] = [];
 const result = await waitForConfirmedCopy(order.signal_id, at, async () => {
  calls++;
  return { order, executed: false };
 }, () => clock, async delayMs => { delays.push(delayMs); clock += delayMs; });
 expect(result.ok).toBe(false);
 expect(calls).toBe(1);
 expect(delays).toEqual([10]);
 expect(clock).toBe(at + 30000);
});
test('client connection starts before opening; accepted pending order releases copy without WIN or LOSS', async () => {
 let accept: (opened: { ok: boolean }) => void = () => {};
 const opening = new Promise<{ ok: boolean }>(resolve => { accept = resolve; });
 const events: string[] = [];
 const placement = prepareCopyPlacement(opening, async () => { events.push('client-authorized'); return true; }, async gate => {
  events.push('connected');
  if (await gate) events.push('sent');
 });
 expect(events).toEqual(['connected']);
 accept({ ok: true });
 await placement;
 expect(events).toEqual(['connected', 'client-authorized', 'sent']);
});
test('refused opening never reserves or sends a copy', async () => {
 let reservations = 0, sent = false;
 await prepareCopyPlacement(Promise.resolve({ ok: false }), async () => { reservations++; return true; }, async gate => { sent = await gate; });
 expect(reservations).toBe(0);
 expect(sent).toBe(false);
});
test('client disabled after preparation never sends a copy', async () => {
 const sent = await prepareCopyPlacement(Promise.resolve({ ok: true }), async () => false, gate => gate);
 expect(sent).toBe(false);
});test('Nota consistente copy follows the signal direction with its own identity', () => {
 const consistent = prepareTakashiCopy(candidate, at, 'consistent');
 expect(consistent).toMatchObject({ direction: 'call', entryStrategy: 'NOTA_CONSISTENTE', signalId: 'nota-consistente-v1-' + candidate.signal_id });
 expect(prepareTakashiCopy({ ...candidate, direction: 'PUT' }, at, 'consistent')?.direction).toBe('put');
});
