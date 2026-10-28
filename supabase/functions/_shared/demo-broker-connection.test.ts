import { describe, expect, test } from 'bun:test';
import { DEMO_AUTH_URLS, DEMO_WS_URLS, loginDemoHost, prepareDemoSocket } from './demo-broker-connection';

describe('Demo connection fallbacks', () => {
  test('a failed primary host rotates to both fallback hosts before repeating', async () => {
    const hosts: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      hosts.push(String(url));
      return new Response(JSON.stringify({ code: 'failure' }));
    }) as typeof fetch;
    for (let index = 0; index < 4; index++) await loginDemoHost('fixture', 'fixture', 1000, index, fetcher);
    expect(hosts).toEqual([...DEMO_AUTH_URLS, DEMO_AUTH_URLS[0]]);
  });

  test('only a successful broker response supplies a session', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ code: 'success', ssid: 'fixture-session' }))) as typeof fetch;
    expect(await loginDemoHost('fixture', 'fixture', 1000, 0, fetcher)).toBe('fixture-session');
  });

  function fakeSocket() {
    const sent: any[] = [];
    const socket = {
      readyState: 1,
      onopen: null as any, onerror: null as any, onclose: null as any, onmessage: null as any,
      send: (value: string) => sent.push(JSON.parse(value)),
      close: () => { socket.readyState = 3; },
    };
    const emit = (name: string, msg: any) => socket.onmessage?.({ data: JSON.stringify({ name, msg }) });
    return { socket, sent, emit };
  }

  test('fallback socket becomes ready only after Demo profile and initialization', async () => {
    const fake = fakeSocket(); let host = '';
    const ready = prepareDemoSocket('fixture-session', 1000, 1, url => { host = url; return fake.socket as unknown as WebSocket; });
    fake.socket.onopen();
    fake.emit('profile', { balances: [{ id: 7, type: 4, currency: 'USD' }] });
    expect(fake.sent[1].msg.name).toBe('get-initialization-data');
    fake.emit('initialization-data', { turbo: { actives: {} } });
    const result = await ready;
    expect(host).toBe(DEMO_WS_URLS[1]);
    expect(result?.socket).toBe(fake.socket);
    expect(fake.socket.readyState).toBe(1);
  });

  test('a REAL-only profile is closed and never becomes a Demo fallback', async () => {
    const fake = fakeSocket();
    const ready = prepareDemoSocket('fixture-session', 1000, 0, () => fake.socket as unknown as WebSocket);
    fake.emit('profile', { balances: [{ id: 8, type: 1, currency: 'USD' }] });
    expect(await ready).toBeNull();
    expect(fake.socket.readyState).toBe(3);
  });

  test('a closed socket resolves immediately so another preparation attempt can run', async () => {
    const fake = fakeSocket();
    const ready = prepareDemoSocket('fixture-session', 1000, 0, () => fake.socket as unknown as WebSocket);
    fake.socket.onclose();
    expect(await ready).toBeNull();
    expect(fake.socket.readyState).toBe(3);
  });
});