import type { Candle } from './bias.ts';
import { previousCandles } from './previous-candles.ts';
// Read-only counterfactual at T-60. Pattern inputs end at T-120.
export function forceEarly(candles: Candle[], entry: number, direction: string) {
  const early = Math.floor(entry / 60) * 60 - 60;
  const prior = previousCandles(candles, early, direction);
  if (prior.coverage !== 'OK') return { coverage: 'MISSING' };
  const map = new Map(candles.map(c => [c.t, c]));
  const target = map.get(early), last = map.get(early - 60), prev = map.get(early - 120);
  if (!target || !last || !prev || ![target.o,target.c,target.h,target.l].every(Number.isFinite)
    || target.l > Math.min(target.o,target.c) || target.h < Math.max(target.o,target.c)) return { coverage: 'MISSING' };
  const sign = direction === 'CALL' ? 1 : -1;
  const range = last.h-last.l, body = Math.abs(last.c-last.o);
  const before = Array.from({length:20},(_,i)=>map.get(early-(i+2)*60));
  if (before.some(k=>!k) || range<=0) return { coverage: 'MISSING' };
  const mean = before.reduce((sum,k)=>sum+(k ? Math.abs(k.c-k.o) : 0),0)/20;
  const cs = Array.from({length:100},(_,i)=>map.get(early-(100-i)*60));
  let ema9=cs[0]?.c ?? 0, ema21=ema9, gain=0, loss=0;
  for(let i=1;i<cs.length;i++) {
    const k=cs[i],p=cs[i-1]; if(!k||!p) return {coverage:'MISSING'};
    const delta=k.c-p.c;
    ema9+=0.2*(k.c-ema9); ema21+=2/22*(k.c-ema21);
    gain=i<=14 ? gain+Math.max(delta,0)/14 : (gain*13+Math.max(delta,0))/14;
    loss=i<=14 ? loss+Math.max(-delta,0)/14 : (loss*13+Math.max(-delta,0))/14;
  }
  const sma50=cs.slice(50).reduce((s,k)=>s+(k?.c??0),0)/50;
  const rsi=loss===0 ? gain===0?50:100 : 100-100/(1+gain/loss);
  const aligned=sign===1 ? ema9>ema21 && ema21>sma50 && last.c>ema21 : ema9<ema21 && ema21<sma50 && last.c<ema21;
  const firstCountertrend=sign*(last.c-last.o)<0 && sign*(prev.c-prev.o)>0;
  const bodyShare=body/range, bodyMeanRatio=mean>0?body/mean:null;
  // Rejection in intended direction: lower wick for CALL, upper wick for PUT.
  const rejection=(sign===1 ? Math.min(last.o,last.c)-last.l : last.h-Math.max(last.o,last.c))/range;
  let opposingStreak=0;
  for(let i=1;i<=100;i++) { const k=map.get(early-i*60); if(!k||sign*(k.c-k.o)>=0)break; opposingStreak++; }
  const delta=sign*(target.c-target.o);
  return {coverage:'OK',earlyMinute:early,lastClosed:early,earlyResult:delta>0?'win':delta<0?'loss':'tie',
    earlyProfit:delta>0?8.5:delta<0?-10:0,earlyOpen:target.o,earlyClose:target.c,
    bodyShare,bodyMeanRatio,rejection,opposingStreak,firstCountertrend,aligned,rsi,
    v3ShapeRsiOnly:firstCountertrend && bodyShare<=0.65 && bodyMeanRatio!==null && bodyMeanRatio<=0.85 && aligned && rsi>=(sign===1?40:25) && rsi<=(sign===1?75:60),
    smallRejection:bodyShare<=0.35 && rejection>=0.5,
    sequenceRejection:bodyShare<=0.35 && rejection>=0.5 && opposingStreak>=3,
    volumeAvailable:false,priceBasis:'historical_open_simulation_not_broker_fill'};
}