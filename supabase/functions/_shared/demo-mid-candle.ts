export const DEMO_MID_CANDLE = 'PADRAO_MEIO_V1';
export const midCandleSignal = (source:string) => `demo-mid-v1-${source}`;
export const midCandleTime = (minute:string) => Date.parse(minute)+30000;
export const midCandleExpiry = (at:string) => Math.floor(Date.parse(at)/60000)*60+60;
export function freshMidCandle(row:{signal_id:string;entry_strategy?:string;created_at:string;direction:string},now:number) {
 const at=Date.parse(row.created_at);
 return row.signal_id.startsWith('demo-mid-v1-') && row.entry_strategy===DEMO_MID_CANDLE && ['CALL','PUT'].includes(row.direction)
  && Number.isFinite(at) && at%60000===30000 && now>=at && now-at<=2000;
}
