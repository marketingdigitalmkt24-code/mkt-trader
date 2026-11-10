import { chartFeatures, demoWinningPatternMatch } from './demo-continuation.ts';

export const DEMO_CONFLUENCE = 'CONFLUENCIA_4_ESTRATEGIAS';
export const DEMO_WIN_PATTERN = 'PADRAO_VENCEDOR';
export const DEMO_CHALLENGERS = [DEMO_CONFLUENCE, DEMO_WIN_PATTERN] as const;
const REQUIRED = ['TENDENCIA_FORCA_RECUO', 'ICHIMOKU_RECUO21', 'ICHIMOKU', 'RECUO_EMA21'];
type Candle = { t:number; o:number; c:number; h:number; l:number };
export type WinningReference = {signal_id:string;asset:string;direction:string;entry_minute:string;settled_at:string;result:string;status:string;account_type:string;iq_option_id:string|null;candles:unknown};

export function combinedDemoDirection(signals: readonly (readonly [string,string])[]): 'CALL'|'PUT'|null {
  for(const direction of ['CALL','PUT'] as const) {
    if(REQUIRED.every(strategy=>signals.some(([s,d])=>s===strategy&&d===direction))
      && !signals.some(([s,d])=>REQUIRED.includes(s)&&d!==direction)) return direction;
  }
  return null;
}

export function preEntryPattern(value:unknown,entry:number,direction:string):number[]|null {
  if(!Array.isArray(value)||!['CALL','PUT'].includes(direction)||!Number.isFinite(entry)||entry%60!==0)return null;
  const candles=value.filter((k):k is Candle=>k!=null&&typeof k==='object'&&typeof k.t==='number'&&k.t<entry).sort((a,b)=>a.t-b.t).slice(-20);
  if(candles.length!==20||candles.some((k,i)=>k.t!==entry-(20-i)*60
    ||![k.t,k.o,k.c,k.h,k.l].every(Number.isFinite)||k.o<=0||k.c<=0
    ||k.h<Math.max(k.o,k.c)||k.l>Math.min(k.o,k.c)))return null;
  return chartFeatures(candles,entry,direction);
}

/** Average (high-low)/close in percent over the 20 contiguous pre-entry candles; null when incomplete. */
export function preEntryMovementPct(value:unknown,entry:number):number|null {
  if(!Array.isArray(value)||!Number.isFinite(entry))return null;
  const candles=value.filter((k):k is Candle=>k!=null&&typeof k==='object'&&typeof k.t==='number'&&k.t<entry).sort((a,b)=>a.t-b.t).slice(-20);
  if(candles.length!==20||candles.some((k,i)=>k.t!==entry-(20-i)*60||!(k.c>0)||!Number.isFinite(k.h-k.l)))return null;
  return candles.reduce((a,k)=>a+(k.h-k.l)/k.c,0)/20*100;
}

export function winningReferenceSamples(rows:WinningReference[],entry:number) {
  const seen=new Set<string>();
  return rows.flatMap(row=>{
    const at=Date.parse(row.entry_minute)/1000,settled=Date.parse(row.settled_at)/1000;
    if(row.status!=='confirmed'||row.result!=='win'||row.account_type!=='PRACTICE'
      ||!row.iq_option_id||!/^\d+$/.test(row.iq_option_id)||!row.signal_id||seen.has(row.signal_id)
      ||!Number.isFinite(at)||!Number.isFinite(settled)||at+60>settled||settled>=entry)return [];
    const f=preEntryPattern(row.candles,at,row.direction);
    if(!f)return [];
    seen.add(row.signal_id);
    return [{f,result:'win',signal_id:row.signal_id,asset:row.asset,entry_minute:row.entry_minute}];
  });
}

/** More than 10 similar WINs, spread over at least 3 different assets. */
export const PATTERN_MIN_SIMILAR_WINS=11;
export const PATTERN_MIN_DISTINCT_ASSETS=3;

export function matchWinningPattern(samples:ReturnType<typeof winningReferenceSamples>,candles:unknown,entry:number,direction:string,minMovementPct=0) {
  const movement=preEntryMovementPct(candles,entry);
  if(movement==null||movement<Math.max(0,minMovementPct))return null;
  const f=preEntryPattern(candles,entry,direction);
  if(!f)return null;
  // Every similar prior WIN counts; require a broad cohort across different assets, not one lucky chart.
  const similar=samples.flatMap(s=>{const m=demoWinningPatternMatch([s],f);return m?[m]:[];})
    .sort((a,b)=>a.distance-b.distance||String(a.signal_id).localeCompare(String(b.signal_id)));
  const assets=new Set(similar.map(m=>m.asset).filter(Boolean));
  if(similar.length<PATTERN_MIN_SIMILAR_WINS||assets.size<PATTERN_MIN_DISTINCT_ASSETS)return null;
  const match=similar[0];
  return {signal_id:match.signal_id,asset:match.asset,entry_minute:match.entry_minute,distance:match.distance,
    similar_wins:similar.length,distinct_assets:assets.size,rule_version:'demo-pattern-multi-asset-v2'};
}