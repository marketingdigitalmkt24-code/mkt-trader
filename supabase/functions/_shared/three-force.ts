export const THREE_FORCE_STRATEGY = 'THREE_FORCE';
export const THREE_FORCE_LABEL = 'Após 3 Velas de Força';
type ForceSignal = { strategy: string; minuteMs: number; result?: string };
export function hasThreeForce(recent: ForceSignal[], candidateMinuteMs: number): boolean {
  return recent.length >= 3 && recent.slice(0, 3).every((row, i) =>
    row.strategy === 'VELA_FORCA' && row.minuteMs === candidateMinuteMs - (i + 1) * 60000);
}