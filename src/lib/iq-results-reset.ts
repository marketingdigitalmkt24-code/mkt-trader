export const IQ_RESULTS_RESET_EVENT = 'iq-results-reset';
const key = (userId: string) => `iq-results-reset:${userId}`;
export function getIQResultsReset(userId?: string) {
  return userId ? localStorage.getItem(key(userId)) || '' : '';
}
export function resetIQResults(userId: string) {
  const cutoff = new Date().toISOString();
  localStorage.setItem(key(userId), cutoff);
  window.dispatchEvent(new Event(IQ_RESULTS_RESET_EVENT));
}
export function afterIQReset(createdAt: string, cutoff: string) {
  if (!cutoff) return true;
  const resetTime = Date.parse(cutoff);
  const entryTime = Date.parse(createdAt);
  if (!Number.isFinite(resetTime)) return true;
  // A reset hides only its Brasília day up to the reset, never prior history.
  const brtOffset = 3 * 60 * 60 * 1000;
  const brtDate = new Date(resetTime - brtOffset);
  const dayStart = Date.UTC(brtDate.getUTCFullYear(), brtDate.getUTCMonth(), brtDate.getUTCDate()) + brtOffset;
  return entryTime < dayStart || entryTime > resetTime;
}
// Combina cortes de reset (por usuário no navegador + corte global do servidor):
// vale o mais recente deles.
export function combineCutoffs(...cutoffs: string[]) {
  return cutoffs.filter(Boolean).sort().pop() ?? '';
}