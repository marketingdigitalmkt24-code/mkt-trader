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
  defaultOpen?: boolean;
  embedded?: boolean;
}

export function IQOptionSettingsCard({ defaultOpen = false, embedded = false }: IQOptionSettingsCardProps) {
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
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (data) {
        setConfig(data);
        setEmail(data.email);
        setPassword(data.password);
        setAccountType(data.account_type);
      } else {
        // Reset form if no config found
        setConfig(null);
        setEmail('');
        setPassword('');
        setAccountType('PRACTICE');
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
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
        accountType: accountType,
        userId: user?.id,
      });
      
      if (result.success) {
        setTestResult('success');
        loadConfig(); // Reload to get updated last_connected_at
        
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

  const disconnectFromIQ = () => {
    iqOptionClient.disconnect();
    setTestResult(null);
    toast({ title: 'Desconectado', description: 'Conexão com IQ Option encerrada' });
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
    <Card className={embedded ? 'border-0 rounded-none shadow-none bg-transparent' : 'border-orange-500/20'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <CardTitle className="text-lg">IQ Option</CardTitle>
            {config?.last_connected_at && (
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
      
      <CardContent className="space-y-4">
        {/* Email */}
        <div>
          <Label className="text-xs text-muted-foreground">Email da conta IQ Option</Label>
          <Input
            placeholder="seu@email.com"
            value={email}
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
          <Label className="text-xs text-muted-foreground">Tipo de conta</Label>
          <Select value={accountType} onValueChange={setAccountType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRACTICE">Conta Demo (Prática)</SelectItem>
              <SelectItem value="REAL">Conta Real</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Warning */}
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            <strong>Aviso de Segurança:</strong> Ao conectar, você autoriza o sistema a acessar sua IQ Option e executar o copy trading. Suas credenciais ficam armazenadas para manter o copy funcionando mesmo com esta página fechada.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
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
          
          {iqOptionClient.isConnected() && (
            <Button 
              variant="ghost" 
              onClick={disconnectFromIQ} 
              className="gap-2"
              size="icon"
            >
              <WifiOff className="w-4 h-4 text-destructive" />
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
