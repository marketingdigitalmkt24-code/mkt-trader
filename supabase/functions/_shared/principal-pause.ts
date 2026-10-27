// User paused every principal strategy, copy and trading notification (Oct 27 2026).
// Demo execution and broker result reconciliation remain independent.
export const PRINCIPAL_IQ_PAUSED = true;
export function principalIQEnabled(_strategy?: string): boolean { return false; }
export function telegramTradingEnabled(_strategy?: string): boolean { return false; }