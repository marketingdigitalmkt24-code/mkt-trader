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
  return !cutoff || createdAt > cutoff;
}