import { DEMO_LOGIN_MARGIN_MS } from './demo-login-retry.ts';

// Retry only preparation. Never retry an order or roll a stale minute forward.
export async function prepareDemoConnection(
  prepare: (endpoint: string, handshakeMs: number) => Promise<boolean>,
  target: number,
  now: () => number = Date.now,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<boolean> {
  const endpoints = ['wss://iqoption.com/echo/websocket', 'wss://ws.iqoption.com/echo/websocket'];
  let attempts = 0;
  while (target - DEMO_LOGIN_MARGIN_MS - now() >= 1000) {
    const budget = Math.min(8000, target - DEMO_LOGIN_MARGIN_MS - now());
    if (await prepare(endpoints[attempts++ % endpoints.length], budget)) return true;
    if (target - DEMO_LOGIN_MARGIN_MS - now() <= 1500) break;
    await wait(1000);
  }
  return false;
}