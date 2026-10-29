// Últimas operações use the account chosen in the admin broker tab (PRACTICE=type 4, REAL=type 1).
export function demoBalance(balances: { id: number; type: number; currency?: string }[], account: 'PRACTICE' | 'REAL' = 'PRACTICE') {
  const type = account === 'REAL' ? 1 : 4;
  return balances.find(b => b.type === type && b.currency === 'USD' && Number.isFinite(b.id));
}
