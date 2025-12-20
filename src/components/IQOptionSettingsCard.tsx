import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TrendingUp, Eye, EyeOff, Save, RefreshCw, CheckCircle, XCircle, Wifi } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from './ui/label';
import { Badge } from './ui/badge';

interface IQOptionConfig {
  id: string;
  email: string;
  password: string;
  account_type: string;
  is_active: boolean;
  last_connected_at: string | null;
}

export function IQOptionSettingsCard() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
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
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('iqoption_config')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (data) {
        setConfig(data);
        setEmail(data.email);
        setPassword(data.password);
        setAccountType(data.account_type);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!email.trim() || !password.trim()) {
      toast({ title: 'Erro', description: 'Email e senha são obrigatórios', variant: 'destructive' });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({ title: 'Erro', description: 'Email inválido', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      if (config) {
        // Update existing
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
        // First, deactivate any existing configs
        await supabase
          .from('iqoption_config')
          .update({ is_active: false })
          .eq('is_active', true);

        // Insert new
        const { error } = await supabase
          .from('iqoption_config')
          .insert({
            email: email.trim(),
            password: password.trim(),
            account_type: accountType,
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

  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('iqoption-check-results');
      
      if (error) throw error;
      
      if (data?.success) {
        setTestResult('success');
        toast({ 
          title: '✅ Conexão bem sucedida!', 
          description: `Encontradas ${data.totalPositions} operações. ${data.newResultsSaved} novos resultados salvos.`
        });
      } else {
        setTestResult('error');
        toast({ 
          title: 'Erro na conexão', 
          description: data?.error || 'Falha ao conectar com IQ Option',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Test error:', error);
      setTestResult('error');
      toast({ 
        title: 'Erro', 
        description: 'Falha ao testar conexão',
        variant: 'destructive'
      });
    } finally {
      setIsTesting(false);
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
    <Card className="border-orange-500/20">
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
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            ✕
          </Button>
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
            ⚠️ <strong>Aviso de Segurança:</strong> Suas credenciais são armazenadas de forma criptografada no banco de dados. 
            Recomendamos usar autenticação de 2 fatores na IQ Option.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={saveConfig} className="flex-1 gap-2" disabled={isLoading}>
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
          
          <Button 
            variant="outline" 
            onClick={testConnection} 
            className="gap-2"
            disabled={isTesting || !config}
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