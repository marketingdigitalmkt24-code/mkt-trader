export const TREND_SEQUENCE_TEST = 'TREND_WIN_LOSS_FORCE_LOSS';
type Signal = { entry_strategy: string | null; result: string; created_at: string };
export function matchesTrendSequence(recent: Signal[], strategy: string, minuteMs: number): boolean {
  if (strategy !== 'TENDENCIA' || recent.length !== 3) return false;
  return [['VELA_FORCA', 'loss'], ['TENDENCIA', 'loss'], ['TENDENCIA', 'win']].every(([s, r], i) => {
    const row = recent[i];
    return row?.entry_strategy === s && row.result === r && Date.parse(row.created_at) === minuteMs - (i + 1) * 60000;
  });
}