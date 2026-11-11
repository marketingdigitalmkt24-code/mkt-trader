import { useState, useEffect, useRef } from 'react';
import { Activity, Volume2, VolumeX } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { supabase } from '@/integrations/supabase/client';
import { DemoTestOperations } from './DemoTestOperations';
import { DemoOpenOperations } from './DemoOpenOperations';
import { DemoDailyHistory } from './DemoDailyHistory';
import { OpenPositionsSection } from './OpenPositionsSection';

export function LiveOperationsCard() {
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
    setHornEnabled(next);
    hornEnabledRef.current = next;
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

  // Poll de sinais novos para a buzina (a cada 10s)
  useEffect(() => {
    const hornPoll = setInterval(checkNewSignals, 3000);
    return () => clearInterval(hornPoll);
  }, []);

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

        <OpenPositionsSection />

        <DemoOpenOperations strategy="TENDENCIA_ALINHADA" />
        {/* Últimas operações · Demo */}
        <DemoTestOperations strategy="TENDENCIA_ALINHADA" />
        <DemoDailyHistory strategy="TENDENCIA_ALINHADA" />

      </CardContent>
    </Card>
  );
}
