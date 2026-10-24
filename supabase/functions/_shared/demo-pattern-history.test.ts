import { test, expect } from 'bun:test';
import { readDemoPatternHistory } from './demo-pattern-history';

test('all broker pages and scores become references; pending/unconfirmed orders and outcome candles are excluded',async()=>{
 const entry=1792884840;
 const candles=Array.from({length:20},(_,i)=>({t:entry-(20-i)*60,o:100+i,c:101+i,h:102+i,l:99+i}));
 const order=(signal_id:string)=>({signal_id,status:'confirmed',account_type:'PRACTICE',iq_option_id:'123',result:'win',profit:1.64});
 const pages:number[]=[];
 const samples=await readDemoPatternHistory(async(from)=>{
  pages.push(from);
  return from===0?Array.from({length:500},(_,i)=>order(`s${i}`)):[order('new-win'),{...order('pending'),result:'pending'},{...order('fake'),status:'failed'}];
 },async(ids)=>ids.map(signal_id=>({signal_id,asset:'X',entry_minute:new Date(entry*1000).toISOString(),direction:'CALL',score:3.15,
  candles:[...candles,{t:entry,o:100,c:10000,h:10001,l:99}]})));
 expect(pages).toEqual([0,500]);
 expect(samples).toHaveLength(501);
 expect(samples.some(s=>s.signal_id==='new-win'&&s.score===3.15)).toBe(true);
 expect(samples.some(s=>s.signal_id==='pending'||s.signal_id==='fake')).toBe(false);
 expect(samples[0].f[0]).toBeCloseTo(1/3);
});
test('a failed history page cannot silently yield partial pattern priority',async()=>{
 await expect(readDemoPatternHistory(async()=>{throw new Error('unavailable');},async()=>[])).rejects.toThrow('unavailable');
});