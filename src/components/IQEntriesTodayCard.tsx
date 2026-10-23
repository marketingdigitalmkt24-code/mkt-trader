import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dayLabel, brtDayKey } from './dayLabel';
import { useMasterIQResults } from '@/hooks/useMasterIQResults';
import { clientDayStart } from '@/lib/client-copy-results';
import type { MasterIQOperation as Op } from '@/lib/master-iq-results';

type Row = Op & { origin: string };

const PAGE_SIZE = 12;

export const IQEntriesTodayCard = () => {
  const { operations, isError } = useMasterIQResults();
  const [page, setPage] = useState(0);
  const ops: Row[] = useMemo(() => operations.filter(r => r.entry_strategy !== 'FORCE_LOSS_WIN' && r.entry_strategy !== 'FORCA_INVERTIDA').map((r) => {
        const base = r.entry_strategy === 'RETOMADA' ? '📐 Retomada' : r.entry_strategy === 'VELA_FORCA' ? '🕯️ Vela de Força' : r.entry_strategy === 'FORCA_INVERTIDA' ? '🔄 Força Invertida' : r.entry_strategy === 'THREE_FORCE' ? '🕯️ Após 3 Velas de Força' : r.entry_strategy === 'FOUR_WIN_REVERSAL' ? '🔄 Após 4 ganhos' : r.entry_strategy === 'TENDENCIA' ? 'Tendência' : r.entry_strategy === 'TENDENCIA_V1' ? '📐 Tendência V1' : r.entry_strategy === 'HISTORICO' ? '📜 Histórico bom' : r.entry_strategy === 'EMPATE' ? '🤝 Empate' : r.entry_strategy === 'REVERSAO_RSI' ? '🔄 Reversão RSI' : 'Não identificada';
        return { ...r, profit: Number(r.profit || 0), origin: r.entry_strategy === 'TENDENCIA_3_LOSS_PUT' ? 'Tendência 3 perdas → Venda' : r.entry_strategy === 'FORCA_ANTECIPADA' ? 'Antecipação de Força' : base };
      }), [operations]);
  const todayStart = clientDayStart();
  const todayOps = operations.filter((o) => o.created_at >= todayStart);
  const total = todayOps.reduce((s, o) => s + Number(o.profit || 0), 0);
  const wins = todayOps.filter((o) => o.result === 'win').length;
  const losses = todayOps.filter((o) => o.result === 'loss').length;
  const pct = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;
  const pageCount = Math.max(1, Math.ceil(ops.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageOps = ops.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const dayScores = useMemo(() => {
    const scores = new Map<string, { w: number; l: number; p: number }>();
    for (const op of ops) {
      const key = brtDayKey(op.created_at);
      const score = scores.get(key) || { w: 0, l: 0, p: 0 };
      if (op.result === 'win') score.w++;
      if (op.result === 'loss') score.l++;
      scores.set(key, score);
    }
    for (const score of scores.values()) score.p = score.w + score.l ? Math.round(score.w / (score.w + score.l) * 100) : 0;
    return scores;
  }, [ops]);
  const scoreFor = (iso: string) => dayScores.get(brtDayKey(iso)) || { w: 0, l: 0, p: 0 };

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
      {isError ? (
        <p className="text-xs text-destructive py-4 text-center">Não foi possível atualizar as entradas.</p>
      ) : ops.length === 0 ? (
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
                    : ['tie', 'draw', 'equal'].includes(o.result) ? <span className="text-muted-foreground">empate</span>
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
