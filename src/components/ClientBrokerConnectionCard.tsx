import { Wifi, WifiOff, MonitorSmartphone, Settings, Power, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useClientBrokerSummary } from '@/hooks/useClientBrokerSummary';

export function ClientBrokerConnectionCard({ onConfigure }: { onConfigure: () => void }) {
  const { data, isLoading, isError, configured, saving, toggle } = useClientBrokerSummary();
  return (
    <section className="glass-card p-3 sm:p-4">
      <h2 className="flex items-center gap-2 font-semibold text-base"><Wifi className="w-4 h-4 text-primary" />Conexão Corretora</h2>
      <div className="flex items-center gap-3 border border-border/50 rounded-lg p-3 mt-3">
        <MonitorSmartphone className="w-5 h-5 text-primary shrink-0" />
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">IQ Option</p><p className="text-xs text-muted-foreground truncate">{isLoading ? 'Verificando…' : isError ? 'Não foi possível verificar a conta' : data?.iq?.email || 'Não configurada'}</p></div>
        {data?.iq && <Badge variant="secondary">{data.iq.account_type === 'REAL' ? 'REAL' : 'DEMO'}</Badge>}
        {configured ? <Wifi className="w-4 h-4 text-call shrink-0" /> : <WifiOff className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>
      {!isLoading && !configured && <p role="status" className="mt-3 text-xs leading-relaxed text-gold">Configure e conecte sua conta IQ Option na aba Corretoras antes de ligar o copy.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <Button variant="outline" onClick={onConfigure} className="gap-2 flex-1"><Settings className="w-4 h-4" />Configurar conta</Button>
        <Button variant={data?.enabled ? 'destructive' : 'default'} disabled={saving || isLoading || isError || (!data?.enabled && !configured)} onClick={() => void toggle()} className="gap-2 flex-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}{data?.enabled ? 'Desligar copy' : 'Ligar copy'}
        </Button>
      </div>
    </section>
  );
}
