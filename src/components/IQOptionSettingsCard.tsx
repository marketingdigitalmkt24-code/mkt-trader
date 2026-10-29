import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TrendingUp, Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { iqOptionClient } from '@/services/IQOptionClient';

interface IQOptionConfig {
  id: string;
  email: string;
  password: string;
  account_type: string;
  is_active: boolean;
  last_connected_at: string | null;
  user_id: string;
}

interface IQOptionSettingsCardProps {
  /** Admin: o tipo de conta aqui vale só para Últimas operações · Demo, separado do Auto Trading. */
  demoAccount?: boolean;
  defaultOpen?: boolean;
  embedded?: boolean;
  onConnectionChange?: () => void;
}

export function IQOptionSettingsCard({ defaultOpen = false, embedded = false, onConnectionChange, demoAccount = false }: IQOptionSettingsCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [config, setConfig] = useState<IQOptionConfig | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState('PRACTICE');
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const connected = config?.is_active === true && Boolean(config.last_connected_at);

  useEffect(() => {
    if (isOpen && user) {
      loadConfig();
    }
  }, [isOpen, user]);

  const loadConfig = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('iqoption_config')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setConfig(data);
        setEmail(data.email);
        setPassword(data.password);
        if (!demoAccount) setAccountType(data.account_type);
        setNeedsReconnect(!data.is_active || !data.last_connected_at);
      } else {
        // Reset form if no config found
        setConfig(null);
        setEmail('');
        setPassword('');
        if (!demoAccount) setAccountType('PRACTICE');
      }
      if (demoAccount) {
        const { data: demo } = await supabase.from('iq_demo_test_settings').select('account_type').eq('id', 1).maybeSingle();
        setAccountType((demo as { account_type?: string } | null)?.account_type ?? 'PRACTICE');
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!user) return;
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Erro', description: 'Preencha email e senha primeiro', variant: 'destructive' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    
    try {
      // Use Edge Function to avoid browser CORS/blocking
      const result = await iqOptionClient.login({
        email: email.trim(),
        password: password.trim(),
        accountType: demoAccount ? (config?.account_type ?? 'PRACTICE') : accountType,
        userId: user?.id,
      });
      
      if (result.success) {
        const values = {
          email: email.trim(), password: password.trim(), account_type: demoAccount ? (config?.account_type ?? 'PRACTICE') : accountType,
          is_active: true,
          last_connected_at: new Date().toISOString(),
        };
        const { error: saveError } = config
          ? await supabase.from('iqoption_config').update(values).eq('id', config.id).eq('user_id', user.id)
          : await supabase.from('iqoption_config').insert({ ...values, user_id: user.id });
        if (saveError) {
          setTestResult('error');
          toast({ title: 'Não foi possível configurar o copy', description: 'A conta conectou, mas não foi possível salvar a configuração. Tente conectar novamente.', variant: 'destructive' });
          return;
        }
        setTestResult('success');
        setNeedsReconnect(false);
        await loadConfig();
        onConnectionChange?.();
        
        toast({ 
          title: '✅ Conexão bem sucedida!', 
          description: result.balance !== undefined 
            ? `Saldo: ${result.balance.toFixed(2)} USD` 
            : 'Conectado à IQ Option'
        });
      } else {
        setTestResult('error');
        
        // Check if it's a server block issue
        const isServerBlock = result.error?.includes('bloqueando') || 
                              result.error?.includes('timeout') ||
                              result.error?.includes('timed out');
        
        toast({ 
          title: isServerBlock ? 'Servidor bloqueado' : 'Erro na conexão', 
          description: result.error || 'Falha ao conectar com IQ Option',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Test error:', error);
      setTestResult('error');
      toast({ 
        title: 'Erro', 
        description: String(error) || 'Falha ao testar conexão',
        variant: 'destructive'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const saveDemoAccount = async (next: string) => {
    const previous = accountType;
    setAccountType(next);
    const { error } = await supabase.from('iq_demo_test_settings').update({ account_type: next } as never).eq('id', 1);
    if (error) {
      setAccountType(previous);
      toast({ title: 'Não foi possível salvar', description: 'A conta de Últimas operações continua a mesma.', variant: 'destructive' });
    } else toast({ title: 'Conta salva', description: `Últimas operações agora usam a conta ${next === 'REAL' ? 'Real' : 'Demo'}.` });
  };

  const invalidateConnection = async (nextAccount: string) => {
    if (!user || isLoading || isTesting) return;
    setIsLoading(true);
    try {
      if (config) {
        const { data, error } = await supabase.from('iqoption_config')
          .update({ account_type: nextAccount, is_active: false, last_connected_at: null })
          .eq('id', config.id).eq('user_id', user.id).select().single();
        if (error) throw error;
        setConfig(data);
      }
      iqOptionClient.disconnect();
      setAccountType(nextAccount);
      setNeedsReconnect(true);
      setTestResult(null);
      onConnectionChange?.();
      toast({ title: 'Copy desligado', description: 'Conecte a conta IQ Option novamente antes de ligar o copy.' });
    } catch {
      toast({ title: 'Não foi possível desconectar', description: 'A alteração não foi salva. Tente novamente.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setIsOpen(true)}
        className="gap-2 border-orange-500/30 hover:border-orange-500/50"
      >
        <TrendingUp className="w-4 h-4 text-orange-500" />
        Configurar IQ Option
      </Button>
    );
  }

  return (
    <Card className={embedded ? 'min-w-0 border-0 rounded-none shadow-none bg-transparent' : 'min-w-0 border-orange-500/20'}>
      <CardHeader className="px-3 sm:px-6 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap min-w-0 items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <CardTitle className="text-lg">IQ Option</CardTitle>
            {connected && (
              <Badge variant="outline" className="text-xs">
                <Wifi className="w-3 h-3 mr-1" />
                Conectado
              </Badge>
            )}
          </div>
          {!embedded && <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            ✕
          </Button>}
        </div>
        <CardDescription>
          Configure suas credenciais para buscar resultados reais
        </CardDescription>
      </CardHeader>
      
      <CardContent className="px-3 sm:px-6 space-y-4 min-w-0">
        {/* Email */}
        <div>
          <Label className="text-xs text-muted-foreground">Email da conta IQ Option</Label>
          <Input
            placeholder="seu@email.com"
            value={email}
            disabled={isLoading || isTesting}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
        </div>

        {/* Password */}
        <div>
          <Label className="text-xs text-muted-foreground">Senha</Label>
          <div className="relative">
            <Input
              placeholder="Sua senha"
              value={password}
              disabled={isLoading || isTesting}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Account Type */}
        <div>
          <Label className="text-xs text-muted-foreground">{demoAccount ? 'Tipo de conta · Últimas operações' : 'Tipo de conta'}</Label>
          <Select value={accountType} disabled={isLoading || isTesting} onValueChange={(value) => {
            if (value === accountType) return;
            if (demoAccount) void saveDemoAccount(value);
            else if (embedded) void invalidateConnection(value);
            else setAccountType(value);
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRACTICE">Conta Demo (Prática)</SelectItem>
              <SelectItem value="REAL">Conta Real</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {needsReconnect && (
          <p role="status" className="text-sm text-muted-foreground">
            Copy desligado. Conecte a conta IQ Option novamente para ativar o copy trading.
          </p>
        )}

        {/* Warning */}
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            <strong>Aviso de Segurança:</strong> Ao conectar, você autoriza o sistema a acessar sua IQ Option e executar o copy trading. Suas credenciais ficam armazenadas para manter o copy funcionando mesmo com esta página fechada.
          </p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button 
            onClick={testConnection} 
            className="flex-1 gap-2"
            disabled={isTesting || isLoading}
          >
            {isTesting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : testResult === 'success' ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : testResult === 'error' ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
            Conectar
          </Button>
          
          {(embedded || connected || iqOptionClient.isConnected()) && (
            <Button 
              variant="outline"
              onClick={() => void invalidateConnection(accountType)}
              disabled={isLoading || isTesting || !connected}
              className="flex-1 gap-2"
            >
              <WifiOff className="w-4 h-4 text-destructive" />
              Desconectar
            </Button>
          )}
        </div>

        {config?.last_connected_at && (
          <p className="text-xs text-muted-foreground text-center">
            Última conexão: {new Date(config.last_connected_at).toLocaleString('pt-BR')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
