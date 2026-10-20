// Cleanup never releases a newer signal or an order with an uncertain outcome.
export async function withCopyReservation<T>(
  run: (retain: () => void, release: () => void) => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  let safeToRelease = true;
  try {
    return await run(() => { safeToRelease = false; }, () => { safeToRelease = true; });
  } finally {
    if (safeToRelease) await cleanup();
  }
}

export async function persistConfirmedCopy(
  db: any,
  row: { signal_id: string; iq_option_id: string; [key: string]: unknown },
  pause: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Exact ID read-back covers an insert accepted despite a lost response.
    const existing = await db.from('operation_results').select('id')
      .eq('signal_id', row.signal_id).eq('iq_option_id', row.iq_option_id).limit(1);
    if (existing.error) {
      if (attempt === 2) throw new Error('Copy persistence read failed');
    } else {
      if (existing.data?.length) return;
      const saved = await db.from('operation_results').insert(row);
      if (!saved.error) return;
    }
    if (attempt < 2) await pause(200 * (attempt + 1));
  }
  throw new Error('Confirmed copy could not be persisted; reservation retained');
}