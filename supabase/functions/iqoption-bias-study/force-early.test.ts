import {test,expect} from 'bun:test';
import {forceEarly} from './force-early.ts';
const fixture=()=>Array.from({length:102},(_,i)=>({t:i*60,o:100,c:101,h:102,l:99}));
test('entry shifts exactly one minute and patterns cannot read the force outcome',()=>{
  const cs=fixture(); cs[100]={t:6000,o:100,c:99,h:101,l:98};
  const a=forceEarly(cs,6060,'PUT');
  expect(a.coverage).toBe('OK'); expect('earlyMinute' in a && a.earlyMinute).toBe(6000);
  expect('earlyResult' in a && a.earlyResult).toBe('win');
  const b=forceEarly(cs.map(k=>k.t===6000?{...k,c:101}:k),6060,'PUT');
  expect('earlyResult' in b && b.earlyResult).toBe('loss');
  expect('bodyShare' in a && a.bodyShare).toBe('bodyShare' in b && b.bodyShare);
});
test('requires 100 contiguous bars before early entry and the exact target candle',()=>{
  expect(forceEarly(fixture().filter(k=>k.t!==0),6060,'PUT').coverage).toBe('MISSING');
  expect(forceEarly(fixture().filter(k=>k.t!==6000),6060,'PUT').coverage).toBe('MISSING');
});
test('simulated payoff is 8.5 win, minus10 loss, zero tie, mirrored by direction',()=>{
  for(const [direction,close,profit] of [['CALL',102,8.5],['PUT',102,-10],['PUT',100,0]] as const){
    const cs=fixture();cs[100]={t:6000,o:100,c:close,h:103,l:99};
    const a=forceEarly(cs,6060,direction);expect('earlyProfit' in a && a.earlyProfit).toBe(profit);
  }
});