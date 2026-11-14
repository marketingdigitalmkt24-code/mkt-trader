import { expect, test } from 'bun:test';
import { AI_BREAKOUT, AI_PULLBACK, AI_CHART_STRATEGIES, aiChartSetups, aiChartPracticeOnly, aiChartTimely } from './demo-ai-strategies.ts';
import { chartChoices, validateChartPicks, requestChartDecisions } from './demo-ai-gate.ts';
import { freshDemoCandidate } from './demo-test-policy.ts';
import { demoRecovery } from './demo-recovery.ts';
import { DEMO_ANALYSIS_SEC, DEMO_CANDLE_SEC } from './demo-timing.ts';
const sec = Math.floor(Date.now()/60000)*60;
const bars = Array.from({length:90},(_,i)=>({t:sec-(90-i)*60,o:100+i*0.1,c:100+i*0.1+0.08,h:100+i*0.1+0.09,l:100+i*0.1-0.01}));
const series = new Map([['EUR/USD', bars]]);
const candidates = AI_CHART_STRATEGIES.map(entry_strategy=>({signal_id:entry_strategy,asset:'EUR/USD',direction:'CALL',entry_strategy,quality:0,payout:0.85}));
test('both cards retain M1 analysis and M1 expiry',()=>{expect(DEMO_ANALYSIS_SEC).toBe(60);expect(DEMO_CANDLE_SEC).toBe(60);});
test('two strategies remain different and breakout follows trend',()=>{
  expect(AI_BREAKOUT).not.toBe(AI_PULLBACK);
  const signals=aiChartSetups(bars,sec);expect(signals.map(s=>s.strategy)).toEqual([AI_BREAKOUT]);expect(signals[0].direction).toBe('CALL');
});
test('pullback is a separate setup on the same closed M1 chart',()=>{
  const copy=bars.map(b=>({...b}));copy[89].l=107;copy[89].h=109;copy[89].c=108.95;
  expect(aiChartSetups(copy,sec).some(s=>s.strategy===AI_PULLBACK)).toBe(true);
});
test('incomplete or future charts cannot create setups',()=>{
  expect(aiChartSetups(bars.slice(1),sec)).toEqual([]);
  expect(aiChartSetups(bars.map(b=>({...b,t:b.t+60})),sec)).toEqual([]);
});
test('AI orders are PRACTICE only',()=>{expect(aiChartPracticeOnly('PRACTICE')).toBe(true);expect(aiChartPracticeOnly('REAL')).toBe(false);expect(aiChartPracticeOnly(undefined)).toBe(false);});
test('late AI decisions cannot roll to another minute',()=>{expect(aiChartTimely(sec*1000,sec*1000+25000)).toBe(true);expect(aiChartTimely(sec*1000,sec*1000+25001)).toBe(false);});
test('AI cannot select a candidate from the other card',()=>{
  const choices=chartChoices(candidates,series,sec);expect(choices).toHaveLength(2);
  expect(choices[0].candles).toHaveLength(60);
  expect(validateChartPicks({[AI_BREAKOUT]:choices[1].id,[AI_PULLBACK]:'skip'},choices)).toBeNull();
  expect(validateChartPicks({[AI_BREAKOUT]:choices[0].id,[AI_PULLBACK]:choices[1].id},choices)).toEqual({[AI_BREAKOUT]:AI_BREAKOUT,[AI_PULLBACK]:AI_PULLBACK});
});
test('new candidate requires exact strategy prefix and M1 freshness',()=>{
  const row={signal_id:'demo-ia-rompimento-v1-EURUSD-1',entry_strategy:AI_BREAKOUT,timeframe:'TEST',created_at:new Date(sec*1000).toISOString(),direction:'CALL'};
  expect(freshDemoCandidate(row,sec*1000+1000)).toBe(true);
  expect(freshDemoCandidate({...row,entry_strategy:AI_PULLBACK},sec*1000+1000)).toBe(false);
  expect(freshDemoCandidate(row,sec*1000+26000)).toBe(false);
});
test('configured fixed stake remains unchanged after LOSS',()=>{
  expect(demoRecovery({status:'confirmed',result:'loss',account_type:'PRACTICE',iq_option_id:'123',amount:2,profit:-2,recovery_level:2,recovery_loss:4,recovery_base:2},2,0.85)?.amount).toBe(2);
});
test('provider credit denial pauses and never creates picks',async()=>{
  const response=await requestChartDecisions(candidates,series,sec*1000,'test',async()=>new Response(JSON.stringify({message:'Créditos insuficientes'}),{status:402}));
  expect(response.pause).toBe(true);expect(response.picks).toBeNull();expect(response.error).toBe('Créditos insuficientes');
});
test('streamed valid choices are accepted with required high reasoning schema',async()=>{
  const now=Math.floor(Date.now()/60000)*60000;
  const fresh=bars.map((b,i)=>({...b,t:now/1000-(90-i)*60}));
  const response=await requestChartDecisions(candidates,new Map([['EUR/USD',fresh]]),now,'test',async(_url,init)=>{
    const request=JSON.parse(String(init?.body));expect(request.reasoning.effort).toBe('high');expect(request.stream).toBe(true);
    const text=JSON.stringify({[AI_BREAKOUT]:`${AI_BREAKOUT}:0`,[AI_PULLBACK]:'skip'});
    return new Response(`data: ${JSON.stringify({type:'response.output_text.delta',delta:text})}\n\n`);
  });
  if(Date.now()-now<=25000)expect(response.picks).toEqual({[AI_BREAKOUT]:AI_BREAKOUT,[AI_PULLBACK]:null});else expect(response.status).toBe('late');
});