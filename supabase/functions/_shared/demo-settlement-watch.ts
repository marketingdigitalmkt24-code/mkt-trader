export const DEMO_SETTLEMENT_RETRY_MS = [1000, 3000, 6000, 10000, 15000] as const;
// Re-read after the minute boundary: the preflight snapshot can miss a just-confirmed order.
// Never place orders or derive outcomes here; only request fresh exact-ID broker history.
export async function watchDemoSettlements(target: number, refreshAndRequest: () => Promise<boolean>,
  now: () => number = Date.now,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve,ms)),
) {
  let checks=0;
  for(const offset of DEMO_SETTLEMENT_RETRY_MS) {
    await wait(Math.max(0,target+offset-now()));
    if(now()>target+20000)break;
    checks++;
    if(!await refreshAndRequest())break;
  }
  return checks;
}