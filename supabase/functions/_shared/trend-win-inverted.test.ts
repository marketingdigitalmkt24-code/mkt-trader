import { test, expect } from 'bun:test';
import { trendWinInverted, TREND_WIN_INVERTED } from './trend-win-inverted';
const at = Date.parse('2026-10-24T03:20:00Z');
const c = {signal_id:'t7-USD/JPY-OTC-TENDENCIA-1792812000',entry_strategy:'TENDENCIA',entry_minute:new Date(at).toISOString(),direction:'CALL',asset:'USD/JPY-OTC'};
const w = {entry_strategy:'TENDENCIA',entry_minute:new Date(at-60000).toISOString(),result:'win',status:'confirmed',iq_option_id:'123456'};
test('confirmed Trend win then next minute Trend CALL opens PUT on the new signal asset',()=>{
 expect(trendWinInverted(c,[w],at+1000)).toEqual({asset:'USD/JPY-OTC',direction:'PUT',entry_strategy:TREND_WIN_INVERTED});
});
test('new Trend PUT is inverted to CALL',()=>{
 expect(trendWinInverted({...c,direction:'PUT'},[w],at)?.direction).toBe('CALL');
});
test('loss, tie, pending and unconfirmed broker outcomes never authorize inversion',()=>{
 for(const invalid of [{result:'loss'},{result:'tie'},{result:'pending'},{status:'unknown'},{iq_option_id:null},{iq_option_id:'test-1'},{entry_strategy:TREND_WIN_INVERTED}])
  expect(trendWinInverted(c,[{...w,...invalid}],at)).toBeNull();
});
test('only immediately consecutive minutes count; no late replay',()=>{
 expect(trendWinInverted(c,[{...w,entry_minute:new Date(at-120000).toISOString()}],at)).toBeNull();
 expect(trendWinInverted(c,[{...w,entry_minute:c.entry_minute}],at)).toBeNull();
 expect(trendWinInverted(c,[w],at+30000)).toBeNull();
 expect(trendWinInverted(c,[w],at-1)).toBeNull();
});
test('next signal must be selected Trend, not another strategy or recursive inversion',()=>{
 expect(trendWinInverted({...c,entry_strategy:'VELA_FORCA'},[w],at)).toBeNull();
 expect(trendWinInverted({...c,entry_strategy:TREND_WIN_INVERTED},[w],at)).toBeNull();
 expect(trendWinInverted(null,[w],at)).toBeNull();
});