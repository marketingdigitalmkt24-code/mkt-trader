import {expect,test} from 'bun:test';
import {combinedDemoDirection,winningReferenceSamples, preEntryMovementPct,matchWinningPattern,preEntryPattern,type WinningReference} from './demo-new-strategies.ts';
import {selectDemoByRotation} from './demo-profit-selection.ts';
import {freshDemoCandidate} from './demo-test-policy.ts';
import {demoCohort} from './demo-226-policy.ts';
const strategies=['TENDENCIA_FORCA_RECUO','ICHIMOKU_RECUO21','ICHIMOKU','RECUO_EMA21'];
const at=Date.parse('2026-11-10T06:00:00Z')/1000;
const candles=(entry:number)=>Array.from({length:20},(_,i)=>({t:entry-(20-i)*60,o:100+i,c:100.5+i,h:101+i,l:99.5+i}));
const ref:WinningReference={signal_id:'ref',asset:'EUR/USD-OTC',direction:'CALL',entry_minute:new Date((at-120)*1000).toISOString(),settled_at:new Date((at-59)*1000).toISOString(),result:'win',status:'confirmed',account_type:'PRACTICE',iq_option_id:'123',candles:candles(at-120)};
const c=(strategy:string,id=strategy)=>({signal_id:id,asset:'X',entry_strategy:strategy,direction:'CALL',created_at:new Date(at*1000).toISOString(),_score:Number.NaN});

test('combination requires all four on the same direction, not only three or duplicates',()=>{
  for(const direction of ['CALL','PUT'] as const)expect(combinedDemoDirection(strategies.map(s=>[s,direction] as const))).toBe(direction);
  expect(combinedDemoDirection(strategies.slice(0,3).map(s=>[s,'CALL'] as const))).toBeNull();
  expect(combinedDemoDirection([...strategies.map(s=>[s,'CALL'] as const),['ICHIMOKU','PUT']])).toBeNull();
  expect(combinedDemoDirection(Array(4).fill(['ICHIMOKU','CALL']))).toBeNull();
});
test('new strategies are eligible without notes and have exclusive fresh prefixes',()=>{
  for(const [strategy,prefix] of [['CONFLUENCIA_4_ESTRATEGIAS','demo-confluencia4-v1-'],['PADRAO_VENCEDOR','demo-padrao-vencedor-v1-']]){
    expect(demoCohort(undefined,strategy)).toBe('indicator');
    const row={...c(strategy),signal_id:`${prefix}X-${at}`,timeframe:'TEST'};
    expect(freshDemoCandidate(row,at*1000+1000)).toBe(true);
    expect(freshDemoCandidate(row,at*1000+26000)).toBe(false);
    expect(freshDemoCandidate({...row,entry_strategy:'ICHIMOKU'},at*1000+1000)).toBe(false);
  }
});
test('original priority cannot starve challengers and original turns remain intact',()=>{
  const pool=[...strategies.map(s=>c(s)),c('CONFLUENCIA_4_ESTRATEGIAS'),c('PADRAO_VENCEDOR')];
  expect(selectDemoByRotation(pool,'ICHIMOKU','ICHIMOKU_RECUO21')?.entry_strategy).toBe('CONFLUENCIA_4_ESTRATEGIAS');
  expect(selectDemoByRotation(pool,'ICHIMOKU','CONFLUENCIA_4_ESTRATEGIAS','CONFLUENCIA_4_ESTRATEGIAS')?.entry_strategy).toBe('ICHIMOKU_RECUO21');
  expect(selectDemoByRotation(pool,'ICHIMOKU','ICHIMOKU_RECUO21','CONFLUENCIA_4_ESTRATEGIAS')?.entry_strategy).toBe('PADRAO_VENCEDOR');
  expect(selectDemoByRotation(pool.slice(0,4),'ICHIMOKU','PADRAO_VENCEDOR')?.entry_strategy).toBe('ICHIMOKU_RECUO21');
  expect(selectDemoByRotation([c('PADRAO_VENCEDOR')],null,'PADRAO_VENCEDOR','PADRAO_VENCEDOR')?.entry_strategy).toBe('PADRAO_VENCEDOR');
});
test('WIN references exclude unconfirmed, future, same-minute, REAL and LOSS outcomes',()=>{
  const invalid=[{result:'loss'},{status:'unknown'},{account_type:'REAL'},{iq_option_id:'bad'},{settled_at:new Date(at*1000).toISOString()},{settled_at:new Date((at-121)*1000).toISOString()}];
  for(const change of invalid)expect(winningReferenceSamples([{...ref,...change}],at)).toEqual([]);
  expect(winningReferenceSamples([ref,ref],at)).toHaveLength(1);
});
test('matching uses only contiguous valid pre-entry candles, never entry result',()=>{
  const many=Array.from({length:31},(_,i)=>({...ref,signal_id:i?`ref${i}`:'ref',asset:['A','B','C'][i%3]}));
  const samples=winningReferenceSamples(many,at);
  const match=matchWinningPattern(samples,candles(at),at,'CALL');
  expect(match?.signal_id).toBe('ref');
  expect(match?.similar_wins).toBe(31);
  expect(match?.distance).toBe(0);
  expect(match).not.toHaveProperty('score');
  expect(matchWinningPattern(samples,[...candles(at),{t:at,o:1,c:999,h:999,l:1}],at,'CALL')).toEqual(match);
  expect(preEntryPattern(candles(at).slice(1),at,'CALL')).toBeNull();
  expect(preEntryPattern(candles(at).map((k,i)=>i===1?{...k,t:k.t-60}:k),at,'CALL')).toBeNull();
  expect(matchWinningPattern([],candles(at),at,'CALL')).toBeNull();
});test('Padrão vencedor rejects flat assets below the configured minimum movement',()=>{
  const flat=Array.from({length:20},(_,i)=>({t:at-(20-i)*60,o:100,c:100,h:100.01,l:99.99}));
  expect(preEntryMovementPct(flat,at)).toBeCloseTo(0.02,5);
  expect(matchWinningPattern([{f:[0],result:'win',signal_id:'x',asset:'A',entry_minute:''}] as never,flat,at,'CALL',0.05)).toBeNull();
});

test('Padrão vencedor needs more than 30 similar WINs from at least 3 assets',()=>{
  const mk=(n:number,assets:string[])=>winningReferenceSamples(Array.from({length:n},(_,i)=>({...ref,signal_id:`r${i}`,asset:assets[i%assets.length]})),at);
  expect(matchWinningPattern(mk(30,['A','B','C']),candles(at),at,'CALL')).toBeNull();
  expect(matchWinningPattern(mk(31,['A','B']),candles(at),at,'CALL')).toBeNull();
  expect(matchWinningPattern(mk(31,['A','B','C']),candles(at),at,'CALL')?.distinct_assets).toBe(3);
});
