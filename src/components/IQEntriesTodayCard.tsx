import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

type Op = { id: string; asset: string; direction: string; result: string; profit: number; created_at: string };

const startOfBrtDay = () => {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3)).toISOString();
};

export const IQEntriesTodayCard = () => {
  const [ops, setOps] = useState<Op[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('operation_results')
        .select('id, asset, direction, result, profit, created_at')
        .neq('timeframe', 'TEST').neq('timeframe', 'MT5')
        .gte('created_at', startOfBrtDay())
        .order('created_at', { ascending: false }).limit(50);
      setOps((data as Op[]) || []);
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const total = ops.reduce((s, o) => s + Number(o.profit || 0), 0);

  return (
    <Card className="p-3 sm:p-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entradas na IQ Option hoje</span>
        <span className={`font-mono text-sm font-bold ${total >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
          {total >= 0 ? '+' : ''}US$ {total.toFixed(2)}
        </span>
      </div>
      {ops.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma entrada real hoje</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {ops.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-xs border-b border-border/50 py-1">
              <span className="font-mono text-muted-foreground">
                {new Date(o.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="font-medium flex-1 ml-2 truncate">{o.asset}</span>
              <span className={o.direction === 'CALL' ? 'text-emerald-500' : 'text-rose-500'}>{o.direction}</span>
              <span className="ml-2 w-20 text-right font-mono">
                {o.result === 'win' ? <span className="text-emerald-500">+{Number(o.profit).toFixed(2)}</span>
                  : o.result === 'loss' ? <span className="text-rose-500">{Number(o.profit).toFixed(2)}</span>
                  : <span className="text-muted-foreground">aberta</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
