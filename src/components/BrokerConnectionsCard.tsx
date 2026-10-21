import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface BrokerStatus {
  name: string;
  icon: React.ReactNode;
  connected: boolean;
  loading: boolean;
  details: string;
  accountType?: string;
  lastActivity?: string;
}

export function BrokerConnectionsCard() {
  const [iqStatus, setIqStatus] = useState<BrokerStatus>({
    name: 'IQ Option',
    icon: <MonitorSmartphone className="w-4 h-4" />,
    connected: false,
    loading: true,
    details: 'Verificando...',
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkConnections = async () => {
    setIsRefreshing(true);

    try {
      const { data: iqConfig } = await supabase
        .from('iqoption_config')
        .select('is_active, account_type, last_connected_at, email')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (iqConfig) {
        setIqStatus({
          name: 'IQ Option',
          icon: <MonitorSmartphone className="w-4 h-4" />,
          connected: true,
          loading: false,
          details: iqConfig.email,
          accountType: iqConfig.account_type,
          lastActivity: iqConfig.last_connected_at ? new Date(iqConfig.last_connected_at).toLocaleTimeString('pt-BR') : undefined,
        });
      } else {
        setIqStatus(prev => ({ ...prev, loading: false, details: 'Não configurado' }));
      }
    } catch {
      setIqStatus(prev => ({ ...prev, loading: false, details: 'Erro ao verificar' }));
    }

    setIsRefreshing(false);
  };

  useEffect(() => {
    checkConnections();
    const interval = setInterval(checkConnections, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="border-border/50">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-call animate-pulse" />
            <h3 className="text-sm font-semibold">Conexão Corretora</h3>
          </div>
          <button
            onClick={checkConnections}
            disabled={isRefreshing}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", isRefreshing && "animate-spin")} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <div className={cn(
            "flex items-center justify-between p-3 rounded-lg border transition-all",
            iqStatus.connected
              ? "bg-call/5 border-call/20"
              : "bg-secondary/50 border-border/50"
          )}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                iqStatus.connected ? "bg-call/20 text-call" : "bg-muted text-muted-foreground"
              )}>
                {iqStatus.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : iqStatus.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{iqStatus.name}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{iqStatus.details}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {iqStatus.lastActivity && (
                <span className="text-[10px] text-muted-foreground hidden sm:block">{iqStatus.lastActivity}</span>
              )}
              {iqStatus.connected ? (
                <Wifi className="w-4 h-4 text-call" />
              ) : (
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
