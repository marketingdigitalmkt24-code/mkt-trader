import {test,expect} from 'bun:test';
import {demoEntryReason,verifyDemoWinningPattern} from './demo-entry-authorization.ts';
import {isSuperSelected} from './demo-validated.ts';

const match={signal_id:'confirmed-win',asset:'AUD/CAD-OTC',entry_minute:'2026-10-24T23:00:00Z',score:2.81,distance:0.1};
test('MAGNIFICENT7-style 3.24 winning pattern authorizes Demo without an exact score, not principal',()=>{
  expect(demoEntryReason(3.24,new Set([2.26032894533026]),match,0)).toBeNull();
  expect(demoEntryReason(3.24,new Set([2.26032894533026]),null,0)?.code).toBe('outside_confirmed_win_scores');
  expect(isSuperSelected(3.24)).toBe(false);
});
test('exact complete WIN scores remain an independent authorization',()=>{
  expect(demoEntryReason(2.26032894533026,new Set([2.26032894533026]),null,-1)).toBeNull();
  expect(demoEntryReason(2.266,new Set([2.26032894533026]),null,0)).not.toBeNull();
});
test('pattern path preserves score floor 2.0 and learned blocking at -0.8',()=>{
  expect(demoEntryReason(1.99,new Set(),match,0)?.code).toBe('score_floor');
  expect(demoEntryReason(2,new Set(),match,0)).toBeNull();
  expect(demoEntryReason(3.24,new Set(),match,-0.8)?.code).toBe('learned_history');
  expect(demoEntryReason(3.24,new Set(),match,-0.79)).toBeNull();
});
const minute='2026-10-25T01:31:00Z',refMinute='2026-10-25T01:20:00Z';
const candles=(time:string)=>Array.from({length:20},(_,i)=>({t:Date.parse(time)/1000-(20-i)*60,o:100+i,c:100.8+i,h:101+i,l:99.9+i}));
const reference={signal_id:'confirmed-win',entry_minute:refMinute,direction:'CALL',candles:candles(refMinute),score:2.81};
const candidate={signal_id:'new-demo',entry_minute:minute,direction:'CALL',score:3.24,candles:candles(minute),pattern_match:{...match,learned:0}};
const win={signal_id:reference.signal_id,status:'confirmed',account_type:'PRACTICE',iq_option_id:'14387331380',result:'win'};
test('placement recomputes a real WIN correspondence without exact score evidence',async()=>{
  expect(await verifyDemoWinningPattern(candidate,async()=>reference,async()=>[win])).toBe(true);
});
test('stored pattern claims cannot bypass missing, LOSS, non-Demo or unconfirmed references',async()=>{
  expect(await verifyDemoWinningPattern(candidate,async()=>null,async()=>[win])).toBe(false);
  for(const row of [{...win,result:'loss'},{...win,account_type:'REAL'},{...win,status:'reserved'},{...win,signal_id:'other'}])
    expect(await verifyDemoWinningPattern(candidate,async()=>reference,async()=>[row])).toBe(false);
});
test('future references, absent learning evidence and fabricated candles do not authorize',async()=>{
  expect(await verifyDemoWinningPattern(candidate,async()=>({...reference,entry_minute:minute}),async()=>[win])).toBe(false);
  expect(await verifyDemoWinningPattern({...candidate,pattern_match:match},async()=>reference,async()=>[win])).toBe(false);
  expect(await verifyDemoWinningPattern({...candidate,candles:[]},async()=>reference,async()=>[win])).toBe(false);
  expect(await verifyDemoWinningPattern({...candidate,direction:'PUT'},async()=>reference,async()=>[win])).toBe(false);
});
test('all displayed 2.26 Demo candidates qualify without history or pattern veto, principal stays exact',()=>{
 for(const score of [2.26,2.259,2.26032894533026,2.2649]){
  expect(demoEntryReason(score,new Set(),null,-1)).toBeNull();
  expect(isSuperSelected(score)).toBe(score===2.26);
 }
 for(const score of [2.2549,2.265,NaN,Infinity])expect(demoEntryReason(score,new Set(),null,-1)).not.toBeNull();
});
