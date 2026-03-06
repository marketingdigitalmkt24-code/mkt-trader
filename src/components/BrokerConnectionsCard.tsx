import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2, Server, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
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

  const [mt5Status, setMt5Status] = useState<BrokerStatus>({
    name: 'MetaTrader 5',
    icon: <Server className="w-4 h-4" />,
    connected: false,
    loading: true,
    details: 'Verificando...',
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkConnections = async () => {
    setIsRefreshing(true);

    // Check IQ Option
    try {
      const { data: iqConfig } = await supabase
        .from('iqoption_config')
        .select('is_active, account_type, last_connected_at, email')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (iqConfig) {
        const lastConn = iqConfig.last_connected_at ? new Date(iqConfig.last_connected_at) : null;
        const isRecent = lastConn && (Date.now() - lastConn.getTime()) < 5 * 60 * 1000;
        setIqStatus({
          name: 'IQ Option',
          icon: <MonitorSmartphone className="w-4 h-4" />,
          connected: !!isRecent,
          loading: false,
          details: isRecent ? iqConfig.email : 'Desconectado',
          accountType: iqConfig.account_type,
          lastActivity: lastConn ? lastConn.toLocaleTimeString('pt-BR') : undefined,
        });
      } else {
        setIqStatus(prev => ({ ...prev, loading: false, details: 'Não configurado' }));
      }
    } catch {
      setIqStatus(prev => ({ ...prev, loading: false, details: 'Erro ao verificar' }));
    }

    // Check MT5
    try {
      const { data: metaConfig } = await supabase
        .from('metaapi_config')
        .select('is_active, connection_status, account_name, mt5_login, updated_at')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (metaConfig) {
        const isConn = metaConfig.connection_status === 'connected';
        setMt5Status({
          name: 'MetaTrader 5',
          icon: <Server className="w-4 h-4" />,
          connected: isConn || metaConfig.is_active,
          loading: false,
          details: metaConfig.account_name || metaConfig.mt5_login || 'Configurado',
          lastActivity: metaConfig.updated_at ? new Date(metaConfig.updated_at).toLocaleTimeString('pt-BR') : undefined,
        });
      } else {
        setMt5Status(prev => ({ ...prev, loading: false, details: 'Não configurado' }));
      }
    } catch {
      setMt5Status(prev => ({ ...prev, loading: false, details: 'Erro ao verificar' }));
    }

    setIsRefreshing(false);
  };

  useEffect(() => {
    checkConnections();
    const interval = setInterval(checkConnections, 30000);
    return () => clearInterval(interval);
  }, []);

  const renderBroker = (status: BrokerStatus) => (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border transition-all",
      status.connected
        ? "bg-call/5 border-call/20"
        : "bg-secondary/50 border-border/50"
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          status.connected ? "bg-call/20 text-call" : "bg-muted text-muted-foreground"
        )}>
          {status.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : status.icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{status.name}</span>
            {status.accountType && (
              <Badge variant="secondary" className={cn(
                "text-[10px] px-1.5 py-0",
                status.accountType === 'PRACTICE' ? "bg-blue-500/20 text-blue-400" : "bg-call/20 text-call"
              )}>
                {status.accountType === 'PRACTICE' ? 'DEMO' : 'REAL'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{status.details}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {status.lastActivity && (
          <span className="text-[10px] text-muted-foreground hidden sm:block">{status.lastActivity}</span>
        )}
        {status.connected ? (
          <Wifi className="w-4 h-4 text-call" />
        ) : (
          <WifiOff className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-call animate-pulse" />
            <h3 className="text-sm font-semibold">Conexões Brokers</h3>
          </div>
          <button
            onClick={checkConnections}
            disabled={isRefreshing}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", isRefreshing && "animate-spin")} />
          </button>
        </div>
        <div className="space-y-2">
          {renderBroker(iqStatus)}
          {renderBroker(mt5Status)}
        </div>
      </CardContent>
    </Card>
  );
}