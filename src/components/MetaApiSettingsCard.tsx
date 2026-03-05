import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Wifi, WifiOff, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface MetaApiConfig {
  id?: string;
  account_id: string;
  token: string;
  account_name: string;
  is_active: boolean;
  connection_status: string;
  volume: number;
}

export function MetaApiSettingsCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [config, setConfig] = useState<MetaApiConfig>({
    account_id: '',
    token: '',
    account_name: '',
    is_active: false,
    connection_status: 'disconnected',
    volume: 0.01,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('metaapi_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (data) {
        setConfig({
          id: data.id,
          account_id: data.account_id,
          token: data.token,
          account_name: data.account_name || '',
          is_active: data.is_active,
          connection_status: data.connection_status || 'disconnected',
          volume: data.volume || 0.01,
        });
      }
    } catch (e) {
      console.error('Error loading MetaAPI config:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.account_id || !config.token) {
      toast.error('Preencha Account ID e Token');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        account_id: config.account_id,
        token: config.token,
        account_name: config.account_name,
        is_active: config.is_active,
        volume: config.volume,
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

      toast.success('Configuração MetaAPI salva!');
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!config.account_id || !config.token) {
      toast.error('Preencha Account ID e Token primeiro');
      return;
    }

    setIsTesting(true);
    try {
      const accountUrl = `https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${config.account_id}`;
      const response = await fetch(accountUrl, {
        headers: { 'auth-token': config.token },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const status = data.connectionStatus || 'unknown';
      const name = data.name || '';

      setConfig(prev => ({
        ...prev,
        connection_status: status === 'CONNECTED' ? 'connected' : status.toLowerCase(),
        account_name: name,
      }));

      // Update in DB
      if (config.id) {
        await supabase
          .from('metaapi_config')
          .update({
            connection_status: status === 'CONNECTED' ? 'connected' : status.toLowerCase(),
            account_name: name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);
      }

      if (status === 'CONNECTED') {
        toast.success(`✅ Conectado! Conta: ${name} | Estado: ${data.state}`);
      } else {
        toast.warning(`⚠️ Conta encontrada (${name}) mas status: ${status}`);
      }
    } catch (e: any) {
      setConfig(prev => ({ ...prev, connection_status: 'error' }));
      toast.error('❌ Falha na conexão: ' + e.message);
    } finally {
      setIsTesting(false);
    }
  };

  const statusBadge = () => {
    switch (config.connection_status) {
      case 'connected':
        return <Badge className="bg-call/20 text-call border-call/30"><Wifi className="w-3 h-3 mr-1" /> Conectado</Badge>;
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

      {/* Account ID */}
      <div className="space-y-2">
        <Label htmlFor="mt5-account-id">Account ID</Label>
        <Input
          id="mt5-account-id"
          value={config.account_id}
          onChange={(e) => setConfig(prev => ({ ...prev, account_id: e.target.value }))}
          placeholder="Seu MetaAPI Account ID"
        />
      </div>

      {/* Token */}
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
        <p className="text-xs text-muted-foreground">Volume padrão para cada operação copiada no MT5</p>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={isSaving} className="flex-1">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
        <Button onClick={handleTestConnection} disabled={isTesting} variant="outline" className="flex-1">
          {isTesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wifi className="w-4 h-4 mr-2" />}
          Testar Conexão
        </Button>
      </div>
    </div>
  );
}
