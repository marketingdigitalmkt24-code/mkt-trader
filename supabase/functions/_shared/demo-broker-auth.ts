import { DEMO_LOGIN_ATTEMPT_MS, DEMO_LOGIN_MARGIN_MS } from './demo-login-retry.ts';

export type DemoBrokerAuth =
  | { mode: 'ssid'; ssid: string }
  | { mode: 'credentials'; email: string; password: string };

// Invocation-local only: never persist, log, return to callers or share credentials.
// The broker refuses direct WebSocket credential auth, so keep retrying HTTP login
// (alternating hosts) and fall back to credentials only when time for the socket runs out.
export const DEMO_SOCKET_RESERVE_MS = 12000;
export async function prepareDemoAuthentication(
  credentials: { email: string; password: string },
  login: (timeoutMs: number, attemptNumber: number) => Promise<string | null>,
  target: number,
  now: () => number = Date.now,
): Promise<DemoBrokerAuth | null> {
  if (target - DEMO_LOGIN_MARGIN_MS - now() < 1000) return null;
  let attempt = 0;
  let ssid: string | null = null;
  while (!ssid) {
    const budget = target - DEMO_LOGIN_MARGIN_MS - DEMO_SOCKET_RESERVE_MS - now();
    if (budget < 1000 && attempt > 0) break;
    attempt++;
    ssid = await login(Math.max(1000, Math.min(DEMO_LOGIN_ATTEMPT_MS, budget)), attempt).catch(() => null);
  }
  if (target - DEMO_LOGIN_MARGIN_MS - now() < 1000) return null;
  return ssid
    ? { mode: 'ssid', ssid }
    : { mode: 'credentials', email: credentials.email, password: credentials.password };
}

export function demoSocketAuthMessage(auth: DemoBrokerAuth) {
  return auth.mode === 'ssid'
    ? { name: 'ssid', msg: auth.ssid }
    : { name: 'authenticate', msg: { email: auth.email, password: auth.password } };
}

export function demoSocketAuthenticationRejected(message: { name?: string; msg?: unknown }): boolean {
  return message.name === 'authentication_error'
    || (message.name === 'authenticated' && message.msg === false);
}

// After both direct endpoints fail, try the independent HTTP host again.
export function demoHttpRefreshBudget(attempt: number, target: number, now: number): number {
  const remaining = target - DEMO_LOGIN_MARGIN_MS - now;
  return attempt > 1 && attempt % 2 === 0 && remaining >= 10000
    ? Math.min(5000, remaining - 8000)
    : 0;
}