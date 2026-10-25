import { chartFeatures, demoWinningPatternMatch, demoLearnedReject, demoScoreAllowed, DEMO_LEARNED_REJECT, DEMO_MIN_SCORE, type ChartSample } from './demo-continuation.ts';
import { confirmedDemoWin, demoWinScoreAllowed, demoWinScoreReason, type DemoWinOrder } from './demo-win-scores.ts';

export function demoEntryReason(score: number, winScores: ReadonlySet<number>, match: ReturnType<typeof demoWinningPatternMatch>, learned: number) {
  if (demoWinScoreAllowed(score, winScores)) return null;
  if (!Number.isFinite(learned) || demoLearnedReject(learned)) return {code:'learned_history',details:{learned:Number.isFinite(learned)?learned:null,maximum:DEMO_LEARNED_REJECT}};
  if (!demoScoreAllowed(score)) return {code:'score_floor',details:{score:Number.isFinite(score)?score:null,minimum:DEMO_MIN_SCORE}};
  if (match) return null;
  return demoWinScoreReason(score, winScores);
}

type PatternCandidate = {signal_id:string;entry_minute:string;direction:string;score:number;candles:unknown;pattern_match:unknown};
type Reference = {signal_id:string;entry_minute:string;direction:string;candles:unknown;score?:number};
type Candle = {t:number;o:number;c:number;h:number;l:number};
function features(row: Reference) {
  if (!['CALL','PUT'].includes(row.direction) || !Array.isArray(row.candles)) return null;
  const entry=Date.parse(row.entry_minute)/1000;
  const closed=row.candles.filter((k):k is Candle=>!!k && typeof k==='object' && [k.t,k.o,k.c,k.h,k.l].every(Number.isFinite) && k.t<entry);
  if (closed.length<20 || closed.slice(-20).some((k,i)=>k.t!==entry-(20-i)*60 || k.o<=0 || k.c<=0 || k.h<Math.max(k.o,k.c) || k.l>Math.min(k.o,k.c))) return null;
  return chartFeatures(closed,entry,row.direction);
}

// Recompute correspondence from the selected candidate's own closed candles and the linked
// broker-confirmed WIN; a stored label/distance alone never authorizes placement.
export async function verifyDemoWinningPattern(candidate: PatternCandidate, readReference: (id:string)=>Promise<Reference|null>, readOrders:(ids:string[])=>Promise<DemoWinOrder[]>):Promise<boolean> {
  const raw=candidate.pattern_match;
  if (!raw || typeof raw!=='object' || !('signal_id' in raw) || typeof raw.signal_id!=='string' || !('learned' in raw) || typeof raw.learned!=='number') return false;
  const reference=await readReference(raw.signal_id);
  if (!reference || reference.signal_id!==raw.signal_id || reference.signal_id===candidate.signal_id || !(Date.parse(reference.entry_minute)<Date.parse(candidate.entry_minute))) return false;
  const orders=await readOrders([reference.signal_id]);
  if (!orders.some(row=>row.signal_id===reference.signal_id && confirmedDemoWin(row))) return false;
  const f=features(reference), candidateFeatures=features(candidate);
  const samples:ChartSample[]=f?[{f,result:'win',signal_id:reference.signal_id,score:reference.score}]:[];
  const match=demoWinningPatternMatch(samples,candidateFeatures);
  return !!match && demoEntryReason(candidate.score,new Set<number>(),match,raw.learned)===null;
}