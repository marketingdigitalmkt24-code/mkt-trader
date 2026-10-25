import {expect,test} from 'bun:test';
import {rankDemoScores,readDemoScorePriorities,type ScoreOutcome} from './demo-score-priority';
import {chooseDemoCandidate,demoPreferredPatternDistance,type DemoCandidate} from './demo-continuation';
import {isSuperSelected} from './demo-validated';
const row=(signal_id:string,result='win',profit=1.64):ScoreOutcome=>({signal_id,result,profit,status:'confirmed',account_type:'PRACTICE',iq_option_id:'123456'});
for(const score of [2.04,2.61,2.78,2.37,2.76,2.20])test(`Demo score ${score} joins pattern ranking but never authorizes principal`,()=>{
 const ranked=rankDemoScores([row('new')],new Map([['new',score]]));
 expect(ranked[0]).toMatchObject({cents:Math.round(score*100),wins:1,profit:1.64});
 expect(demoPreferredPatternDistance([{f:[0,1],result:'win',score}],[0,1])).toBe(0);
 const candidate:DemoCandidate={signal_id:'new',asset:'X',direction:'CALL',entry_strategy:'TENDENCIA',created_at:'2026-10-24T23:22:00Z',_score:score,_preferredPatternDistance:0};
 expect(chooseDemoCandidate([candidate],true,ranked.map(r=>r.cents))?.signal_id).toBe('new');
 expect(chooseDemoCandidate([{...candidate,_preferredPatternDistance:1.31}],true,ranked.map(r=>r.cents))).toBeNull();
 expect(isSuperSelected(score)).toBe(false);
});
test('positive net outranks nonprofitable notes, then accuracy and win count determine priority',()=>{
 const ranked=rankDemoScores([row('a'),row('a'),row('b'),row('b'),row('b','loss',-2),row('c'),row('c','loss',-2)],new Map([['a',2.23],['b',2.26],['c',2.18]]));
 expect(ranked.slice(0,2).map(r=>r.cents)).toEqual([223,226]);
 expect(ranked.find(r=>r.cents===218)?.profit).toBe(-.36);
});
test('equal accuracy prefers more wins, not highest numeric score',()=>{
 const ranked=rankDemoScores([row('a'),row('b'),row('b')],new Map([['a',2.91],['b',2.03]]));
 expect(ranked[0].cents).toBe(203);
});
test('only exact displayed fourteen scores and confirmed Demo outcomes contribute',()=>{
 const ranked=rankDemoScores([row('a'),{...row('a'),status:'failed'},{...row('a'),account_type:'REAL'},row('a','pending',100),row('outside')],new Map([['a',2.264],['outside',2.27]]));
 expect(ranked.find(r=>r.cents===226)).toMatchObject({wins:1,profit:1.64});
 expect(ranked.length).toBe(14);
});
test('historical order overrides fixed 2.26 priority without broadening principal authorization or chart gate',()=>{
 const c=(score:number,distance:number):DemoCandidate=>({signal_id:String(score),asset:'X',direction:'PUT',entry_strategy:'TENDENCIA',created_at:'2026-10-24T23:10:00Z',_score:score,_preferredPatternDistance:distance});
 expect(chooseDemoCandidate([c(2.26,.1),c(2.23,1)],true,[223,226])?._score).toBe(2.23);
 expect(chooseDemoCandidate([c(2.23,1.31),c(2.26,.1)],true,[223,226])?._score).toBe(2.26);
 expect(isSuperSelected(2.23)).toBe(false);
 expect(isSuperSelected(2.26)).toBe(true);
});
test('all history pages and exact signal score joins contribute',async()=>{
 const ranks=await readDemoScorePriorities(async(from,to)=>{expect(to-from).toBe(999);return from===0?Array.from({length:1000},()=>row('a')):[row('b')];},async ids=>ids.map(signal_id=>({signal_id,score:signal_id==='a'?2.23:2.26})));
 expect(ranks[0]).toMatchObject({cents:223,wins:1000,profit:1640});
});