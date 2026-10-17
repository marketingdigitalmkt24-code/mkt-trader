export function copyDayStart(now = new Date()): string {
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3)).toISOString();
}

export function copyTargetReached(profit: number, target: number): boolean {
  return Number.isFinite(target) && target > 0 && profit >= target;
}