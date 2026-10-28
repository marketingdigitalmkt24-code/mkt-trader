// Credentials and sessions stay local to the authorized runner, never persisted.
import { demoBalance } from './demo-balance.ts';
export const DEMO_AUTH_URLS = [
  'https://auth.iqoption.com/api/v2/login',
  'https://api.iqoption.com/api/v2/login',
  'https://iqoption.com/api/v2/login',
];
export const DEMO_WS_URLS = ['wss://iqoption.com/echo/websocket', 'wss://ws.iqoption.com/echo/websocket'];

export async function loginDemoHost(
  email: string, password: string, timeoutMs: number, attempt: number,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  // Rotate hosts on retries: a primary timeout must not starve every fallback.
  const host = DEMO_AUTH_URLS[attempt % DEMO_AUTH_URLS.length];
  try {
    const response = await fetcher(host, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      body: new URLSearchParams({ identifier: email, password }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => null);
    if (data?.code === 'success' && typeof data.ssid === 'string' && data.ssid.length) return data.ssid;
    console.warn('Demo login refused:', { status: response.status });
  } catch (error) { console.warn('Demo login error:', error instanceof Error ? error.name : 'unknown'); }
  return null;
}

type BrokerMessage = { name: string; msg?: any; request_id?: string };
export type ReadyDemoSocket = { socket: WebSocket; profile: BrokerMessage; initialization: BrokerMessage };

export function prepareDemoSocket(ssid: string, timeoutMs: number, attempt: number,
  socketFactory: (url: string) => WebSocket = url => new WebSocket(url),
): Promise<ReadyDemoSocket | null> {
  return new Promise(resolve => {
    let socket: WebSocket;
    try { socket = socketFactory(DEMO_WS_URLS[attempt % DEMO_WS_URLS.length]); }
    catch { resolve(null); return; }
    let done = false;
    let profile: BrokerMessage | null = null;
    const finish = (value: ReadyDemoSocket | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.onopen = null; socket.onerror = null; socket.onclose = null; socket.onmessage = null;
      if (!value) { try { socket.close(); } catch {} }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.onopen = () => socket.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
    socket.onmessage = event => {
      let message: BrokerMessage;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.name === 'heartbeat' && socket.readyState === 1) {
        socket.send(JSON.stringify({ name: 'heartbeat', msg: { userTime: Date.now(), heartbeatTime: message.msg } }));
      }
      if (message.name === 'authentication_error') { finish(null); return; }
      if (message.name === 'profile') {
        if (!demoBalance(message.msg?.balances || [])) { finish(null); return; }
        profile = message;
        socket.send(JSON.stringify({ name: 'sendMessage', msg: { name: 'get-initialization-data', version: '3.0', body: {} } }));
      }
      if (message.name === 'initialization-data' && profile) {
        finish({ socket, profile, initialization: message });
      }
    };
  });
}