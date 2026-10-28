import { describe, expect, test } from 'bun:test';
import { prepareDemoConnection } from './demo-connection-retry';

describe('Demo socket preparation recovery', () => {
  test('reconnects on the alternate endpoint after a failed handshake', async () => {
    let time = 0;
    const urls: string[] = [];
    const result = await prepareDemoConnection(async (url, budget) => {
      urls.push(url); time += budget; return urls.length === 2;
    }, 60000, () => time, async ms => { time += ms; });
    expect(result).toBe(true);
    expect(urls).toEqual(['wss://iqoption.com/echo/websocket', 'wss://ws.iqoption.com/echo/websocket']);
  });
  test('stops three seconds before the original minute on repeated failures', async () => {
    let time = 0; let calls = 0;
    expect(await prepareDemoConnection(async (_, budget) => { calls++; time += budget; return false; },
      60000, () => time, async ms => { time += ms; })).toBe(false);
    expect(calls).toBeGreaterThan(1);
    expect(time).toBeLessThanOrEqual(57000);
  });
  test('does not open a socket when the preparation deadline has passed', async () => {
    let calls = 0;
    expect(await prepareDemoConnection(async () => { calls++; return true; }, 60000, () => 58000)).toBe(false);
    expect(calls).toBe(0);
  });
  test('does not replay a successful preparation after the candles arrive at :00', async () => {
    let time = 0; let calls = 0;
    expect(await prepareDemoConnection(async () => { calls++; time = 60500; return true; },
      60000, () => time)).toBe(true);
    expect(calls).toBe(1);
  });
});