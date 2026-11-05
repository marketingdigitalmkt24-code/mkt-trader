import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function feed() {
  let handler: (request: Request) => Promise<Response> = async () => new Response(null, { status: 500 });
  const tables: string[] = [];
  const row = {
    asset: 'AUD/NZD-OTC', direction: 'PUT', entry_strategy: 'ICHIMOKU',
    amount: 2, result: 'win', profit: 1.6, entry_minute: '2026-11-05T21:00:00Z',
    expiration_time: '2026-11-05T21:01:00Z', score: 3.75,
  };
  const client = { from(table: string) {
    tables.push(table);
    const query = {
      select: () => query, eq: () => query, in: () => query, gt: () => query,
      lt: () => query, not: () => query, order: () => query,
      limit: async () => ({ data: [row], error: null }),
    };
    return query;
  } };
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\n/m, '');
  const compiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  new Function('Deno', 'createClient', compiled)({
    env: { get: (name: string) => name === 'DEMO_FEED_SECRET' ? 'test-only-key' : 'test-config' },
    serve: (fn: typeof handler) => { handler = fn; },
  }, () => client);
  return { request: (params = '', key = 'test-only-key') => handler(new Request(
    `https://example.test/feed${params}`, { headers: { 'x-feed-key': key } },
  )), tables };
}

test('closed Demo feed omits notes and preserves operation data and pagination', async () => {
  const app = feed();
  const response = await app.request('?limit=1');
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.operations).toEqual([{
    asset: 'AUD/NZD-OTC', direction: 'PUT', strategy: 'ICHIMOKU', amount: 2,
    result: 'WIN', profit: 1.6, entry_time: '2026-11-05T21:00:00.000Z',
  }]);
  expect(body.next_before).toBe('2026-11-05T21:00:00.000Z');
  expect(body.has_more).toBe(true);
  expect(body).not.toHaveProperty('open_operations');
  expect(app.tables).toEqual(['iq_demo_test_orders']);
});

test('include_open omits notes from open Demo operations and preserves expiry', async () => {
  const app = feed();
  const body = await (await app.request('?include_open=true')).json();
  expect(body.open_operations).toEqual([{
    asset: 'AUD/NZD-OTC', direction: 'PUT', strategy: 'ICHIMOKU', amount: 2,
    entry_time: '2026-11-05T21:00:00.000Z', expires_at: '2026-11-05T21:01:00.000Z',
  }]);
  expect(app.tables).toEqual(['iq_demo_test_orders', 'iq_demo_test_orders']);
});

test('feed still rejects an incorrect secret before querying orders', async () => {
  const app = feed();
  expect((await app.request('', 'wrong-key')).status).toBe(401);
  expect(app.tables).toEqual([]);
});