import { FORCE_INVERTED_TEST, invertedTestOutcome } from '../../supabase/functions/_shared/force-inverted-test';

interface TestDisplayRow {
  id: string;
  timeframe: string;
  entry_strategy?: string;
  test_inverted_strategy?: string | null;
  test_sequence_strategy?: string | null;
  direction: string;
  result: string;
  profit: number;
}

// Display-only projection: never create a second stored signal or authorize an order.
export function expandTestObservations<T extends TestDisplayRow>(trade: T): T[] {
  if (trade.timeframe !== 'TEST' || trade.entry_strategy !== 'VELA_FORCA'
    || trade.test_inverted_strategy !== FORCE_INVERTED_TEST) return [trade];
  const inverted = invertedTestOutcome(trade.direction, trade.result);
  if (!inverted) return [trade];
  return [trade, {
    ...trade,
    id: `${trade.id}:force-inverted`,
    entry_strategy: FORCE_INVERTED_TEST,
    test_inverted_strategy: null,
    test_sequence_strategy: null,
    direction: inverted.direction,
    result: inverted.result,
    profit: inverted.profit,
  }];
}