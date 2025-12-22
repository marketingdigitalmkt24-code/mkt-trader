import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TrendingUp, Eye, EyeOff, Save, RefreshCw, CheckCircle, XCircle, Wifi, AlertTriangle, ExternalLink, Monitor } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { localAgentService, AgentState } from '@/services/LocalAgentService';

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
}

export function IQOptionSettingsCard({ defaultOpen = false }: IQOptionSettingsCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [config, setConfig] = useState<IQOptionConfig | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  
  // Agent state
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [isCheckingAgent, setIsCheckingAgent] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState('PRACTICE');

  useEffect(() => {
    if (isOpen && user) {
      loadConfig();
      checkAgentStatus();
    }
  }, [isOpen, user]);

  // Listen for agent state changes
  useEffect(() => {
    const unsubscribe = localAgentService.onStateChange((state) => {
      setAgentState(state);
    });
    return () => unsubscribe();
  }, []);

  const checkAgentStatus = async () => {
    setIsCheckingAgent(true);
    try {
      const state = await localAgentService.getState();
      setAgentState(state);
    } catch (error) {
      console.log('Agent not available');
    } finally {
      setIsCheckingAgent(false);
    }
  };

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

  const saveConfig = async () => {
    if (!user) {
      toast({ title: 'Erro', description: 'Você precisa estar logado', variant: 'destructive' });
      return;
    }

    if (!email.trim() || !password.trim()) {
      toast({ title: 'Erro', description: 'Email e senha são obrigatórios', variant: 'destructive' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({ title: 'Erro', description: 'Email inválido', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      if (config) {
        const { error } = await supabase
          .from('iqoption_config')
          .update({
            email: email.trim(),
            password: password.trim(),
            account_type: accountType,
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        await supabase
          .from('iqoption_config')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('is_active', true);

        const { error } = await supabase
          .from('iqoption_config')
          .insert({
            email: email.trim(),
            password: password.trim(),
            account_type: accountType,
            user_id: user.id,
          });

        if (error) throw error;
      }

      toast({ title: 'Sucesso', description: 'Credenciais salvas!' });
      loadConfig();
    } catch (error) {
      console.error('Error saving config:', error);
      toast({ title: 'Erro', description: 'Falha ao salvar credenciais', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const testAgentConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const state = await localAgentService.getState();
      
      if (state?.connected) {
        setTestResult('success');
        setAgentState(state);
        toast({ 
          title: '✅ Agente Local conectado!', 
          description: `Saldo: $${state.balance.toFixed(2)} (${state.accountType === 'PRACTICE' ? 'Demo' : 'Real'})`
        });
        
        if (config) {
          await supabase
            .from('iqoption_config')
            .update({ last_connected_at: new Date().toISOString() })
            .eq('id', config.id);
          loadConfig();
        }
      } else {
        setTestResult('error');
        toast({ 
          title: '⚠️ Agente não conectado', 
          description: 'Abra o Agente Local e faça login primeiro.',
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Test error:', error);
      setTestResult('error');
      toast({ 
        title: '❌ Agente não encontrado', 
        description: 'O Agente Local não está rodando. Clique em "Abrir Agente" para iniciar.',
        variant: 'destructive'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const openLocalAgent = () => {
    const agentUrl = localAgentService.getAgentUrl();
    window.open(agentUrl, 'iqoption_agent', 'width=700,height=800,menubar=no,toolbar=no');
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
    <Card className="border-orange-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <CardTitle className="text-lg">IQ Option</CardTitle>
            {agentState?.connected && (
              <Badge variant="default" className="text-xs bg-green-500">
                <Monitor className="w-3 h-3 mr-1" />
                Agente Ativo
              </Badge>
            )}
            {!agentState?.connected && config?.last_connected_at && (
              <Badge variant="outline" className="text-xs">
                <Wifi className="w-3 h-3 mr-1" />
                Salvo
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            ✕
          </Button>
        </div>
        <CardDescription>
          Use o Agente Local para conexão estável sem bloqueio de IP
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Agent Status */}
        <div className={`p-4 rounded-lg border ${agentState?.connected ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Monitor className={`w-5 h-5 ${agentState?.connected ? 'text-green-500' : 'text-blue-500'}`} />
              <span className="font-medium">Agente Local</span>
            </div>
            {agentState?.connected && (
              <Badge variant="default" className="bg-green-500">
                Conectado
              </Badge>
            )}
          </div>
          
          {agentState?.connected ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                💰 Saldo: <span className="font-bold text-green-500">${agentState.balance.toFixed(2)}</span>
                <span className="ml-2 text-xs">({agentState.accountType === 'PRACTICE' ? 'Demo' : 'Real'})</span>
              </p>
              <p className="text-xs text-muted-foreground">
                📊 {agentState.assets?.length || 0} ativos disponíveis
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                O Agente Local roda no seu PC e conecta usando seu próprio IP, evitando bloqueios.
              </p>
              <Button 
                onClick={openLocalAgent} 
                variant="outline" 
                size="sm" 
                className="gap-2 w-full"
              >
                <ExternalLink className="w-4 h-4" />
                Abrir Agente Local
              </Button>
            </div>
          )}
        </div>

        {/* Credentials for backup/reference */}
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
            <span className="group-open:rotate-90 transition-transform">▶</span>
            Credenciais (backup)
          </summary>
          
          <div className="mt-3 space-y-3 pl-4 border-l-2 border-muted">
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
            </div>

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

            <Button onClick={saveConfig} className="w-full gap-2" size="sm" disabled={isLoading}>
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Credenciais
            </Button>
          </div>
        </details>

        {/* Info box */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-400">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            <strong>Como usar:</strong> Clique em "Abrir Agente Local", faça login com suas credenciais da IQ Option, 
            e mantenha a janela aberta enquanto opera. O painel se comunicará automaticamente com o agente.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button 
            onClick={openLocalAgent} 
            variant={agentState?.connected ? "outline" : "default"}
            className="flex-1 gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            {agentState?.connected ? 'Ver Agente' : 'Abrir Agente'}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={testAgentConnection} 
            className="gap-2"
            disabled={isTesting}
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
            Testar
          </Button>
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
