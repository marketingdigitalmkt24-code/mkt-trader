// Service-only reuse of the master broker session across minute runs. The broker throttles
// repeated HTTP logins for one account (logins hang for minutes), so a valid session is reused
// until the socket refuses it. Never log, return to clients or expose the session.
export const BROKER_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type Db = { from: (table: string) => any };

export function usableCachedSession(row: { ssid?: unknown; obtained_at?: unknown } | null | undefined, nowMs: number): string | null {
  if (!row || typeof row.ssid !== 'string' || row.ssid.length < 8) return null;
  const at = Date.parse(String(row.obtained_at));
  if (!Number.isFinite(at) || at > nowMs + 60000 || nowMs - at > BROKER_SESSION_MAX_AGE_MS) return null;
  return row.ssid;
}

export async function readBrokerSession(db: Db, configId: string): Promise<string | null> {
  try {
    const { data } = await db.from('iq_broker_sessions').select('ssid,obtained_at').eq('config_id', configId).maybeSingle();
    return usableCachedSession(data, Date.now());
  } catch { return null; }
}

export async function saveBrokerSession(db: Db, configId: string, ssid: string): Promise<void> {
  try {
    await db.from('iq_broker_sessions').upsert({ config_id: configId, ssid, obtained_at: new Date().toISOString() });
  } catch { /* cache is best effort */ }
}

// Only clears the exact refused session, so a newer one saved by another run survives.
export async function clearBrokerSession(db: Db, configId: string, ssid: string): Promise<void> {
  try { await db.from('iq_broker_sessions').delete().eq('config_id', configId).eq('ssid', ssid); } catch { /* best effort */ }
}
