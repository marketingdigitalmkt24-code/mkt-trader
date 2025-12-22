import { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, Mail, Lock, Eye, EyeOff, Loader2, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email('Email inválido').max(255, 'Email muito longo'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres').max(100, 'Senha muito longa'),
});

interface ClientProfile {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
  is_active: boolean;
}

export function UserManagementCard() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [users, setUsers] = useState<ClientProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Fetch registered users from client_profiles table
  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('client_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        return;
      }

      setUsers(data || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = userSchema.safeParse({ email, password });
    if (!validation.success) {
      const errorMessage = validation.error.errors[0]?.message || 'Dados inválidos';
      toast({ title: 'Erro de validação', description: errorMessage, variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    
    try {
      // Create user using Supabase Auth Admin API via edge function
      const { data, error } = await supabase.functions.invoke('create-client-user', {
        body: { email, password }
      });

      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return;
      }

      if (data?.error) {
        toast({ title: 'Erro', description: data.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Sucesso', description: 'Usuário cliente criado com sucesso!' });
      setEmail('');
      setPassword('');
      fetchUsers();
    } catch (err) {
      toast({ title: 'Erro', description: 'Erro ao criar usuário', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('client_profiles')
        .update({ is_active: !currentStatus })
        .eq('user_id', userId);

      if (error) {
        toast({ title: 'Erro', description: 'Erro ao atualizar status', variant: 'destructive' });
        return;
      }

      toast({ title: 'Sucesso', description: `Usuário ${!currentStatus ? 'ativado' : 'desativado'}` });
      fetchUsers();
    } catch (err) {
      toast({ title: 'Erro', description: 'Erro ao atualizar status', variant: 'destructive' });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('client_profiles')
        .delete()
        .eq('user_id', userId);

      if (error) {
        toast({ title: 'Erro', description: 'Erro ao remover usuário', variant: 'destructive' });
        return;
      }

      // Also remove from user_roles
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      toast({ title: 'Sucesso', description: 'Usuário removido' });
      fetchUsers();
    } catch (err) {
      toast({ title: 'Erro', description: 'Erro ao remover usuário', variant: 'destructive' });
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <CardTitle>Gerenciar Usuários</CardTitle>
        </div>
        <CardDescription>
          Cadastre novos usuários clientes que terão acesso ao painel de trading
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create User Form */}
        <form onSubmit={handleCreateUser} className="space-y-4 p-4 bg-secondary/30 rounded-lg">
          <h4 className="font-medium flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Novo Usuário Cliente
          </h4>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <Input
                id="new-email"
                type="email"
                placeholder="cliente@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isCreating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Senha do cliente"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isCreating}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isCreating} className="w-full sm:w-auto">
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Criar Usuário
              </>
            )}
          </Button>
        </form>

        {/* Users List */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">
            Usuários Cadastrados ({users.length})
          </h4>
          
          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum usuário cliente cadastrado
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {user.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Criado em: {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={user.is_active ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() => handleToggleActive(user.user_id, user.is_active)}
                    >
                      {user.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteUser(user.user_id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}