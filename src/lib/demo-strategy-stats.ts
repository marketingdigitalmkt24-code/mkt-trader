import type { DemoOutcomeRow } from './demo-test-stats';
import type { StrategyStat } from './strategy-stats';

// Display-only restart requested on Oct 23; broker records and other totals stay intact.
export const DEMO_STRATEGY_CUTOFF = '2026-10-23T18:59:00Z'; // 15:59 BRT, first Demo order
export interface DemoStrategyRow extends DemoOutcomeRow {
 entry_strategy: string;
 entry_minute: string;
}
export async function allDemoStrategyRows(readPage: (from:number,to:number)=>Promise<DemoStrategyRow[]>) {
 const rows:DemoStrategyRow[]=[];
 for(let from=0;;from+=1000){
  const page=await readPage(from,from+999);rows.push(...page);
  if(page.length<1000)return rows;
 }
}
export function demoStrategyStats(rows:DemoStrategyRow[],cutoff=DEMO_STRATEGY_CUTOFF):StrategyStat[]{
 const start=Date.parse(cutoff);
 const stats=new Map<string,StrategyStat>();
 for(const row of rows){
  if(row.status!=='confirmed'|| !row.iq_option_id || !/^\d+$/.test(row.iq_option_id)||!row.entry_strategy)continue;
  const stat=stats.get(row.entry_strategy)??{strategy:row.entry_strategy,wins:0,losses:0};
  stats.set(row.entry_strategy,stat);
  const at=Date.parse(row.entry_minute);
  if(!Number.isFinite(at)||at<start)continue;
  if(row.result==='win')stat.wins++;
  if(row.result==='loss')stat.losses++;
 }
 return [...stats.values()].sort((a,b)=>{
  const an=a.wins+a.losses,bn=b.wins+b.losses;
  return (bn?b.wins/bn:0)-(an?a.wins/an:0)||bn-an||a.strategy.localeCompare(b.strategy);
 });
}