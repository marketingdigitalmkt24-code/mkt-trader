import { expect, test } from 'bun:test';
import { expectedProfitPerUnit, pickRotationStrategy, selectDemoByExpectedProfit, strategyWinRate } from './demo-profit-selection';

const c = (signal_id: string, entry_strategy: string, _score: number, _payout: number | null) =>
  ({ signal_id, entry_strategy, _score, _payout, asset: 'X', direction: 'CALL', created_at: '2026-11-02T00:40:00Z' });
const h = (entry_strategy: string, wins: number, losses: number) => [
  ...Array.from({ length: wins }, () => ({ entry_strategy, result: 'win' })),
  ...Array.from({ length: losses }, () => ({ entry_strategy, result: 'loss' })),
];

test('win rate uses only own WIN/LOSS with one virtual win and loss', () => {
  expect(strategyWinRate([...h('ICHIMOKU', 3, 1), { entry_strategy: 'ICHIMOKU', result: 'tie' }], 'ICHIMOKU')).toBeCloseTo(4 / 6);
  expect(strategyWinRate([], 'RECUO_EMA21')).toBe(0.5);
});

test('expected profit per US$1 = p*payout - (1-p); unknown payout is -1', () => {
  expect(expectedProfitPerUnit(0.6, 0.85)).toBeCloseTo(0.11);
  expect(expectedProfitPerUnit(0.6, null)).toBe(-1);
});

test('highest note does not win: the strategy whose turn it is enters', () => {
  const history = [...h('TAKASHI_BNF_V1', 1, 4), ...h('RECUO_EMA21', 6, 2)];
  const pick = selectDemoByExpectedProfit([c('t', 'TAKASHI_BNF_V1', 9, 0.9), c('r', 'RECUO_EMA21', 0.5, 0.85)], history);
  // Takashi already had 5 of the last turns with a weak result; Recuo deserves more turns.
  expect(pick?.signal_id).toBe('r');
});

test('rotation: a strategy that keeps losing the slot gets its turn back', () => {
  // Last 30 settled entries were all Recuo (good record); Ichimoku had none recently.
  const history = [...h('RECUO_EMA21', 17, 13), ...h('ICHIMOKU', 2, 3)];
  expect(pickRotationStrategy(['RECUO_EMA21', 'ICHIMOKU'], history)).toBe('ICHIMOKU');
});

test('rotation: the strategy with the better result gets more turns', () => {
  // Simulate 40 minutes where both always have a candidate; winner record fixed by weight.
  const good = 'RECUO_EMA21', bad = 'ICHIMOKU';
  const base = [...h(good, 16, 4), ...h(bad, 4, 16)]; // weights ~0.77 vs ~0.23 (own last 20)
  const turns: string[] = [];
  for (let i = 0; i < 40; i++) {
    const settled = turns.slice().reverse().map(s => ({ entry_strategy: s, result: s === good ? 'win' : 'loss' }));
    turns.push(pickRotationStrategy([good, bad], [...settled, ...base])!);
  }
  const goodTurns = turns.filter(s => s === good).length, badTurns = turns.length - goodTurns;
  expect(badTurns).toBeGreaterThan(0);
  expect(goodTurns).toBeGreaterThan(badTurns);
});

test('rotation: a losing streak never removes a strategy (minimum weight 0.2)', () => {
  const history = [...h('ICHIMOKU', 0, 20), ...h('RECUO_EMA21', 10, 0)];
  // Recuo had 10 of the last 30; Ichimoku 20 losses. Then 30 more Recuo turns push Ichimoku back in.
  const moreRecuo = h('RECUO_EMA21', 30, 0);
  expect(pickRotationStrategy(['ICHIMOKU', 'RECUO_EMA21'], [...moreRecuo, ...history])).toBe('ICHIMOKU');
});

test('same strategy record: the higher payout asset wins', () => {
  const pick = selectDemoByExpectedProfit([c('a', 'ICHIMOKU', 3, 0.7), c('b', 'ICHIMOKU', 1, 0.9)], h('ICHIMOKU', 2, 1));
  expect(pick?.signal_id).toBe('b');
});

test('ineligible strategies are never selected', () => {
  expect(selectDemoByExpectedProfit([c('v', 'VELA_FORCA', 5, 0.9)], [])).toBeNull();
});

test('Ichimoku + Recuo 21 takes the slot whenever it has a candidate, even with worse record', () => {
  const history = [...h('ICHIMOKU_RECUO21', 0, 3), ...h('RECUO_EMA21', 9, 1)];
  const pick = selectDemoByExpectedProfit([c('r', 'RECUO_EMA21', 3, 0.92), c('k', 'ICHIMOKU_RECUO21', 1, 0.8)], history);
  expect(pick?.signal_id).toBe('k');
});

test('without a combined candidate, the strategy with fewer recent turns enters', () => {
  const pick = selectDemoByExpectedProfit([c('t', 'TAKASHI_BNF_V1', 3, 0.9), c('i', 'ICHIMOKU', 1, 0.9)], [...h('ICHIMOKU', 5, 1)]);
  expect(pick?.signal_id).toBe('t');
});
