import { DEMO_PREFERRED_SCORE_CENTS } from './demo-continuation.ts';
import { demoWinScores } from './demo-win-scores.ts';
export type ScoreOutcome = {signal_id:string;status:string;account_type:string;iq_option_id:string|null;result:string;profit:number|string};
export type ScorePriority = {cents:number;wins:number;losses:number;profit:number;accuracy:number};
const cohort = DEMO_PREFERRED_SCORE_CENTS;
export function rankDemoScores(rows:ScoreOutcome[],scores:Map<string,number>):ScorePriority[] {
 const stats = new Map(cohort.map(cents=>[cents,{cents,wins:0,losses:0,profit:0,accuracy:0}]));
 for(const row of rows){
  if(row.status!=='confirmed'||!['PRACTICE','REAL'].includes(row.account_type)||!row.iq_option_id||!/^\d+$/.test(row.iq_option_id)||!['win','loss','tie'].includes(row.result))continue;
  const score=scores.get(row.signal_id);
  if(score==null||!Number.isFinite(score))continue;
  const stat=stats.get(Math.round(score*100));if(!stat)continue;
  if(row.result==='win')stat.wins++;
  if(row.result==='loss')stat.losses++;
  const profit=Number(row.profit);if(Number.isFinite(profit))stat.profit+=profit;
 }
 return [...stats.values()].map(s=>({...s,profit:Math.round(s.profit*100)/100,accuracy:s.wins+s.losses?s.wins/(s.wins+s.losses):0}))
  .sort((a,b)=>Number(b.profit>0)-Number(a.profit>0)||b.accuracy-a.accuracy||b.wins-a.wins||b.profit-a.profit||a.cents-b.cents);
}
export async function readDemoScorePriorities(
 readPage:(from:number,to:number)=>Promise<ScoreOutcome[]>,
 readScores:(ids:string[])=>Promise<{signal_id:string;score:number}[]>,
){
 return (await readDemoScoreHistory(readPage,readScores)).priorities;
}
export async function readDemoScoreHistory(
 readPage:(from:number,to:number)=>Promise<ScoreOutcome[]>,
 readScores:(ids:string[])=>Promise<{signal_id:string;score:number}[]>,
){
 const rows:ScoreOutcome[]=[];
 for(let from=0;;from+=1000){const page=await readPage(from,from+999);rows.push(...page);if(page.length<1000)break;}
 const ids=[...new Set(rows.map(r=>r.signal_id))],scores=new Map<string,number>();
 for(let from=0;from<ids.length;from+=200){for(const row of await readScores(ids.slice(from,from+200)))scores.set(row.signal_id,row.score);}
 return {priorities:rankDemoScores(rows,scores),winScores:demoWinScores(rows,scores)};
}