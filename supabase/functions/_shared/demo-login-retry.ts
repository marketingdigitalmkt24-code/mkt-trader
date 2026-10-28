// Keep retrying the broker login during preparation until shortly before :00.
// A single slow/failed login must not leave the next minute without a socket,
// because that socket is also what reads expired Demo results right after closing.
export const DEMO_LOGIN_ATTEMPT_MS = 10000;
export const DEMO_LOGIN_MARGIN_MS = 3000;

export async function prepareBeforeBoundary<T>(
  attempt: (timeoutMs: number, attemptIndex: number) => Promise<T | null>,
  target: number,
  now: () => number = Date.now,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T | null> {
  const deadline = target - DEMO_LOGIN_MARGIN_MS;
  let tries = 0;
  while (true) {
    const left = deadline - now();
    if (left < 1000) return null;
    const result = await attempt(Math.min(DEMO_LOGIN_ATTEMPT_MS, left), tries++);
    if (result && now() <= deadline) return result;
    if (deadline - now() <= 1500) return null;
    await wait(1000);
  }
}

export const loginBeforeBoundary = prepareBeforeBoundary<string>;
