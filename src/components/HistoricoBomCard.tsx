import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

type Op = { id: string; asset: string; direction: string; result: string; created_at: string };

const startOfBrtDay = () => {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3)).toISOString();
};

export const HistoricoBomCard = () => {
  const [ops, setOps] = useState<Op[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('operation_results')
        .select('id, asset, direction, result, created_at')
        .eq('timeframe', 'TEST').eq('entry_strategy', 'HISTORICO')
        .gte('created_at', startOfBrtDay())
        .order('created_at', { ascending: false }).limit(200);
      setOps((data as Op[]) || []);
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const wins = ops.filter((o) => o.result === 'win').length;
  const losses = ops.filter((o) => o.result === 'loss').length;
  const pct = wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0;

  return (
    <Card className="p-3 sm:p-4 h-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estratégia Histórico bom (teste)</span>
        <span className="font-mono text-xs">
          <span className="text-emerald-500">✓{wins}</span> <span className="text-rose-500">✗{losses}</span> <span className="text-amber-500">{pct}%</span>
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-2">Só teste: ativo+direção com ≥3 operações e ≥60% de acerto em 24h. Não usa dinheiro.</p>
      {ops.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma entrada hoje</p>
      ) : (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {ops.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-xs border-b border-border/50 py-1">
              <span className="font-mono text-muted-foreground">
                {new Date(o.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="font-medium flex-1 ml-2 truncate">{o.asset}</span>
              <span className={o.direction === 'CALL' ? 'text-emerald-500' : 'text-rose-500'}>{o.direction}</span>
              <span className="ml-2 w-14 text-right">
                {o.result === 'win' ? <span className="text-emerald-500">ganho</span>
                  : o.result === 'loss' ? <span className="text-rose-500">perda</span>
                  : <span className="text-muted-foreground">aberta</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
