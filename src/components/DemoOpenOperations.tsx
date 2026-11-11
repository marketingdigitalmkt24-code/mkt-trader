import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from './ui/badge';
import { demoStrategyNames } from './DemoTestOperations';

type OpenOperation = {
  asset: string; score: number | null; direction: string; strategy: string;
  amount: number; entry_time: string; expires_at: string;
};

const brt = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function DemoOpenOperations({ strategy }: { strategy?: string } = {}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['demo-open-operations'],
    select: (rows: OpenOperation[]) => strategy ? rows.filter(r => r.strategy === strategy) : rows,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('demo-open-operations-admin', { body: {} });
      if (error) throw error;
      return (data?.open_operations ?? []) as OpenOperation[];
    },
  });

  return <section className="mb-4 border-b border-border pb-4" aria-label="Operações abertas Demo">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-medium">Operações abertas · Demo</h4><Badge variant="outline">DEMO · AO VIVO</Badge></div>
    {isLoading ? <p className="text-xs text-muted-foreground">Carregando operações abertas…</p>
      : isError ? <p role="alert" className="text-xs text-destructive">Não foi possível carregar as operações abertas.</p>
      : !data?.length ? <p className="text-xs text-muted-foreground">Nenhuma operação Demo aberta agora.</p>
      : <div className="space-y-1">
        <div className="hidden grid-cols-5 gap-2 px-2 text-[10px] uppercase text-muted-foreground sm:grid"><span>Ativo</span><span>Direção</span><span>Valor</span><span>Entrada</span><span className="text-right">Vencimento</span></div>
        {data.map(op => <div key={`${op.asset}-${op.entry_time}`} className="grid grid-cols-2 items-center gap-2 rounded-md bg-secondary/30 p-2 text-xs hover:bg-secondary/60 sm:grid-cols-5">
          <span className="font-medium">{op.asset}<span className="block text-[10px] font-normal text-muted-foreground">{demoStrategyNames[op.strategy] ?? op.strategy}</span></span>
          <span className={op.direction === 'CALL' ? 'text-call' : 'text-put'}>{op.direction}</span>
          <span className="font-mono">{op.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })}</span>
          <span className="font-mono text-muted-foreground"><span className="sm:hidden">Entrada </span>{brt(op.entry_time)}</span>
          <span className="col-span-2 font-mono sm:col-span-1 sm:text-right"><span className="text-muted-foreground sm:hidden">Vence </span>{brt(op.expires_at)}</span>
        </div>)}
      </div>}
  </section>;
}
