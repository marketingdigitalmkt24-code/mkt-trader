import { test, expect } from 'bun:test';
import { selectedTrendCopyRequest } from './selected-trend-copy';
const at = Date.parse('2026-10-24T01:21:00Z');
const order = {signal_id:'tendencia-demo-v1-t7-GEV-OTC-TENDENCIA-1792804860',asset:'GEV-OTC',direction:'PUT',
  iq_option_id:'14383507171',entry_strategy:'TENDENCIA',timeframe:'M1',expiration_time:new Date(at+60000).toISOString(),entry_price:10};
test('confirmed additional principal Tendência is copyable in its own minute',()=>{
  expect(selectedTrendCopyRequest(order,at+3000)).toMatchObject({signalId:order.signal_id,entryAt:at,direction:'put',expiration:1});
  expect(selectedTrendCopyRequest({...order,direction:'CALL'},at+3000)?.direction).toBe('call');
});
test('isolated Demo tests and other strategies never authorize client copies',()=>{
  expect(selectedTrendCopyRequest({...order,signal_id:'t7-GEV-OTC-TENDENCIA-1792804860'},at)).toBeNull();
  expect(selectedTrendCopyRequest({...order,timeframe:'TEST'},at)).toBeNull();
  expect(selectedTrendCopyRequest({...order,entry_strategy:'VELA_FORCA'},at)).toBeNull();
  expect(selectedTrendCopyRequest({...order,signal_id:'copy-client-'+order.signal_id},at)).toBeNull();
});
test('missing broker confirmation cannot trigger client copies',()=>{
  expect(selectedTrendCopyRequest({...order,iq_option_id:null},at)).toBeNull();
  expect(selectedTrendCopyRequest({...order,iq_option_id:'test-123'},at)).toBeNull();
  expect(selectedTrendCopyRequest(null,at)).toBeNull();
});
test('historical or expired entries cannot roll into another minute',()=>{
  expect(selectedTrendCopyRequest(order,at+29999)).not.toBeNull();
  expect(selectedTrendCopyRequest(order,at+30000)).toBeNull();
  expect(selectedTrendCopyRequest(order,at+60000)).toBeNull();
  expect(selectedTrendCopyRequest(order,at-1)).toBeNull();
});