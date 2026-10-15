import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChartCandlestick, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const candles = Array.from({ length: 90 }, (_, i) => {
  const open = 1.084 + i * 0.000018 + Math.sin(i * 0.7) * 0.00018;
  const close = open + Math.sin(i * 1.9 + 1) * 0.00013 + 0.000025;
  return { open, close, high: Math.max(open, close) + 0.00008, low: Math.min(open, close) - 0.00007 };
});

export function SimulatedTradingChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [tick, setTick] = useState(0);
  const [asset, setAsset] = useState('EUR/USD');
  useEffect(() => {
    if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setTick(v => (v + 1) % 24), 1800);
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio; canvas.height = height * ratio;
      ctx.scale(ratio, ratio);
      const tokens = getComputedStyle(document.documentElement);
      const color = (name: string) => `hsl(${tokens.getPropertyValue(name).trim()})`;
      const border = color('--border'), muted = color('--muted-foreground'), call = color('--call'), put = color('--put');
      ctx.clearRect(0, 0, width, height);
      const visible = candles.slice(tick, tick + (width < 600 ? 30 : 54));
      const top = Math.max(...visible.map(c => c.high)) + 0.0002;
      const bottom = Math.min(...visible.map(c => c.low)) - 0.0002;
      const chartWidth = width - 68, chartHeight = height - 38;
      const y = (price: number) => 18 + (top - price) / (top - bottom) * (chartHeight - 30);
      ctx.font = '11px "JetBrains Mono", monospace';
      for (let row = 0; row < 6; row++) {
        const lineY = 20 + row * (chartHeight - 20) / 5;
        ctx.strokeStyle = border; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, lineY); ctx.lineTo(chartWidth, lineY); ctx.stroke();
        ctx.fillStyle = muted; ctx.fillText((top - row * (top - bottom) / 5).toFixed(5), chartWidth + 7, lineY + 4);
      }
      const gap = chartWidth / visible.length;
      visible.forEach((c, i) => {
        const x = gap * (i + 0.5);
        ctx.strokeStyle = c.close >= c.open ? call : put;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.moveTo(x, y(c.high)); ctx.lineTo(x, y(c.low)); ctx.stroke();
        ctx.fillRect(x - gap * 0.28, Math.min(y(c.open), y(c.close)), gap * 0.56, Math.max(2, Math.abs(y(c.close) - y(c.open))));
        if (i % 10 === 3) {
          ctx.fillStyle = call; ctx.beginPath(); ctx.moveTo(x, y(c.low) + 9); ctx.lineTo(x - 5, y(c.low) + 18); ctx.lineTo(x + 5, y(c.low) + 18); ctx.fill();
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.fillText('+$8.20', Math.max(2, x - 22), y(c.low) + 33);
        }
        if (i % 10 === 0) {
          ctx.fillStyle = muted; ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillText(`10:${String(i + tick).padStart(2, '0')}`, Math.max(0, x - 15), height - 10);
        }
      });
    };
    draw();
    const observer = new ResizeObserver(draw); observer.observe(canvas);
    return () => observer.disconnect();
  }, [tick, asset]);

  return (
    <section className="border-y border-border bg-card/40" aria-label="Gráfico demonstrativo de operações simuladas">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-5">
          <div className="flex items-center gap-3">
            <ChartCandlestick className="h-6 w-6 text-call" />
            <div><h2 className="text-base font-semibold">IQ Option <span className="text-muted-foreground font-normal">/ Simulação</span></h2><p className="mt-1 text-xs text-muted-foreground">Cenário ilustrativo · dados fictícios</p></div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={asset} onValueChange={setAsset}><SelectTrigger className="w-32 font-mono text-xs" aria-label="Ativo da simulação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EUR/USD">EUR/USD</SelectItem><SelectItem value="GBP/USD">GBP/USD</SelectItem><SelectItem value="USD/JPY">USD/JPY</SelectItem></SelectContent></Select>
            <span className="text-xs font-mono text-muted-foreground">M1</span>
            <Button size="icon" variant="outline" onClick={() => setPlaying(v => !v)} aria-label={playing ? 'Pausar simulação' : 'Reproduzir simulação'} title={playing ? 'Pausar simulação' : 'Reproduzir simulação'}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
          </div>
        </div>
        <canvas ref={canvasRef} className="block h-[360px] w-full sm:h-[440px]" role="img" aria-label={`Velas fictícias de ${asset}, com entradas de demonstração e ganhos simulados de 8,20 dólares`} />
        <div className="grid grid-cols-2 gap-4 border-t border-border py-5 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Resultado simulado</p><p className="mt-1 font-mono text-xl text-call">+$32.80</p></div>
          <div><p className="text-xs text-muted-foreground">Entradas simuladas</p><p className="mt-1 font-mono text-xl">04</p></div>
          <div><p className="text-xs text-muted-foreground">Ganhos / perdas simulados</p><p className="mt-1 font-mono text-xl"><span className="text-call">4</span> / 0</p></div>
          <div><p className="text-xs text-muted-foreground">Acerto neste exemplo</p><p className="mt-1 font-mono text-xl text-call">100%</p></div>
        </div>
      </div>
      <div className="border-t border-border bg-background/50"><div className="mx-auto flex max-w-7xl flex-wrap gap-x-8 gap-y-3 px-4 py-4 sm:px-8">{[0, 1, 2, 3].map(i => <div key={i} className="flex items-center gap-2 text-xs font-mono"><ArrowUpRight className="h-4 w-4 text-call" /><span>{asset}</span><span className="text-muted-foreground">10:{String(3 + i * 10).padStart(2, '0')}</span><Check className="h-3 w-3 text-call" /><span className="text-call">+$8.20</span></div>)}</div></div>
    </section>
  );
}
