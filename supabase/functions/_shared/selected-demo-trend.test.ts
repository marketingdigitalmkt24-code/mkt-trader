import { test, expect } from 'bun:test';
import { selectedDemoTrend, notifySelectedTrend } from './selected-demo-trend';
const at = Date.parse('2026-10-24T01:11:00Z');
const c = {signal_id:'t7-GEV-OTC-TENDENCIA-1792804260',entry_strategy:'TENDENCIA',entry_minute:new Date(at).toISOString(),direction:'PUT'};
test('only selected Tendência permits a principal order, both CALL and PUT',()=>{
 expect(selectedDemoTrend(c,at)).toBe(true);
 expect(selectedDemoTrend({...c,direction:'CALL'},at)).toBe(true);
 expect(selectedDemoTrend({...c,entry_strategy:'VELA_FORCA'},at)).toBe(false);
 expect(selectedDemoTrend({...c,entry_strategy:'CONTINUACAO_QUEDA_V1'},at)).toBe(false);
 expect(selectedDemoTrend(null,at)).toBe(false);
});
test('historical Tendência is not replayed or rolled into another minute',()=>{
 expect(selectedDemoTrend(c,at+29999)).toBe(true);
 expect(selectedDemoTrend(c,at+30000)).toBe(false);
 expect(selectedDemoTrend(c,at+60000)).toBe(false);
 expect(selectedDemoTrend(c,at-1)).toBe(false);
});
test('Telegram requires confirmed numeric IQ order and unexpired entry',()=>{
 expect(notifySelectedTrend({success:true,tradeId:'1234'},at,at+5000)).toBe(true);
 expect(notifySelectedTrend({success:false,tradeId:'1234'},at,at+5000)).toBe(false);
 expect(notifySelectedTrend({success:true},at,at+5000)).toBe(false);
 expect(notifySelectedTrend({success:true,tradeId:'1234'},at,at+60000)).toBe(false);
});