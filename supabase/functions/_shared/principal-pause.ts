// Principal IQ entries follow the admin's Auto Trading switch (Oct 29 2026):
// enabled only when the caller confirms masterAutoTradingEnabled. Copies and
// Telegram trading notifications stay paused by user request.
// Demo execution and broker result reconciliation remain independent.
export function principalIQEnabled(_strategy?: string, autoTradingOn = false): boolean {
  return autoTradingOn === true;
}
export function telegramTradingEnabled(_strategy?: string): boolean { return false; }
