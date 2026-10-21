// History reconciliation reads both wallets of the same authenticated owner.
// This never selects a wallet for placement or changes the configured account.
export function historyBalanceIds(balances: { id: number; type: number }[]): number[] {
  return [...new Set(balances.filter(b => (b.type === 1 || b.type === 4) && Number.isFinite(b.id) && b.id > 0).map(b => b.id))];
}