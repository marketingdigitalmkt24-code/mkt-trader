import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Pos {
  id: string;
  symbol: string;
  direction: 'CALL' | 'PUT';
  entry_price: number;
  stop_price: number;
  target_price: number;
  risk_distance: number;
  result_kind: 'win' | 'loss' | 'time' | null;
  result_r: number | null;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
}

const fmt = (v: number, sym: string) => {
  const d = sym.includes('JPY') ? 3 : 5;
  return v.toFixed(d);
};

const timeBrt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
};

const KIND_LABEL: Record<string, string> = { win: '🎯 Alvo', loss: '🛑 Stop', time: '⏱️ Tempo (2h)' };

export function StopTargetTestCard() {
  const [positions, setPositions] = useState<Pos[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE = 10;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data } = await supabase
          .from('stop_target_positions')
          .select('*')
          .order('opened_at', { ascending: false })
          .limit(200);
        if (alive && data) setPositions(data as Pos[]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const open = positions.filter(p => p.status === 'open');
  const closed = positions.filter(p => p.status === 'closed');
  const wins = closed.filter(p => p.result_kind === 'win').length;
  const losses = closed.filter(p => p.result_kind === 'loss').length;
  const timeouts = closed.filter(p => p.result_kind === 'time').length;
  const totalR = closed.reduce((s, p) => s + (p.result_r ?? 0), 0);
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : 0;
  const closedSorted = [...closed].sort((a, b) => (b.closed_at || '').localeCompare(a.closed_at || ''));
  const pages = Math.max(1, Math.ceil(closedSorted.length / PAGE));
  const pageItems = closedSorted.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-primary" />
          </div>
          Teste Stop/Alvo
          <Badge className="ml-auto text-xs bg-amber-500/20 text-amber-500 border-amber-500/30">SIMULADO</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Forex na IQ Option, gráfico 5 min, tendência 9/21/50 com recuo na média 21. Stop 1x ATR, alvo 2x, saída em 2h. Risco simulado de US$ 10 por entrada.
        </p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Abertas</p>
            <p className="text-lg font-bold text-foreground">{open.length}</p>
          </div>
          <div className="p-2 rounded-lg bg-call/10 border border-call/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Acerto</p>
            <p className="text-lg font-bold text-call">{winRate}%</p>
          </div>
          <div className="p-2 rounded-lg bg-put/10 border border-put/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Resultado</p>
            <p className={`text-lg font-bold ${totalR >= 0 ? 'text-call' : 'text-put'}`}>{totalR >= 0 ? '+' : ''}{totalR.toFixed(1)}R</p>
          </div>
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">US$ sim.</p>
            <p className={`text-lg font-bold ${totalR >= 0 ? 'text-call' : 'text-put'}`}>${(totalR * 10).toFixed(0)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 text-center text-xs">
          <div className="p-1.5 rounded bg-call/5 text-call">🎯 Alvos: {wins}</div>
          <div className="p-1.5 rounded bg-put/5 text-put">🛑 Stops: {losses}</div>
          <div className="p-1.5 rounded bg-muted text-muted-foreground">⏱️ Tempo: {timeouts}</div>
        </div>

        {open.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Posições abertas</p>
            <div className="space-y-1.5">
              {open.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-semibold ${p.direction === 'CALL' ? 'text-call' : 'text-put'}`}>
                      {p.direction === 'CALL' ? '▲' : '▼'} {p.direction}
                    </span>
                    <span className="font-medium truncate">{p.symbol}</span>
                    <span className="text-muted-foreground">{timeBrt(p.opened_at)}</span>
                  </div>
                  <div className="text-right shrink-0 text-muted-foreground">
                    <span className="text-put">{fmt(p.stop_price, p.symbol)}</span>
                    {' · '}
                    <span className="text-foreground">{fmt(p.entry_price, p.symbol)}</span>
                    {' · '}
                    <span className="text-call">{fmt(p.target_price, p.symbol)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Fechadas ({closed.length})</p>
          {loading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : closed.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma posição fechada ainda — aguardando a primeira entrada.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {pageItems.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-semibold ${p.direction === 'CALL' ? 'text-call' : 'text-put'}`}>
                        {p.direction === 'CALL' ? '▲' : '▼'}
                      </span>
                      <span className="font-medium truncate">{p.symbol}</span>
                      <span className="text-muted-foreground">{timeBrt(p.closed_at || p.opened_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{KIND_LABEL[p.result_kind || ''] || p.result_kind}</span>
                      <span className={`font-bold ${(p.result_r ?? 0) >= 0 ? 'text-call' : 'text-put'}`}>
                        {(p.result_r ?? 0) >= 0 ? '+' : ''}{(p.result_r ?? 0).toFixed(1)}R
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground">{page + 1}/{pages}</span>
                  <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
