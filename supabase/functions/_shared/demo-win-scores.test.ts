import {describe,it,expect} from 'bun:test';
import {demoWinScores,demoWinScoreAllowed,verifyDemoWinScore} from './demo-win-scores.ts';
import {readDemoScoreHistory} from './demo-score-priority.ts';
const win=(signal_id:string)=>({signal_id,status:'confirmed',account_type:'PRACTICE',iq_option_id:'123',result:'win',profit:1});
describe('all confirmed Demo WIN exact scores',()=>{
 it('uses the complete BIDU WIN score rather than its rounded 2.26 label',async()=>{
  const score=2.26032894533026;
  const signal_id='t7-BIDU-OTC-TENDENCIA-1792889040';
  const allowed=demoWinScores([win(signal_id)],new Map([[signal_id,score]]));
  expect(demoWinScoreAllowed(2.26032894533026,allowed)).toBe(true);
  expect(demoWinScoreAllowed(2.26,allowed)).toBe(false);
  expect(demoWinScoreAllowed(2.26032894533027,allowed)).toBe(false);
  const read=async()=>[{signal_id,score}];
  expect(await verifyDemoWinScore(2.26032894533026,read,async()=>[win(signal_id)])).toBe(true);
  expect(await verifyDemoWinScore(2.26,read,async()=>[win(signal_id)])).toBe(false);
 });
 it('includes WIN scores outside the former 59 cohort and retains raw precision',()=>{
  const allowed=demoWinScores([win('old'),win('new')],new Map([['old',6.123456789012345],['new',2.259004451962]]));
  expect(demoWinScoreAllowed(6.123456789012345,allowed)).toBe(true);
  expect(demoWinScoreAllowed(2.259004451962,allowed)).toBe(true);
  expect(demoWinScoreAllowed(2.26,allowed)).toBe(false);
  expect(demoWinScoreAllowed(2.259004451962001,allowed)).toBe(false);
 });
 it('excludes LOSS-only, pending, nonbroker, REAL, simulations and missing scores',()=>{
  const rows=[{...win('loss'),result:'loss'},{...win('pending'),result:'pending'},{...win('reserved'),status:'reserved'}, {...win('real'),account_type:'REAL'},{...win('sim'),iq_option_id:'test-123'},win('missing')];
  expect(demoWinScores(rows,new Map(rows.slice(0,-1).map((r,i)=>[r.signal_id,i+1]))).size).toBe(0);
 });
 it('a confirmed WIN authorizes even if another operation with the same score lost',()=>{
  expect(demoWinScoreAllowed(2.2,demoWinScores([win('w'),{...win('l'),result:'loss'}],new Map([['w',2.2],['l',2.2]])))).toBe(true);
 });
 it('includes later confirmed wins on the next read and paginates all history',async()=>{
  let settled=false;
  const pages=async(from:number)=>from===0?Array.from({length:1000},(_,i)=>win(String(i))):[{...win('new'),result:settled?'win':'pending'}];
  const scores=async(ids:string[])=>ids.map(signal_id=>({signal_id,score:signal_id==='new'?9.123456789:1}));
  expect((await readDemoScoreHistory(pages,scores)).winScores.has(9.123456789)).toBe(false);
  settled=true;
  expect((await readDemoScoreHistory(pages,scores)).winScores.has(9.123456789)).toBe(true);
 });
 it('placement checks exact candidate-to-WIN linkage across pages',async()=>{
  const read=async(score:number,from:number)=>from===0?Array.from({length:200},(_,i)=>({signal_id:String(i),score})):[{signal_id:'winning',score}];
  expect(await verifyDemoWinScore(2.259004451962,read,async ids=>ids.includes('winning')?[win('winning')]:[])).toBe(true);
  expect(await verifyDemoWinScore(2.26,async()=>[{signal_id:'winning',score:2.259004451962}],async()=>[win('winning')])).toBe(false);
 });
 it('fails closed on history errors without cached or frozen fallback',async()=>{
  expect(verifyDemoWinScore(2.26,async()=>{throw new Error('read failed');},async()=>[])).rejects.toThrow('read failed');
 });
});