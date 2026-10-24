export function demoBalance(balances: { id: number; type: number; currency?: string }[]) {
  return balances.find(b => b.type === 4 && b.currency === 'USD' && Number.isFinite(b.id));
}