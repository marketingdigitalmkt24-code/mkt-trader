import { test, expect } from 'bun:test';
import { demoTargetMinute, demoCandleRequestTime, demoBoundaryDelay } from './demo-timing';
test('scheduled Demo prepares before next :00, immediate checks never move old signals forward',()=>{
 const at=Date.parse('2026-10-24T01:16:00Z');
 expect(demoTargetMinute(at+1000,true)).toBe(at+60000);
 expect(demoTargetMinute(at+1000,false)).toBe(at);
});
test('Demo cannot collect the target closed candle before :00 or after its purchase window',()=>{
 const at=Date.parse('2026-10-24T01:17:00Z');
 expect(demoCandleRequestTime(at-1,at)).toBeNull();
 expect(demoCandleRequestTime(at,at)).toBe(at/1000);
 expect(demoCandleRequestTime(at+29999,at)).toBe(Math.floor((at+29999)/1000));
 expect(demoCandleRequestTime(at+30000,at)).toBeNull();
});
test('prepared availability waits only until :00; current-minute candles request immediately',()=>{
 const at=Date.parse('2026-10-25T20:18:00Z');
 expect(demoBoundaryDelay(at-1500,at)).toBe(1500);
 expect(demoCandleRequestTime(at-1,at)).toBeNull();
 expect(demoBoundaryDelay(at,at)).toBe(0);
 expect(demoBoundaryDelay(at+2500,at)).toBe(0);
 expect(demoCandleRequestTime(at,at)).toBe(at/1000);
});