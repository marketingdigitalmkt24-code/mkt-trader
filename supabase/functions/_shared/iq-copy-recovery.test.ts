import { expect, test } from 'bun:test';
import { withCopyReservation, persistConfirmedCopy } from './iq-copy-recovery';

test('login failure or local exception releases an unsent client attempt', async () => {
  let releases = 0;
  await expect(withCopyReservation(async () => { throw new Error('login'); }, async () => { releases++; })).rejects.toThrow('login');
  expect(releases).toBe(1);
});
test('principal refusal releases the client while preserving enabled copy', async () => {
  let releases = 0;
  await withCopyReservation(async (retain, release) => { retain(); release(); }, async () => { releases++; });
  expect(releases).toBe(1);
});
test('uncertain submitted order cannot release the single-client lock', async () => {
  let releases = 0;
  await withCopyReservation(async retain => { retain(); }, async () => { releases++; });
  expect(releases).toBe(0);
});
test('confirmed copy persistence failure retains the client lock', async () => {
  let releases = 0;
  await expect(withCopyReservation(async retain => { retain(); throw new Error('save'); }, async () => { releases++; })).rejects.toThrow('save');
  expect(releases).toBe(0);
});
function database(failures: number, lostResponse = false) {
  let inserts = 0;
  let stored = false;
  const db = { from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: stored ? [{ id: 'confirmed' }] : [], error: null }) }) }) }),
    insert: async () => {
      inserts++;
      if (lostResponse || inserts > failures) stored = true;
      return { error: inserts <= failures ? new Error('temporary failure') : null };
    },
  }) };
  return { db, count: () => inserts };
}
const row = { signal_id: 'copy-client-signal', iq_option_id: '14372665294', entry_price: 100 };
test('confirmed client order survives a temporary save failure without resubmitting', async () => {
  const d = database(1);
  await persistConfirmedCopy(d.db, row, async () => {});
  expect(d.count()).toBe(2);
});
test('lost insert response reads back exact client signal and broker ID without duplicate insert', async () => {
  const d = database(1, true);
  await persistConfirmedCopy(d.db, row, async () => {});
  expect(d.count()).toBe(1);
});
test('persistent storage failure is bounded at three attempts', async () => {
  const d = database(10);
  await expect(persistConfirmedCopy(d.db, row, async () => {})).rejects.toThrow('reservation retained');
  expect(d.count()).toBe(3);
});