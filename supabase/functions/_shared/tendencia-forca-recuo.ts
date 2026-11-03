// Combined Demo strategy (user, Nov 3 2026): Tendência, Vela de força and Recuo na média 21
// must all fire on the same closed candle in the same direction. Returns that direction, or null.
export const TENDENCIA_FORCA_RECUO_STRATEGY = 'TENDENCIA_FORCA_RECUO';
const PARTS = ['TENDENCIA', 'VELA_FORCA', 'RECUO_EMA21'] as const;

export function tendenciaForcaRecuoDirection(fired: [string, 'CALL' | 'PUT'][]): 'CALL' | 'PUT' | null {
  const dirs = PARTS.map(p => fired.find(([s]) => s === p)?.[1]);
  const first = dirs[0];
  return first && dirs.every(d => d === first) ? first : null;
}
