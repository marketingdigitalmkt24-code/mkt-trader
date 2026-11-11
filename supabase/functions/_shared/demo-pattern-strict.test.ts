import {test,expect} from 'bun:test';
import {PATTERN_MAX_DISTANCE} from './demo-new-strategies';
import {selectDemoByRotation} from './demo-profit-selection';
test('only charts up to 0.45 count as similar',()=>{expect(PATTERN_MAX_DISTANCE).toBe(0.45);});
test('retired Padrão vencedor cannot win a Demo slot',()=>{
  const c=(asset:string,n:number)=>({signal_id:`demo-padrao-vencedor-v1-${asset}-1`,asset,direction:'CALL',entry_strategy:'PADRAO_VENCEDOR',created_at:'',_score:Number.NaN,_patternSimilarWins:n});
  expect(selectDemoByRotation([c('AAA',40),c('ZZZ',90)],'ICHIMOKU','ICHIMOKU',null)).toBeNull();
});
