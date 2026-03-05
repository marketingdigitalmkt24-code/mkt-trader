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
  account_id: string;
  token: string;
  account_name: string;
  is_active: boolean;
  connection_status: string;
  volume: number;
  mt5_login: string;
  mt5_password: string;
  mt5_server: string;
}

export function MetaApiSettingsCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [config, setConfig] = useState<MetaApiConfig>({
    account_id: '',
    token: '',
    account_name: '',
    is_active: false,
    connection_status: 'disconnected',
    volume: 0.01,
    mt5_login: '',
    mt5_password: '',
    mt5_server: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);

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
          account_id: data.account_id || '',
          token: data.token || '',
          account_name: data.account_name || '',
          is_active: data.is_active,
          connection_status: data.connection_status || 'disconnected',
          volume: data.volume || 0.01,
          mt5_login: data.mt5_login || '',
          mt5_password: data.mt5_password || '',
          mt5_server: data.mt5_server || '',
        });
      }
    } catch (e) {
      console.error('Error loading MetaAPI config:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.token) {
      toast.error('Preencha o Token MetaAPI');
      return;
    }

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
    if (!config.token) {
      toast.error('Preencha o Token MetaAPI');
      return;
    }
    if (!config.mt5_login || !config.mt5_password || !config.mt5_server) {
      toast.error('Preencha Login, Senha e Servidor do MT5');
      return;
    }

    // Save first if not saved
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
          account_id: data.accountId,
          account_name: data.accountName || prev.account_name,
          connection_status: data.connectionStatus === 'connected' ? 'connected' : 'connecting',
        }));
        toast.success(`✅ ${data.message}`);
        
        // Reload config from DB
        setTimeout(loadConfig, 2000);
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
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Conectando...</Badge>;
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

      {/* Token MetaAPI */}
      <div className="space-y-2">
        <Label htmlFor="mt5-token">Token MetaAPI</Label>
        <div className="relative">
          <Input
            id="mt5-token"
            type={showToken ? 'text' : 'password'}
            value={config.token}
            onChange={(e) => setConfig(prev => ({ ...prev, token: e.target.value }))}
            placeholder="Seu token de acesso MetaAPI"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Obtenha em metaapi.cloud → Tokens</p>
      </div>

      {/* Separator */}
      <div className="border-t border-border/50 pt-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <MonitorSmartphone className="w-4 h-4" />
          Dados da Conta MT5
        </h4>
      </div>

      {/* MT5 Login */}
      <div className="space-y-2">
        <Label htmlFor="mt5-login">Login (ID da Conta)</Label>
        <Input
          id="mt5-login"
          value={config.mt5_login}
          onChange={(e) => setConfig(prev => ({ ...prev, mt5_login: e.target.value }))}
          placeholder="Ex: 51234567"
        />
      </div>

      {/* MT5 Password */}
      <div className="space-y-2">
        <Label htmlFor="mt5-password">Senha da Conta MT5</Label>
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

      {/* MT5 Server */}
      <div className="space-y-2">
        <Label htmlFor="mt5-server">Servidor MT5</Label>
        <Input
          id="mt5-server"
          value={config.mt5_server}
          onChange={(e) => setConfig(prev => ({ ...prev, mt5_server: e.target.value }))}
          placeholder="Ex: Exness-MT5Real, ICMarketsSC-Demo"
        />
        <p className="text-xs text-muted-foreground">Nome exato do servidor como aparece no MT5</p>
      </div>

      {/* Volume */}
      <div className="space-y-2">
        <Label htmlFor="mt5-volume">Volume (Lotes)</Label>
        <Input
          id="mt5-volume"
          type="number"
          step="0.01"
          min="0.01"
          value={config.volume}
          onChange={(e) => setConfig(prev => ({ ...prev, volume: parseFloat(e.target.value) || 0.01 }))}
          placeholder="0.01"
        />
        <p className="text-xs text-muted-foreground">Volume para cada operação copiada</p>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={isSaving} variant="outline" className="flex-1">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
        <Button 
          onClick={handleConnect} 
          disabled={isConnecting || !config.mt5_login || !config.mt5_password || !config.mt5_server || !config.token} 
          className="flex-1"
        >
          {isConnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wifi className="w-4 h-4 mr-2" />}
          Conectar MT5
        </Button>
      </div>
    </div>
  );
}
