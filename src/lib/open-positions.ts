export interface OpenPosition {
  id: string;
  type: string;
  asset: string;
  direction: string;
  invest: number;
  pnl: number;
}

/**
 * Corretora (com lucro ao vivo) tem prioridade; ordens registradas pelo app cobrem
 * o intervalo entre consultas. A mesma ordem nunca aparece duas vezes: o id da
 * corretora é o vínculo exato.
 */
export function mergeOpenPositions(broker: OpenPosition[], recorded: OpenPosition[]): OpenPosition[] {
  return [...broker, ...recorded.filter(r => !broker.some(b => b.id === r.id))];
}
