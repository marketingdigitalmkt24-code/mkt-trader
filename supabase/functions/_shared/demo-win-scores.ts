export type DemoWinOrder = {signal_id:string;status:string;account_type:string;iq_option_id:string|null;result:string};
export function confirmedDemoWin(row:DemoWinOrder):boolean {
  return row.status==='confirmed' && ['PRACTICE','REAL'].includes(row.account_type)
    && typeof row.iq_option_id==='string' && /^\d+$/.test(row.iq_option_id) && row.result==='win';
}
export function demoWinScores(rows:DemoWinOrder[],scores:Map<string,number>):Set<number> {
  const allowed=new Set<number>();
  for(const row of rows){
    const score=scores.get(row.signal_id);
    if(confirmedDemoWin(row) && typeof score==='number' && Number.isFinite(score))allowed.add(score);
  }
  return allowed;
}
export function demoWinScoreAllowed(score:unknown,allowed:ReadonlySet<number>):score is number {
  return typeof score==='number' && Number.isFinite(score) && allowed.has(score);
}
export function demoWinScoreReason(score:number,allowed:ReadonlySet<number>) {
  if(demoWinScoreAllowed(score,allowed))return null;
  return {code:'outside_confirmed_win_scores',details:{score:Number.isFinite(score)?score:null,win_references:allowed.size}};
}
// Placement reads exact-score candidates, paginated, then verifies their own broker-confirmed WIN.
export async function verifyDemoWinScore(
  score:unknown,
  readCandidates:(score:number,from:number,to:number)=>Promise<{signal_id:string;score:number}[]>,
  readOrders:(ids:string[])=>Promise<DemoWinOrder[]>,
):Promise<boolean> {
  if(typeof score!=='number'||!Number.isFinite(score))return false;
  for(let from=0;;from+=200){
    const page=await readCandidates(score,from,from+199);
    const exact=page.filter(c=>c.score===score);
    if(exact.length){
      const rows=await readOrders(exact.map(c=>c.signal_id));
      if(demoWinScoreAllowed(score,demoWinScores(rows,new Map(exact.map(c=>[c.signal_id,c.score])))))return true;
    }
    if(page.length<200)return false;
  }
}