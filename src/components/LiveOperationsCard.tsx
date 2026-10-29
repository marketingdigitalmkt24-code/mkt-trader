import { useState, useEffect, useRef } from 'react';
import { Activity, TrendingUp, TrendingDown, Target, Clock, Loader2, Volume2, VolumeX } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { DemoTestOperations } from './DemoTestOperations';
import { DemoDailyHistory } from './DemoDailyHistory';

interface OpenPosition {
  id: string;
  type: string;
  asset: string;
  direction: string;
  invest: number;
  pnl: number;
}

const typeLabel = (t: string) =>
  t === 'forex' ? 'FOREX' : t === 'digital-option' ? 'DIGITAL' : t === 'turbo-option' ? 'BINÁRIA' : t === 'binary-option' ? 'BINÁRIA' : t.toUpperCase();

export function LiveOperationsCard() {
  const [brokerOpen, setBrokerOpen] = useState<OpenPosition[]>([]);
  const [recordedOpen, setRecordedOpen] = useState<OpenPosition[]>([]);
  // Corretora (com lucro ao vivo) tem prioridade; ordens registradas cobrem o intervalo entre consultas.
  const openPositions = [...brokerOpen, ...recordedOpen.filter(r => !brokerOpen.some(b => b.id === r.id))];
  const [openLoading, setOpenLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);
  const initialHorn = typeof window !== 'undefined' && localStorage.getItem('hornEnabled') === '1';
  const [hornEnabled, setHornEnabled] = useState(initialHorn);
  const hornEnabledRef = useRef(initialHorn);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const seenSignalsRef = useRef<Set<string>>(new Set());
  const hornPrimedRef = useRef(false);

  // Buzina: dois bips estilo buzina de carro
  const playHorn = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const beep = (startAt: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.02);
        gain.gain.setValueAtTime(0.3, startAt + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + duration);
      };
      const now = ctx.currentTime;
      beep(now, 0.35);
      beep(now + 0.5, 0.35);
    } catch {
      // silent
    }
  };

  const toggleHorn = () => {
    const next = !hornEnabledRef.current;
    hornEnabledRef.current = next;
    setHornEnabled(next);
    localStorage.setItem('hornEnabled', next ? '1' : '0');
    if (next && !hornPrimedRef.current) {
      hornPrimedRef.current = true;
      playHorn(); // destrava o áudio do navegador com o clique
    }
  };

  // Buzina toca quando o sinal é ENVIADO para a IQ Option (status 'executing'),
  // ~30s antes da entrada real (que sai 2s antes da vela fechar). Testes não tocam.
  const checkNewSignals = async () => {
    if (!hornEnabledRef.current) return;
    try {
      const since = new Date(Date.now() - 90 * 1000).toISOString();
      const { data } = await supabase
        .from('trade_queue')
        .select('signal_id, created_at')
        .eq('status', 'executing')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5);
      for (const sig of data || []) {
        if (!seenSignalsRef.current.has(sig.signal_id)) {
          seenSignalsRef.current.add(sig.signal_id);
          playHorn();
        }
      }
      // limita o tamanho do conjunto
      if (seenSignalsRef.current.size > 200) {
        seenSignalsRef.current = new Set([...seenSignalsRef.current].slice(-100));
      }
    } catch {
      // silent
    }
  };

  // Posições abertas na IQ Option (binária, digital e forex)
  // Ordens principais confirmadas pela corretora e ainda sem resultado (atualiza a cada 3s).
  const fetchRecordedOpen = async () => {
    try {
      const { data } = await supabase.from('operation_results')
        .select('signal_id, asset, direction, iq_option_id, timeframe')
        .in('result', ['pending', 'open'])
        .neq('timeframe', 'TEST').neq('timeframe', 'MT5')
        .not('iq_option_id', 'is', null)
        .not('signal_id', 'like', 'copy-%').not('signal_id', 'like', 'sim-%').not('signal_id', 'like', 'mt5-%')
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .limit(20);
      const rows = data || [];
      const { data: queue } = rows.length
        ? await supabase.from('trade_queue').select('signal_id, amount').in('signal_id', rows.map(r => r.signal_id))
        : { data: [] };
      const amounts = new Map((queue || []).map(q => [q.signal_id, Number(q.amount || 0)]));
      setRecordedOpen(rows.map(r => ({
        id: String(r.iq_option_id), type: r.timeframe === 'FOREX' ? 'forex' : 'binary-option',
        asset: r.asset, direction: r.direction, invest: amounts.get(r.signal_id) || 0, pnl: 0,
      })));
    } catch {
      // silent
    } finally {
      setOpenLoading(false);
    }
  };

  const fetchOpen = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const { data } = await supabase.functions.invoke('iqoption-open-positions');
      if (data?.success) setBrokerOpen(data.positions || []);
    } catch {
      // silent
    } finally {
      setOpenLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchOpen();
    fetchRecordedOpen();
    const recordedPoll = setInterval(fetchRecordedOpen, 3000);
    pollRef.current = setInterval(() => {
      fetchOpen();
    }, 30000); // each broker read is a login; keep logins low for the Demo routine
    return () => { clearInterval(recordedPoll); if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Poll de sinais novos para a buzina (a cada 10s)
  useEffect(() => {
    const hornPoll = setInterval(checkNewSignals, 3000);
    return () => clearInterval(hornPoll);
  }, []);

  const totalOpenPnl = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Operações em Tempo Real</h3>
          <Button
            size="sm"
            variant={hornEnabled ? 'default' : 'secondary'}
            className="h-7 px-2 text-xs ml-auto gap-1"
            onClick={toggleHorn}
            title="Buzina toca quando uma operação abre na IQ Option"
          >
            {hornEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            Buzina
          </Button>
        </div>

        {/* Posições abertas */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Operações Abertas</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">{openPositions.length} abertas</Badge>
          </div>
          {openLoading ? (
            <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : openPositions.length > 0 ? (
            <div className="space-y-1">
              {openPositions.map(p => {
                const pct = p.invest > 0 ? Math.min(100, Math.max(0, (p.pnl / p.invest) * 100)) : 0;
                return (
                  <div key={p.id} className="p-2 rounded-lg text-xs bg-gold/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {p.direction === 'CALL' ? <TrendingUp className="w-3 h-3 text-call" /> : <TrendingDown className="w-3 h-3 text-put" />}
                        <span className="font-medium">{p.asset}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{typeLabel(p.type)}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono">${p.invest.toFixed(2)}</span>
                        <span className={cn("font-mono font-bold", p.pnl >= 0 ? "text-call" : "text-put")}>
                          {p.pnl >= 0 ? '+' : '-'}${Math.abs(p.pnl).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {p.type === 'forex' && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Target className="w-3 h-3 text-muted-foreground" />
                        <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-call" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">{pct.toFixed(0)}% / 100%</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Resultado aberto</span>
                <span className={cn("text-xs font-mono font-bold", totalOpenPnl >= 0 ? "text-call" : "text-put")}>
                  {totalOpenPnl >= 0 ? '+' : '-'}${Math.abs(totalOpenPnl).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-3 bg-secondary/30 rounded-lg">
              Nenhuma operação aberta agora
            </div>
          )}
        </div>

        {/* Últimas operações · Demo */}
        <DemoTestOperations />
        <DemoDailyHistory />

      </CardContent>
    </Card>
  );
}
