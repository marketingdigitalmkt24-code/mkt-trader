import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TradingSignal } from '@/types/trading';
import { useToast } from '@/hooks/use-toast';

const CONFLUENCE_THRESHOLD = 86;
const NOTIFICATION_COOLDOWN = 60000; // 1 minute cooldown per asset

export function useWhatsAppNotification() {
  const { toast } = useToast();
  const notifiedSignals = useRef<Map<string, number>>(new Map());

  const sendNotification = useCallback(async (signal: TradingSignal) => {
    // Check if we've already notified about this asset recently
    const lastNotified = notifiedSignals.current.get(signal.asset);
    if (lastNotified && Date.now() - lastNotified < NOTIFICATION_COOLDOWN) {
      return false;
    }

    try {
      const entryTime = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          signal: {
            asset: signal.asset,
            type: signal.type,
            confluenceScore: signal.indicators.confluenceScore,
            timeframe: signal.timeframe,
            entryTime,
            confirmations: signal.confirmations,
          },
        },
      });

      if (error) {
        console.error('Error sending WhatsApp notification:', error);
        toast({
          title: 'Erro na notificação',
          description: 'Não foi possível enviar a notificação WhatsApp',
          variant: 'destructive',
        });
        return false;
      }

      // Mark as notified
      notifiedSignals.current.set(signal.asset, Date.now());

      toast({
        title: '📱 Notificação enviada!',
        description: `Sinal ${signal.type} para ${signal.asset} enviado via WhatsApp`,
      });

      return true;
    } catch (err) {
      console.error('Failed to send notification:', err);
      return false;
    }
  }, [toast]);

  const checkAndNotify = useCallback(async (signals: TradingSignal[]) => {
    const highConfluenceSignals = signals.filter(
      (signal) => signal.indicators.confluenceScore >= CONFLUENCE_THRESHOLD
    );

    for (const signal of highConfluenceSignals) {
      await sendNotification(signal);
    }
  }, [sendNotification]);

  return {
    checkAndNotify,
    sendNotification,
    confluenceThreshold: CONFLUENCE_THRESHOLD,
  };
}
