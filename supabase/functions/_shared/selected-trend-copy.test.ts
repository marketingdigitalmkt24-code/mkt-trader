import { test, expect } from 'bun:test';
import { selectedTrendCopyRequest } from './selected-trend-copy';
const at = Date.parse('2026-10-24T01:21:00Z');
const order = {signal_id:'tendencia-demo-v1-t7-GEV-OTC-TENDENCIA-1792804860',asset:'GEV-OTC',direction:'PUT',
  iq_option_id:'14383507171',entry_strategy:'TENDENCIA',timeframe:'M1',expiration_time:new Date(at+60000).toISOString(),entry_price:10};
test('confirmed additional principal Tendência is copyable in its own minute',()=>{
  expect(selectedTrendCopyRequest(order,at+3000)).toMatchObject({signalId:order.signal_id,entryAt:at,direction:'put',expiration:1});
  expect(selectedTrendCopyRequest({...order,direction:'CALL'},at+3000)?.direction).toBe('call');
});
test('all visible confirmed principal strategies authorize client copies',()=>{
  for (const strategy of ['TENDENCIA','TENDENCIA_WIN_INVERTIDA','TENDENCIA_3_LOSS_PUT','FORCA_ANTECIPADA','REVERSAO_RSI','RETOMADA','VELA_FORCA']) {
    expect(selectedTrendCopyRequest({...order,signal_id:`principal-${strategy}`,entry_strategy:strategy},at+3000)?.entryStrategy).toBe(strategy);
  }
  expect(selectedTrendCopyRequest({...order,entry_strategy:null},at+3000)).not.toBeNull();
});
test('inverted Trend copy keeps authorized inverted direction and original expiry',()=>{
 expect(selectedTrendCopyRequest({...order,signal_id:'tendencia_win_invertida-v1-'+order.signal_id,entry_strategy:'TENDENCIA_WIN_INVERTIDA',direction:'CALL'},at+3000))
  .toMatchObject({direction:'call',entryAt:at,expiration:1,entryStrategy:'TENDENCIA_WIN_INVERTIDA'});
});
test('isolated tests, copies and retired orders never authorize client copies',()=>{
  expect(selectedTrendCopyRequest({...order,timeframe:'TEST'},at)).toBeNull();
  expect(selectedTrendCopyRequest({...order,timeframe:'MT5'},at)).toBeNull();
  expect(selectedTrendCopyRequest({...order,entry_strategy:'FORCA_INVERTIDA'},at)).toBeNull();
  expect(selectedTrendCopyRequest({...order,entry_strategy:'FORCE_LOSS_WIN'},at)).toBeNull();
  expect(selectedTrendCopyRequest({...order,signal_id:'copy-client-'+order.signal_id},at)).toBeNull();
});
test('M5 principal copies retain original expiry and duration',()=>{
  expect(selectedTrendCopyRequest({...order,timeframe:'M5',expiration_time:new Date(at+300000).toISOString()},at+3000))
    .toMatchObject({entryAt:at,expiration:5,timeframe:'M5'});
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