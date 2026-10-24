import { chartFeatures, DEMO_PREFERRED_SCORE_CENTS } from '../../supabase/functions/_shared/demo-continuation';
export const DEMO_ANALYSIS_SCORE_CENTS = [204, 261, 278, 237, 276, 220] as const;
export const DEMO_VISIBLE_PATTERN_SCORES = [...DEMO_PREFERRED_SCORE_CENTS, ...DEMO_ANALYSIS_SCORE_CENTS];
export type PatternCandle = { t:number;o:number;c:number;h:number;l:number };
export type PatternCandidate = { signal_id:string;entry_minute:string;direction:string;asset:string;entry_strategy:string;score:number;candles:unknown };
export function preEntryCandles(value:unknown, entry:string):PatternCandle[] {
 if(!Array.isArray(value))return [];
 const at=Date.parse(entry)/1000;
 return value.filter((v):v is PatternCandle=>v!=null&&typeof v==='object'&&['t','o','c','h','l'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))&&v.t<at).slice(-20);
}
export function winningPatterns(candidates:PatternCandidate[], outcomes:{signal_id:string;result:string;status:string;iq_option_id:string|null}[], scores:readonly number[]=DEMO_PREFERRED_SCORE_CENTS) {
 const results=new Map(outcomes.filter(o=>o.status==='confirmed'&&o.iq_option_id).map(o=>[o.signal_id,o.result]));
 return candidates.flatMap(c=>{
  if(results.get(c.signal_id)!=='win'||!scores.some(s=>s===Math.round(c.score*100)))return [];
  const candles=preEntryCandles(c.candles,c.entry_minute);
  return chartFeatures(candles,Date.parse(c.entry_minute)/1000,c.direction)?[{...c,candles}]:[];
 });
}
export function patternDistance(a:PatternCandle[],aEntry:string,aDirection:string,b:PatternCandle[],bEntry:string,bDirection:string) {
 const f=chartFeatures(a,Date.parse(aEntry)/1000,aDirection),g=chartFeatures(b,Date.parse(bEntry)/1000,bDirection);
 return f&&g?Math.sqrt(f.reduce((s,v,i)=>s+(v-g[i])**2,0)):null;
}