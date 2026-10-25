// User Oct 25 2026: no principal IQ placements, copies or Telegram sends.
// Isolated Demo testing and broker result reconciliation remain independent.
export const PRINCIPAL_IQ_PAUSED = true;
export function principalIQEnabled(): boolean { return !PRINCIPAL_IQ_PAUSED; }
export function telegramTradingEnabled(): boolean { return !PRINCIPAL_IQ_PAUSED; }