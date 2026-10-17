export const DEMO_REFILL_AMOUNT = 10000;
export function isPracticeAccount(accountType: string) { return accountType === 'PRACTICE'; }
export function verifiedDemoBalance(balance: { type: number; amount: number } | undefined) {
  return balance?.type === 4 && Number(balance.amount) === DEMO_REFILL_AMOUNT;
}