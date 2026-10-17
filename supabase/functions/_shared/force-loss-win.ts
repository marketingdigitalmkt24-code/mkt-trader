export const FORCE_LOSS_WIN_STRATEGY = 'FORCE_LOSS_WIN';
export const FORCE_LOSS_WIN_LABEL = 'Vela de Força LOSS → WIN';

type Outcome = { strategy: string; result: string; minuteMs: number };

// Newest first, across assets. Missing minutes and other strategies break the pair.
export function hasForceLossWin(recent: Outcome[], candidateMinuteMs: number): boolean {
  const [win, loss] = recent;
  return !!win && !!loss && win.strategy === 'VELA_FORCA' && loss.strategy === 'VELA_FORCA'
    && win.result === 'win' && loss.result === 'loss'
    && win.minuteMs === candidateMinuteMs - 60000 && loss.minuteMs === candidateMinuteMs - 120000;
}

export function forceEntryDirection(direction: 'CALL' | 'PUT'): 'CALL' | 'PUT' {
  return direction;
}

export function isNextMinuteStrategy(strategy: string | undefined): boolean {
  return strategy === 'FOUR_WIN_REVERSAL' || strategy === FORCE_LOSS_WIN_STRATEGY;
}