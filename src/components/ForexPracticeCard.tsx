import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Landmark } from 'lucide-react';

interface Row {
  id: string; symbol: string; direction: string; entry_price: number; stop_price: number; target_price: number;
  status: string; result_kind: string | null; result_r: number | null; opened_at: string; closed_at: string | null;
  iq_order_id: string | null; iq_status: string | null; iq_error: string | null; iq_amount: number | null; iq_leverage: number | null;
}

const dt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const fmt = (v: number, s: string) => Number(v).toFixed(s.includes('JPY') ? 3 : 5);

export function ForexPracticeCard() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('stop_target_positions').select('*').not('iq_status', 'is', null).order('opened_at', { ascending: false }).limit(50);
      if (alive && data) setRows(data as unknown as Row[]);
    };
    load(); const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const ok = rows.filter(r => r.iq_order_id);
  const closed = ok.filter(r => r.status === 'closed');
  const wins = closed.filter(r => (r.result_r ?? 0) > 0).length;
  const losses = closed.filter(r => (r.result_r ?? 0) < 0).length;
  const totalR = closed.reduce((s, r) => s + (r.result_r ?? 0), 0);

  return (
    <Card className="border-accent/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="w-4 h-4 text-primary" />
          Forex na IQ Option
          <Badge variant="outline" className="ml-auto text-xs">CONTA DE TREINO</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Ordens de forex abertas de verdade na conta de treino (saldo fictício), com stop e alvo enviados para a IQ Option. Risco de cerca de US$ 10 por entrada. Separado das binárias.
        </p>
        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
          <div className="p-2 rounded-lg bg-muted"><p className="text-[10px] text-muted-foreground">ORDENS</p><p className="font-bold">{ok.length}</p></div>
          <div className="p-2 rounded-lg bg-call/10"><p className="text-[10px] text-muted-foreground">ALVOS</p><p className="font-bold text-call">{wins}</p></div>
          <div className="p-2 rounded-lg bg-put/10"><p className="text-[10px] text-muted-foreground">STOPS</p><p className="font-bold text-put">{losses}</p></div>
          <div className="p-2 rounded-lg bg-muted"><p className="text-[10px] text-muted-foreground">RESULTADO</p><p className={`font-bold ${totalR >= 0 ? 'text-call' : 'text-put'}`}>${(totalR * 10).toFixed(2)}</p></div>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma ordem ainda — a próxima entrada do teste abre aqui.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-semibold ${r.direction === 'CALL' ? 'text-call' : 'text-put'}`}>{r.direction === 'CALL' ? '▲ COMPRA' : '▼ VENDA'}</span>
                  <span className="font-medium">{r.symbol}</span>
                  <span className="text-muted-foreground">{dt(r.opened_at)}</span>
                </div>
                <div className="text-right shrink-0">
                  {!r.iq_order_id ? <span className="text-put">🚫 {r.iq_error || 'recusada'}</span>
                    : r.status === 'open' ? <span className="text-muted-foreground">⏳ aberta · stop {fmt(r.stop_price, r.symbol)} · alvo {fmt(r.target_price, r.symbol)}</span>
                    : <span className={`font-bold ${(r.result_r ?? 0) >= 0 ? 'text-call' : 'text-put'}`}>{(r.result_r ?? 0) >= 0 ? '+' : ''}${((r.result_r ?? 0) * 10).toFixed(2)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
