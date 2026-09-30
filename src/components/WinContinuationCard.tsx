import { useEffect, useState } from 'react';
import { Repeat, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface Op { id: string; asset: string; direction: string; result: string; profit: number; created_at: string; }

export function WinContinuationCard() {
  const [ops, setOps] = useState<Op[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from('operation_results')
      .select('id, asset, direction, result, profit, created_at')
      .like('signal_id', 'cont-%')
      .order('created_at', { ascending: false })
      .limit(15);
    if (data) setOps(data as Op[]);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    const ch = supabase.channel('win-cont')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_results' }, load)
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  const closed = ops.filter(o => o.result === 'win' || o.result === 'loss');
  const wins = closed.filter(o => o.result === 'win').length;
  const total = closed.reduce((s, o) => s + (o.profit || 0), 0);

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold">Continuação Pós-Win</h3>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {wins}/{closed.length} wins · <span className={cn('ml-1', total >= 0 ? 'text-call' : 'text-put')}>{total >= 0 ? '+' : '-'}${Math.abs(total).toFixed(2)}</span>
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">Após um WIN, entra na próxima vela no mesmo ativo e direção.</p>
        {ops.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3 bg-secondary/30 rounded-lg">Nenhuma entrada desta estratégia ainda</div>
        ) : (
          <div className="space-y-1">
            {ops.map(o => {
              const color = o.result === 'win' ? 'text-call' : o.result === 'loss' ? 'text-put' : 'text-gold';
              const bg = o.result === 'win' ? 'bg-call/10' : o.result === 'loss' ? 'bg-put/10' : 'bg-gold/10';
              return (
                <div key={o.id} className={cn('flex items-center justify-between p-2 rounded-lg text-xs', bg)}>
                  <div className="flex items-center gap-2">
                    {o.direction.toUpperCase() === 'CALL' ? <TrendingUp className="w-3 h-3 text-call" /> : <TrendingDown className="w-3 h-3 text-put" />}
                    <span className="font-medium">{o.asset}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(o.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className={cn('font-mono font-bold', color)}>
                    {o.result === 'pending' || o.result === 'open' ? '⏳' : `${o.profit >= 0 ? '+' : '-'}$${Math.abs(o.profit).toFixed(2)}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
