import { DEMO_LOGIN_ATTEMPT_MS, DEMO_LOGIN_MARGIN_MS } from './demo-login-retry.ts';

export type DemoBrokerAuth =
  | { mode: 'ssid'; ssid: string }
  | { mode: 'credentials'; email: string; password: string };

// Invocation-local only: never persist, log, return to callers or share credentials.
// One HTTP attempt leaves time for the independent WebSocket authentication path.
export async function prepareDemoAuthentication(
  credentials: { email: string; password: string },
  login: (timeoutMs: number) => Promise<string | null>,
  target: number,
  now: () => number = Date.now,
): Promise<DemoBrokerAuth | null> {
  const remaining = target - DEMO_LOGIN_MARGIN_MS - now();
  if (remaining < 1000) return null;
  const ssid = await login(Math.min(DEMO_LOGIN_ATTEMPT_MS, remaining)).catch(() => null);
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