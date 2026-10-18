export const FORCE_LOSS_WIN_STRATEGY = 'FORCE_LOSS_WIN';
export const FORCE_LOSS_WIN_LABEL = 'Vela de Força LOSS → WIN';

export function forceEntryDirection(direction: 'CALL' | 'PUT'): 'CALL' | 'PUT' {
  return direction;
}

export function isNextMinuteStrategy(strategy: string | undefined): boolean {
  return strategy === 'FOUR_WIN_REVERSAL' || strategy === 'THREE_FORCE';
}