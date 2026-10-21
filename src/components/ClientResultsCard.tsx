import { useMemo, useState } from 'react';
import { BarChart3, Loader2, ChevronLeft, ChevronRight, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useClientCopyResults } from '@/hooks/useClientCopyResults';
import { useClientCopyHistory } from '@/hooks/useClientCopyHistory';
import { brtDayKey, dayLabel } from '@/components/dayLabel';
import { useMasterIQResults } from '@/hooks/useMasterIQResults';
import { entryOriginLabel } from '@/lib/entry-origin-labels';
import type { MasterIQOperation as Op } from '@/lib/master-iq-results';

// Mesmo formato e mesmas entradas do card "Entradas na IQ Option" do admin (entradas reais do principal),
// mas quando o cliente copiou a entrada, o resultado exibido é o da cópia dele, com o valor de entrada do cliente.
// O campo "Operações Abertas" continua mostrando as cópias abertas da própria conta do cliente.
type Row = Op & { origin: string };

const PAGE_SIZE = 12;

export function ClientResultsCard() {
  const { user } = useAuth();
  const userId = user?.id || '';
  const { operations, isError } = useMasterIQResults();
  const [page, setPage] = useState(0);
  const [showOpen, setShowOpen] = useState(true);
  const liveResults = useClientCopyResults();
  const history = useClientCopyHistory();
  const openOperations = liveResults.operations.filter(op => ['pending', 'open'].includes(op.result));

  // Mapa: signal_id do principal -> cópia do cliente (mesmo signal_id embutido após o prefixo copy-<user>-).
  const copyBySignal = useMemo(() => {
    const map = new Map<string, { result: string; profit: number; iq_option_id: string | null }>();
    if (!userId) return map;
    const prefix = `copy-${userId}-`;
    for (const op of history.operations) {
      if (!op.signal_id.startsWith(prefix)) continue;
      const masterSignal = op.signal_id.slice(prefix.length);
      if (!masterSignal || map.has(masterSignal)) continue;
      map.set(masterSignal, { result: op.result, profit: Number(op.profit || 0), iq_option_id: op.iq_option_id ?? null });
    }
    return map;
  }, [history.operations, userId]);

  // 21/10/2026: Vela de Força saiu das entradas reais e não aparece mais neste card.
  const ops: Row[] = useMemo(() => operations
    .filter(r => r.entry_strategy !== 'FORCE_LOSS_WIN' && r.entry_strategy !== 'FORCA_INVERTIDA' && r.entry_strategy !== 'VELA_FORCA')
    .map((r) => ({ ...r, profit: Number(r.profit || 0), origin: entryOriginLabel(r.entry_strategy) })), [operations]);

  // Valores exibidos: cópia do cliente quando existir; senão o valor do principal.
  const displayRows = useMemo(() => ops.map((o) => {
    const copy = copyBySignal.get(o.signal_id);
    if (!copy) return { ...o, copied: false, displayProfit: o.profit, displayResult: o.result, displayId: o.iq_option_id };
    const settled = ['win', 'loss', 'draw', 'tie'].includes(copy.result.toLowerCase());
    return { ...o, copied: true, displayProfit: copy.profit, displayResult: settled ? copy.result.toLowerCase() : 'open', displayId: copy.iq_option_id ?? o.iq_option_id };
  }), [ops, copyBySignal]);

  const total = displayRows.reduce((s, o) => s + o.displayProfit, 0);
  const wins = displayRows.filter((o) => o.displayResult === 'win').length;
  const losses = displayRows.filter((o) => o.displayResult === 'loss').length;
  const pct = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;
  const pageCount = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageOps = displayRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const dayScores = useMemo(() => {
    const scores = new Map<string, { w: number; l: number; p: number }>();
    for (const op of displayRows) {
      const key = brtDayKey(op.created_at);
      const score = scores.get(key) || { w: 0, l: 0, p: 0 };
      if (op.displayResult === 'win') score.w++;
      if (op.displayResult === 'loss') score.l++;
      scores.set(key, score);
    }
    for (const score of scores.values()) score.p = score.w + score.l ? Math.round(score.w / (score.w + score.l) * 100) : 0;
    return scores;
  }, [displayRows]);
  const scoreFor = (iso: string) => dayScores.get(brtDayKey(iso)) || { w: 0, l: 0, p: 0 };

  return (
    <Card className="p-3 sm:p-4 border-border/50">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entradas na IQ Option</span>
        <span className="font-mono text-xs ml-auto mr-2">
          <span className="text-call">✓{wins}</span> <span className="text-put">✗{losses}</span>{' '}
          <span className="text-gold">{pct}%</span>
        </span>
        <span className={cn('font-mono text-sm font-bold', total >= 0 ? 'text-call' : 'text-put')}>
          {total >= 0 ? '+' : '−'}US$ {Math.abs(total).toFixed(2)}
        </span>
      </div>

      <div className="border-y border-border/50 my-3 py-2">
        <Button variant="ghost" className="w-full justify-between px-0 h-8" onClick={() => setShowOpen(!showOpen)} aria-expanded={showOpen} aria-controls="client-open-operations">
          <span className="flex items-center gap-2 text-xs"><Activity className="w-4 h-4 text-primary" />Operações Abertas <span className="font-mono">({openOperations.length})</span></span>
          {showOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        {showOpen && <div id="client-open-operations" className="space-y-2 py-2">
          {liveResults.isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            : liveResults.isError ? <p className="text-xs text-destructive text-center">Não foi possível atualizar as operações abertas.</p>
            : openOperations.length === 0 ? <p className="text-xs text-muted-foreground text-center">Nenhuma operação aberta.</p>
            : openOperations.map(op => <div key={op.id} className="flex items-center gap-2 text-xs border-b border-border/50 pb-2">
              <span className="text-muted-foreground font-mono">{new Date(op.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{op.asset}</span><span className="block truncate text-[9px] text-muted-foreground font-mono">#{op.iq_option_id}</span></span>
              <span className={op.direction === 'CALL' ? 'text-call' : 'text-put'}>{op.direction}</span>
              <span className="text-gold">Aberta</span>
            </div>)}
        </div>}
      </div>

      {isError ? (
        <p className="text-xs text-destructive py-4 text-center">Não foi possível atualizar as entradas.</p>
      ) : displayRows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma entrada real em dias anteriores</p>
      ) : (
        <>
          <div className="space-y-1">
            {pageOps.map((o, i) => (
              <div key={o.id}>
                {(i === 0 || brtDayKey(pageOps[i - 1].created_at) !== brtDayKey(o.created_at)) && (() => {
                  const s = scoreFor(o.created_at);
                  return (
                    <div className="flex items-center justify-between pt-2 pb-0.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gold">{dayLabel(o.created_at)}</div>
                      <div className="font-mono text-[10px]">
                        <span className="text-call">✓{s.w}</span> <span className="text-put">✗{s.l}</span> <span className="text-gold">{s.p}%</span>
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
                    <span className="font-mono text-[9px] text-muted-foreground truncate">#{o.displayId}</span>
                  </span>
                  <span className="px-1.5 rounded text-[10px] border border-border text-muted-foreground">
                    {o.origin}
                  </span>
                  <span className={o.direction === 'CALL' ? 'text-call' : 'text-put'}>{o.direction}</span>
                  <span className="ml-1 w-16 text-right font-mono">
                    {o.displayResult === 'win' ? <span className="text-call">+{o.displayProfit.toFixed(2)}</span>
                      : o.displayResult === 'loss' ? <span className="text-put">{o.displayProfit.toFixed(2)}</span>
                      : <span className="text-muted-foreground">aberta</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft className="h-3 w-3 mr-1" /> Anterior
            </Button>
            <span className="text-[10px] text-muted-foreground font-mono">{safePage + 1}/{pageCount}</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
              Próxima <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
