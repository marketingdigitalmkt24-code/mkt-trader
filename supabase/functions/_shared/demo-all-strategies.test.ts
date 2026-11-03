import { expect, test } from 'bun:test';
import { demoCohort, DEMO_ENTRY_STRATEGIES } from './demo-226-policy.ts';
import { freshDemoCandidate } from './demo-test-policy.ts';

const added = ['TENDENCIA', 'VELA_FORCA', 'ROMPIMENTO', 'REVERSAO_RSI', 'KDJ'];

test('every detected strategy enters the Demo competition and shared gale', () => {
  for (const s of added) {
    expect(demoCohort(1.5, s)).toBe('indicator');
    expect(DEMO_ENTRY_STRATEGIES).toContain(s);
  }
});

test('standalone Demo candidates are fresh only with their own signal prefix', () => {
  const at = '2026-11-03T03:40:00.000Z', now = Date.parse(at) + 5000;
  for (const s of added) {
    const ok = { signal_id: `demo-${s.toLowerCase()}-v1-EURUSD-1`, timeframe: 'TEST', created_at: at, direction: 'CALL', entry_strategy: s };
    expect(freshDemoCandidate(ok, now)).toBe(true);
    expect(freshDemoCandidate({ ...ok, signal_id: 'demo-ichimoku-v1-EURUSD-1' }, now)).toBe(false);
  }
});
