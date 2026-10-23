import { FORCE_ANTICIPATION } from './force-anticipation-test.ts';
export function isAnticipation(strategy?: string) { return strategy === FORCE_ANTICIPATION; }
export function anticipationLeaseScope(signalId: string) {
  return `master:forca_antecipada:${signalId}`;
}
export function freshAnticipationEntry(entryAt: number, now: number) {
  return Number.isFinite(entryAt) && entryAt % 60000 === 0 && now >= entryAt && now < entryAt + 30000;
}
export function confirmedAnticipationOrder(result: { success?: boolean; tradeId?: string }) {
  return result.success === true && typeof result.tradeId === 'string' && /^[0-9]+$/.test(result.tradeId);
}