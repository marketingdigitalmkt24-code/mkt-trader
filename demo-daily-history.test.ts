import { test, expect } from 'bun:test';
import { demoDailyWindow, demoDailySummaries, demoDailyPages, type DemoDailyRow } from './src/lib/demo-daily-history';
const row = (entry_minute: string, result: string, profit: number): DemoDailyRow => ({ entry_minute, result, profit, account_type: 'PRACTICE', status: 'confirmed', iq_option_id: '12345' });
test('shows two recent BRT days and older days on the next page', () => {
 expect(demoDailyWindow('2026-10-29', 0)).toEqual({ dates: ['2026-10-29','2026-10-28'], from: '2026-10-28T00:00:00-03:00', to: '2026-10-30T00:00:00-03:00' });
 expect(demoDailyWindow('2026-10-29', 1).dates).toEqual(['2026-10-27','2026-10-26']);
 expect(demoDailyPages('2026-10-29','2026-10-24')).toBe(3);
});
test('groups confirmed Demo and Real results by entry day in BRT and ignores failed orders', () => {
 const days = demoDailySummaries([
  row('2026-10-29T02:59:59Z','loss',-2), row('2026-10-29T03:00:00Z','win',1.64),
  row('2026-10-29T04:00:00Z','pending',100), row('2026-10-29T05:00:00Z','tie',0),
  {...row('2026-10-29T05:00:00Z','win',50), account_type:'REAL'},
  {...row('2026-10-29T05:00:00Z','loss',-50), status:'failed'},
 ], ['2026-10-29','2026-10-28']);
 // The account picked in the broker tab may be Demo or Real: both confirmed orders count.
 expect(days[0]).toMatchObject({ wins:2,losses:0,pending:1,ties:1,profit:51.64,grossWins:51.64,grossLosses:0,accuracy:100 });
 expect(days[1]).toMatchObject({ wins:0,losses:1,profit:-2,grossLosses:2,accuracy:0 });
});
test('keeps days without entries visible with zero totals', () => {
 expect(demoDailySummaries([],['2026-10-29','2026-10-28']).map(d => d.profit)).toEqual([0,0]);
});