import {test,expect} from 'bun:test';
import {DEMO_MID_CANDLE,midCandleSignal,midCandleTime,freshMidCandle,midCandleExpiry} from './demo-mid-candle.ts';
const minute='2026-10-25T01:50:00Z',at=Date.parse(minute)+30000;
const row={signal_id:midCandleSignal('t7-X-1'),entry_strategy:DEMO_MID_CANDLE,direction:'CALL',created_at:new Date(at).toISOString()};
test('separate Demo targets :30 and expires at same candle close',()=>{
 expect(midCandleTime(minute)).toBe(at);expect(midCandleExpiry(row.created_at)).toBe(Date.parse('2026-10-25T01:51:00Z')/1000);
 expect(freshMidCandle(row,at)).toBe(true);expect(freshMidCandle(row,at+2000)).toBe(true);
 expect(freshMidCandle(row,at-1)).toBe(false);expect(freshMidCandle(row,at+2001)).toBe(false);
});
test('normal signals, wrong strategy and stale candidates never replay mid entry',()=>{
 expect(freshMidCandle({...row,signal_id:'t7-X'},at)).toBe(false);expect(freshMidCandle({...row,entry_strategy:'TENDENCIA'},at)).toBe(false);
 expect(freshMidCandle(row,at+60000)).toBe(false);expect(freshMidCandle({...row,created_at:minute},at)).toBe(false);
});
