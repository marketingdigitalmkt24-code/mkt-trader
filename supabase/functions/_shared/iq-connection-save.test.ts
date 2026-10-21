import { test, expect } from 'bun:test';
import { saveConfirmedIQConnection } from '../../../src/lib/iq-connection-save';

test('Demo to Real saves account before confirmation so invalidation cannot discard broker confirmation', async () => {
  let stored = { account_type: 'PRACTICE', is_active: true, last_connected_at: 'old' as string | null };
  let copyEnabled = true;
  await saveConfirmedIQConnection(async values => {
    const changed = stored.account_type !== values.account_type;
    stored = { ...values };
    if (changed) stored = { ...stored, is_active: false, last_connected_at: null };
    if (changed || !stored.is_active || !stored.last_connected_at) copyEnabled = false;
  }, 'REAL', '2026-10-21T05:30:00Z');
  expect(stored).toEqual({ account_type: 'REAL', is_active: true, last_connected_at: '2026-10-21T05:30:00Z' });
  expect(copyEnabled).toBe(false);
});

test('failed account save never confirms a connection', async () => {
  let calls = 0;
  await expect(saveConfirmedIQConnection(async () => {
    calls++;
    throw new Error('save failed');
  }, 'REAL', '2026-10-21T05:30:00Z')).rejects.toThrow('save failed');
  expect(calls).toBe(1);
});