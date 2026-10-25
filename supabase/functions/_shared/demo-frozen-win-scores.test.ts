import {expect,test} from 'bun:test';
import {DEMO_FROZEN_WIN_SCORES,DEMO_FROZEN_LOSS_SCORES,demoFrozenWinAllowed,demoFrozenScoreReason} from './demo-frozen-win-scores';
test('frozen cohort has 59 distinct WIN and eight LOSS without overlap',()=>{
 expect(new Set(DEMO_FROZEN_WIN_SCORES).size).toBe(59);
 expect(new Set(DEMO_FROZEN_LOSS_SCORES).size).toBe(8);
 expect(DEMO_FROZEN_WIN_SCORES.some(w=>DEMO_FROZEN_LOSS_SCORES.some(l=>w===l))).toBe(false);
});
for(const score of DEMO_FROZEN_WIN_SCORES)test(`WIN ${score} authorizes only exact stored score`,()=>{
 expect(demoFrozenWinAllowed(score)).toBe(true);
 expect(demoFrozenWinAllowed(Math.round(score*100)/100)).toBe(false);
 expect(demoFrozenWinAllowed(score+1e-12)).toBe(false);
 expect(demoFrozenWinAllowed(score-1e-12)).toBe(false);
});
for(const score of DEMO_FROZEN_LOSS_SCORES)test(`LOSS ${score} is explicitly excluded`,()=>{
 expect(demoFrozenWinAllowed(score)).toBe(false);
 expect(demoFrozenScoreReason(score)?.code).toBe('frozen_loss_score');
});
test('new wins, missing or invalid scores cannot expand authorization',()=>{
 for(const score of [2.26,2.259004451962,3,NaN,Infinity,null,undefined,'2.25548859462004'])expect(demoFrozenWinAllowed(score)).toBe(false);
});