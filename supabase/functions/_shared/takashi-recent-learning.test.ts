import { expect, test } from 'bun:test';
import { takashiRecentAdjustment, takashiRecentEvidence, readTakashiRecentOrders, type TakashiRecentOrder } from './takashi-recent-learning';
import { demoFinalScore } from './demo-continuation';
const at=Date.parse('2026-10-27T21:54:00Z');
const row: TakashiRecentOrder={ signal_id:'sugar',entry_strategy:'TAKASHI_BNF_V1',asset:'SUGAR-OTC',direction:'PUT',
  entry_minute:new Date(at-600000).toISOString(),settled_at:new Date(at-360000).toISOString(),status:'confirmed',account_type:'PRACTICE',iq_option_id:'14395548093',result:'win' };
test('own recent Takashi WIN increases next note and LOSS decreases it',()=>{
  const win=takashiRecentAdjustment([row],row,at,at);
  const loss=takashiRecentAdjustment([{...row,result:'loss'}],row,at,at);
  expect(win).toBeCloseTo(0.0375,8);
  expect(loss).toBeCloseTo(-0.042857142857,8);
  expect(demoFinalScore(0.14+win,0,row.entry_strategy)).toBeCloseTo(0.1775,8);
  expect(demoFinalScore(0.14+loss,0,row.entry_strategy)).toBeCloseTo(0.097142857143,8);
});
test('only confirmed own PRACTICE outcomes teach; no TEST, other strategies, pending, ties or future results',()=>{
  const invalid=[{...row,status:'failed'},{...row,account_type:'REAL'},{...row,iq_option_id:'test-1'},
    {...row,entry_strategy:'VELA_FORCA'},{...row,result:'pending'},{...row,result:'tie'},
    {...row,settled_at:null},{...row,settled_at:new Date(at+1).toISOString()},
    {...row,entry_minute:new Date(at).toISOString()}, {...row,entry_minute:new Date(at-14*86400000-1).toISOString()}];
  expect(takashiRecentEvidence(invalid,at,at)).toEqual([]);
  expect(takashiRecentAdjustment(invalid,row,at,at)).toBe(0);
});
test('deduplicates and orders recent trades; opposite direction does not adjust the note',()=>{
  expect(takashiRecentEvidence([row,row],at,at)).toHaveLength(1);
  expect(takashiRecentAdjustment([row],{...row,direction:'CALL'},at,at)).toBe(0);
});
test('reads up to 500 recent orders across all necessary pages',async()=>{
  const pages:number[][]=[];
  const orders=await readTakashiRecentOrders(async(from,to)=>{pages.push([from,to]);return Array.from({length:to-from+1},(_,i)=>({...row,signal_id:String(from+i)}));});
  expect(pages).toEqual([[0,199],[200,399],[400,499]]);
  expect(orders).toHaveLength(500);
  expect(orders[499].signal_id).toBe('499');
});