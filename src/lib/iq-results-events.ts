export function shouldRefreshClientIQResults(
  event: { eventType: string; new?: { signal_id?: string }; old?: { signal_id?: string } },
  userId: string,
) {
  // DELETE payloads may contain only the primary key under default replica identity.
  if (event.eventType === 'DELETE') return true;
  return event.new?.signal_id?.startsWith(`copy-${userId}-`) ?? false;
}