import type { PatternCandle } from '@/lib/demo-winning-patterns';
export function DemoPatternChart({candles,direction}:{candles:PatternCandle[];direction:string}) {
 if(!candles.length)return <p className="text-xs text-muted-foreground">Velas indisponíveis.</p>;
 const hi=Math.max(...candles.map(c=>c.h)),lo=Math.min(...candles.map(c=>c.l)),span=hi-lo||1;
 const step=280/(candles.length+1),y=(v:number)=>8+(hi-v)/span*124;
 return <div><p className={`mb-2 text-xs ${direction==='CALL'?'text-call':'text-put'}`}>{direction==='CALL'?'↑ CALL':'↓ PUT'} · 20 velas anteriores</p><svg viewBox="0 0 300 150" className="w-full" role="img" aria-label="Padrão antes da entrada, últimas cinco velas destacadas">
  <rect x={10+(candles.length-5)*step} y="4" width={5*step} height="132" className="fill-primary/10"/>
  {candles.map((c,i)=>{const x=10+(i+.5)*step;return <g key={c.t} className={c.c>=c.o?'fill-call stroke-call':'fill-put stroke-put'}><line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} strokeWidth="1"/><rect x={x-step*.3} width={step*.6} y={y(Math.max(c.o,c.c))} height={Math.max(1,Math.abs(y(c.o)-y(c.c)))}/></g>;})}
  <line x1={10+candles.length*step} x2={10+candles.length*step} y1="4" y2="136" className="stroke-muted-foreground" strokeDasharray="3 3"/>
  <text x={10+candles.length*step} y="147" textAnchor="middle" className="fill-muted-foreground text-[9px]">Entrada</text>
 </svg></div>;
}