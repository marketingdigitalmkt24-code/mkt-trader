import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dayLabel, brtDayKey, historyStart } from './dayLabel';

type Op = { id: string; asset: string; direction: string; result: string; profit: number; created_at: string; timeframe: string; entry_strategy: string | null; iq_option_id: string | null };
type Row = Op & { origin: string };

const PAGE_SIZE = 12;

const startOfBrtDay = () => {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3)).toISOString();
};

export const IQEntriesTodayCard = () => {
  const [ops, setOps] = useState<Row[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('operation_results')
        .select('id, asset, direction, result, profit, created_at, timeframe, entry_strategy, iq_option_id')
        .neq('timeframe', 'MT5')
        .neq('timeframe', 'TEST')
        .not('iq_option_id', 'is', null)
        .gte('created_at', historyStart())
        .order('created_at', { ascending: false }).limit(1000);
      const all = ((data as Op[]) || []).filter((o) => o.iq_option_id && !String(o.iq_option_id).toLowerCase().startsWith('test'));
      // Somente ordens reais aceitas pela IQ Option (com número de ordem).
      const withOrigin = all.map((r) => {
        const base = r.entry_strategy === 'FOUR_WIN_REVERSAL' ? '🔄 Após 4 ganhos' : r.entry_strategy === 'TENDENCIA' ? 'Tendência' : r.entry_strategy === 'TENDENCIA_V1' ? '📐 Tendência V1' : r.entry_strategy === 'HISTORICO' ? '📜 Histórico bom' : r.entry_strategy === 'EMPATE' ? '🤝 Empate' : r.entry_strategy === 'REVERSAO_RSI' ? '🔄 Reversão RSI' : 'Não identificada';
        return { ...r, profit: Number(r.profit || 0), origin: base };
      });
      setOps(withOrigin);
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const todayStart = startOfBrtDay();
  const todayOps = ops.filter((o) => o.created_at >= todayStart);
  const total = todayOps.reduce((s, o) => s + Number(o.profit || 0), 0);
  const wins = todayOps.filter((o) => o.result === 'win').length;
  const losses = todayOps.filter((o) => o.result === 'loss').length;
  const pct = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;
  const pageCount = Math.max(1, Math.ceil(ops.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageOps = ops.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const scoreFor = (iso: string) => {
    const key = brtDayKey(iso);
    const dayOps = ops.filter((o) => brtDayKey(o.created_at) === key);
    const w = dayOps.filter((o) => o.result === 'win').length;
    const l = dayOps.filter((o) => o.result === 'loss').length;
    const p = w + l ? Math.round((w / (w + l)) * 100) : 0;
    return { w, l, p };
  };

  return (
    <Card className="p-3 sm:p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entradas na IQ Option (hoje)</span>
        <span className="font-mono text-xs ml-auto mr-2">
          <span className="text-emerald-500">✓{wins}</span> <span className="text-rose-500">✗{losses}</span> <span className="text-amber-500">{pct}%</span>
        </span>
        <span className={`font-mono text-sm font-bold ${total >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
          {total >= 0 ? '+' : ''}US$ {total.toFixed(2)}
        </span>
      </div>
      {ops.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma entrada real nos últimos 30 dias</p>
      ) : (
        <>
          <div className="space-y-1 flex-1">
            {pageOps.map((o, i) => (
              <div key={o.id}>
                  {(i === 0 || brtDayKey(pageOps[i - 1].created_at) !== brtDayKey(o.created_at)) && (() => {
                    const s = scoreFor(o.created_at);
                    return (
                  <div className="flex items-center justify-between pt-2 pb-0.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">{dayLabel(o.created_at)}</div>
                    <div className="font-mono text-[10px] tracking-normal">
                      <span className="text-emerald-500">✓{s.w}</span> <span className="text-rose-500">✗{s.l}</span> <span className="text-amber-500">{s.p}%</span>
                    </div>
                  </div>
                    );
                  })()}
              <div className="flex items-center justify-between text-xs border-b border-border/50 py-1 gap-1">
                <span className="font-mono text-muted-foreground">
                  {new Date(o.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex-1 ml-1 min-w-0 flex flex-col leading-tight">
                  <span className="font-medium truncate">{o.asset}</span>
                  <span className="font-mono text-[9px] text-muted-foreground truncate">#{o.iq_option_id}</span>
                </span>
                <span className="px-1.5 rounded text-[10px] border border-border text-muted-foreground">
                  {o.origin}
                </span>
                <span className={o.direction === 'CALL' ? 'text-emerald-500' : 'text-rose-500'}>{o.direction}</span>
                <span className="ml-1 w-16 text-right font-mono">
                  {o.result === 'win' ? <span className="text-emerald-500">+{Number(o.profit).toFixed(2)}</span>
                    : o.result === 'loss' ? <span className="text-rose-500">{Number(o.profit).toFixed(2)}</span>
                    : <span className="text-muted-foreground">aberta</span>}
                </span>
              </div>
              </div>
            ))}
          </div>
          {ops.length > 0 && (
            <div className="flex items-center justify-between mt-2">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="h-3 w-3 mr-1" /> Anterior
              </Button>
              <span className="text-[10px] text-muted-foreground font-mono">{safePage + 1}/{pageCount}</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                Próxima <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};
