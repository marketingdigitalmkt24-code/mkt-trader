import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Switch } from './ui/switch';
import { Settings, Phone, Plus, Trash2, Save, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from './ui/label';

interface WhatsAppNumber {
  id: string;
  phone_number: string;
  name: string | null;
  is_active: boolean;
}

interface ZAPIConfig {
  id: string;
  instance_id: string;
  token: string;
  client_token: string;
  is_active: boolean;
}

export function WhatsAppSettingsCard() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [zapiConfig, setZapiConfig] = useState<ZAPIConfig | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // New number form
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  
  // Z-API form
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [clientToken, setClientToken] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load numbers
      const { data: numbersData, error: numbersError } = await supabase
        .from('whatsapp_numbers')
        .select('*')
        .order('created_at', { ascending: false });

      if (numbersError) throw numbersError;
      setNumbers(numbersData || []);

      // Load Z-API config
      const { data: configData, error: configError } = await supabase
        .from('zapi_config')
        .select('*')
        .limit(1)
        .single();

      if (configData) {
        setZapiConfig(configData);
        setInstanceId(configData.instance_id);
        setToken(configData.token);
        setClientToken(configData.client_token);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addNumber = async () => {
    if (!newPhone.trim()) {
      toast({ title: 'Erro', description: 'Número é obrigatório', variant: 'destructive' });
      return;
    }

    // Validate phone format (basic validation)
    const cleanPhone = newPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      toast({ title: 'Erro', description: 'Número inválido (deve ter 10-13 dígitos)', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase
        .from('whatsapp_numbers')
        .insert({
          phone_number: cleanPhone,
          name: newName.trim() || null,
        });

      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Número adicionado!' });
      setNewPhone('');
      setNewName('');
      loadData();
    } catch (error) {
      console.error('Error adding number:', error);
      toast({ title: 'Erro', description: 'Falha ao adicionar número', variant: 'destructive' });
    }
  };

  const toggleNumber = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('whatsapp_numbers')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error toggling number:', error);
    }
  };

  const deleteNumber = async (id: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_numbers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Removido', description: 'Número removido com sucesso' });
      loadData();
    } catch (error) {
      console.error('Error deleting number:', error);
    }
  };

  const saveZAPIConfig = async () => {
    if (!instanceId.trim() || !token.trim() || !clientToken.trim()) {
      toast({ title: 'Erro', description: 'Todos os campos do Z-API são obrigatórios', variant: 'destructive' });
      return;
    }

    try {
      if (zapiConfig) {
        // Update existing
        const { error } = await supabase
          .from('zapi_config')
          .update({
            instance_id: instanceId.trim(),
            token: token.trim(),
            client_token: clientToken.trim(),
          })
          .eq('id', zapiConfig.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('zapi_config')
          .insert({
            instance_id: instanceId.trim(),
            token: token.trim(),
            client_token: clientToken.trim(),
          });

        if (error) throw error;
      }

      toast({ title: 'Sucesso', description: 'Configurações do Z-API salvas!' });
      loadData();
    } catch (error) {
      console.error('Error saving Z-API config:', error);
      toast({ title: 'Erro', description: 'Falha ao salvar configurações', variant: 'destructive' });
    }
  };

  if (!isOpen) {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Settings className="w-4 h-4" />
        Configurar WhatsApp
      </Button>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-green-500" />
            <CardTitle className="text-lg">Configurações WhatsApp</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            ✕
          </Button>
        </div>
        <CardDescription>
          Configure os números e credenciais do Z-API
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Z-API Configuration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Credenciais Z-API</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTokens(!showTokens)}
            >
              {showTokens ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          
          <div className="grid gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Instance ID</Label>
              <Input
                placeholder="Seu Instance ID"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                type={showTokens ? 'text' : 'password'}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Token</Label>
              <Input
                placeholder="Seu Token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type={showTokens ? 'text' : 'password'}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Client Token</Label>
              <Input
                placeholder="Seu Client Token"
                value={clientToken}
                onChange={(e) => setClientToken(e.target.value)}
                type={showTokens ? 'text' : 'password'}
              />
            </div>
          </div>
          
          <Button onClick={saveZAPIConfig} className="w-full gap-2">
            <Save className="w-4 h-4" />
            Salvar Credenciais
          </Button>
        </div>

        <div className="border-t pt-4">
          {/* Add Number Form */}
          <h3 className="font-semibold text-sm mb-3">Números para Notificação</h3>
          
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Número (ex: 11999999999)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Nome (opcional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-32"
            />
            <Button onClick={addNumber} size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Numbers List */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : numbers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum número cadastrado
              </p>
            ) : (
              numbers.map((num) => (
                <div
                  key={num.id}
                  className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={num.is_active}
                      onCheckedChange={(checked) => toggleNumber(num.id, checked)}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {num.phone_number}
                      </p>
                      {num.name && (
                        <p className="text-xs text-muted-foreground">{num.name}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteNumber(num.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}