import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Wifi, WifiOff, Eye, EyeOff, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';

interface MetaApiConfig {
  id?: string;
  token: string;
  account_id: string;
  account_name: string;
  is_active: boolean;
  connection_status: string;
  volume: number;
  mt5_login: string;
  mt5_password: string;
  mt5_server: string;
  take_profit_pips: number;
}

export function MetaApiSettingsCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [config, setConfig] = useState<MetaApiConfig>({
    token: '',
    account_id: '',
    account_name: '',
    is_active: false,
    connection_status: 'disconnected',
    volume: 0.01,
    mt5_login: '',
    mt5_password: '',
    mt5_server: '',
    take_profit_pips: 10,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data } = await supabase
        .from('metaapi_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (data) {
        setConfig({
          id: data.id,
          token: data.token || '',
          account_id: data.account_id || '',
          account_name: data.account_name || '',
          is_active: data.is_active,
          connection_status: data.connection_status || 'disconnected',
          volume: data.volume || 0.01,
          mt5_login: data.mt5_login || '',
          mt5_password: data.mt5_password || '',
          mt5_server: data.mt5_server || '',
          take_profit_pips: (data as any).take_profit_pips ?? 10,
        });
      }
    } catch (e) {
      console.error('Error loading MetaAPI config:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        token: config.token,
        account_id: config.account_id,
        account_name: config.account_name,
        is_active: config.is_active,
        volume: config.volume,
        mt5_login: config.mt5_login,
        mt5_password: config.mt5_password,
        mt5_server: config.mt5_server,
        take_profit_pips: config.take_profit_pips,
        updated_at: new Date().toISOString(),
      };

      if (config.id) {
        const { error } = await supabase
          .from('metaapi_config')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('metaapi_config')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) setConfig(prev => ({ ...prev, id: data.id }));
      }

      toast.success('Configuração salva!');
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!config.mt5_login || !config.mt5_password) {
      toast.error('Preencha Login e Senha do MT5');
      return;
    }

    if (!config.id) {
      await handleSave();
    }

    setIsConnecting(true);
    setConfig(prev => ({ ...prev, connection_status: 'connecting' }));

    try {
      const { data, error } = await supabase.functions.invoke('metaapi-connect', {
        body: {
          mt5Login: config.mt5_login,
          mt5Password: config.mt5_password,
          mt5Server: config.mt5_server,
          configId: config.id,
        },
      });

      if (error) throw new Error('Erro na comunicação com o servidor');

      if (data?.success) {
        setConfig(prev => ({
          ...prev,
          account_id: data.accountId || prev.account_id,
          account_name: data.accountName || prev.account_name,
          connection_status: data.connectionStatus || 'connecting',
        }));
        toast.success(`✅ ${data.message}`);
        
        if (data.connectionStatus !== 'connected') {
          const pollInterval = setInterval(async () => {
            const { data: refreshed } = await supabase
              .from('metaapi_config')
              .select('connection_status, account_name, account_id')
              .eq('id', config.id!)
              .maybeSingle();
            
            if (refreshed) {
              setConfig(prev => ({
                ...prev,
                connection_status: refreshed.connection_status || prev.connection_status,
                account_name: refreshed.account_name || prev.account_name,
                account_id: refreshed.account_id || prev.account_id,
              }));
              if (refreshed.connection_status === 'connected') {
                clearInterval(pollInterval);
                toast.success('✅ MT5 conectado com sucesso!');
              }
            }
          }, 10000);
          setTimeout(() => clearInterval(pollInterval), 120000);
        } else {
          setTimeout(loadConfig, 2000);
        }
      } else {
        setConfig(prev => ({ ...prev, connection_status: 'error' }));
        toast.error(`❌ ${data?.error || 'Falha ao conectar'}`);
      }
    } catch (e: any) {
      setConfig(prev => ({ ...prev, connection_status: 'error' }));
      toast.error('❌ ' + e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const statusBadge = () => {
    switch (config.connection_status) {
      case 'connected':
        return <Badge className="bg-call/20 text-call border-call/30"><Wifi className="w-3 h-3 mr-1" /> Conectado</Badge>;
      case 'connecting':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Conectando...</Badge>;
      case 'disconnected':
        return <Badge variant="secondary"><WifiOff className="w-3 h-3 mr-1" /> Desconectado</Badge>;
      case 'error':
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" /> Erro</Badge>;
      default:
        return <Badge variant="outline">{config.connection_status}</Badge>;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusBadge()}
          {config.account_name && (
            <span className="text-sm text-muted-foreground">{config.account_name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="mt5-active" className="text-sm">Ativo</Label>
          <Switch
            id="mt5-active"
            checked={config.is_active}
            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, is_active: checked }))}
          />
        </div>
      </div>

      {/* Connected Account Info */}
      {config.account_id && config.connection_status === 'connected' && (
        <div className="p-3 rounded-lg bg-call/5 border border-call/20">
          <div className="flex items-center gap-2 mb-1">
            <MonitorSmartphone className="w-4 h-4 text-call" />
            <span className="text-sm font-medium text-call">Conta Conectada</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {config.account_name} • ID: <code className="text-foreground">{config.account_id.slice(0, 12)}...</code>
          </p>
        </div>
      )}

      {/* Token MetaAPI Global */}
      <div className="border-t border-border/50 pt-4 space-y-2">
        <Label htmlFor="metaapi-token">Token MetaAPI (acesso global a todas as contas)</Label>
        <div className="relative">
          <Input
            id="metaapi-token"
            type={showPassword ? 'text' : 'password'}
            value={config.token}
            onChange={(e) => setConfig(prev => ({ ...prev, token: e.target.value }))}
            placeholder="eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9..."
            className="pr-10 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Token único que dá acesso a todas as contas MT5 cadastradas no MetaAPI</p>
      </div>

      {/* MT5 Account Data */}
      <div className="border-t border-border/50 pt-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <MonitorSmartphone className="w-4 h-4" />
          Dados da Conta MT5
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="mt5-login">Login (ID)</Label>
          <Input
            id="mt5-login"
            value={config.mt5_login}
            onChange={(e) => setConfig(prev => ({ ...prev, mt5_login: e.target.value }))}
            placeholder="51234567"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mt5-server">Servidor (auto-detecta se já existir)</Label>
          <Input
            id="mt5-server"
            value={config.mt5_server}
            onChange={(e) => setConfig(prev => ({ ...prev, mt5_server: e.target.value }))}
            placeholder="XMGlobal-MT5"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mt5-password">Senha MT5</Label>
        <div className="relative">
          <Input
            id="mt5-password"
            type={showPassword ? 'text' : 'password'}
            value={config.mt5_password}
            onChange={(e) => setConfig(prev => ({ ...prev, mt5_password: e.target.value }))}
            placeholder="Senha do MT5"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>


      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={isSaving} variant="outline" className="flex-1">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
        <Button 
          onClick={handleConnect} 
          disabled={isConnecting || !config.mt5_login || !config.mt5_password} 
          className="flex-1"
        >
          {isConnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wifi className="w-4 h-4 mr-2" />}
          Conectar MT5
        </Button>
      </div>
    </div>
  );
}