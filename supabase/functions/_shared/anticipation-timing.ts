// Prepare only service-scheduled runs for the next boundary; manual checks stay immediate.
export function anticipationTarget(nowMs: number, scheduled: boolean): number {
  return scheduled ? (Math.floor(nowMs / 60000) + 1) * 60000 : nowMs;
}

export function anticipationRequestReady(nowMs: number, targetMs: number): boolean {
  return nowMs >= targetMs && nowMs - targetMs <= 30000;
}