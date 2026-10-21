export const FORCE_LOSS_WIN_STRATEGY = 'FORCE_LOSS_WIN';
export const FORCE_LOSS_WIN_LABEL = 'Vela de Força LOSS → WIN';

export function forceEntryDirection(direction: 'CALL' | 'PUT'): 'CALL' | 'PUT' {
  return direction;
}

// Estratégias reais ativas (21/10/2026): Reversão RSI, Retomada e Recuo na média 21
// (Vela de Força removida das entradas reais/Telegram; segue só em TESTE),
// ancoradas no minuto do candidato. THREE_FORCE/FOUR_WIN_REVERSAL viraram TESTE.
export function isNextMinuteStrategy(strategy: string | undefined): boolean {
  return strategy === 'REVERSAO_RSI' || strategy === 'RETOMADA' || strategy === 'RECUO_EMA21';
}