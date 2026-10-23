import {test,expect} from 'bun:test';
import {demoStrategyStats,allDemoStrategyRows,DEMO_STRATEGY_CUTOFF,type DemoStrategyRow} from './src/lib/demo-strategy-stats';
const base:DemoStrategyRow={status:'confirmed',iq_option_id:'123',entry_strategy:'TENDENCIA',result:'win',profit:0.82,entry_minute:'2026-10-23T19:34:00Z'};
test('cutoff counts from first Demo order at 15:59 BRT',()=>{
 expect(demoStrategyStats([{...base,entry_minute:'2026-10-23T18:58:00Z'}])).toEqual([{strategy:'TENDENCIA',wins:0,losses:0}]);
 expect(demoStrategyStats([{...base,entry_minute:'2026-10-23T18:59:00Z'}])).toEqual([{strategy:'TENDENCIA',wins:1,losses:0}]);
 expect(DEMO_STRATEGY_CUTOFF).toBe('2026-10-23T18:59:00Z');
});
test('counts only confirmed Demo broker outcomes separately per sent strategy',()=>{
 expect(demoStrategyStats([base,{...base,entry_strategy:'CONTINUACAO_QUEDA_V1',result:'loss'},
 {...base,status:'failed'}, {...base,iq_option_id:null}, {...base,result:'pending'}, {...base,result:'tie'}]))
 .toEqual([{strategy:'TENDENCIA',wins:1,losses:0},{strategy:'CONTINUACAO_QUEDA_V1',wins:0,losses:1}]);
});
test('read all pages, not just visible Demo orders',async()=>{
 const rows=await allDemoStrategyRows(async(from)=>from===0?Array(1000).fill(base):[{...base,result:'loss'}]);
 expect(demoStrategyStats(rows)).toEqual([{strategy:'TENDENCIA',wins:1000,losses:1}]);
});