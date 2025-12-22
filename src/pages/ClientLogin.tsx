import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIQOptionAuth } from '@/contexts/IQOptionAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Bot, Eye, EyeOff, Lock, Mail, LogIn, ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import { z } from 'zod';

const authSchema = z.object({
  email: z.string().email('Email inválido').max(255, 'Email muito longo'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres').max(100, 'Senha muito longa'),
});

const ClientLogin = () => {
  const navigate = useNavigate();
  const { signIn, isLoading, connectionStatus } = useIQOptionAuth();
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      const errorMessage = validation.error.errors[0]?.message || 'Dados inválidos';
      toast({ title: 'Erro de validação', description: errorMessage, variant: 'destructive' });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ 
          title: 'Erro de Login', 
          description: error, 
          variant: 'destructive' 
        });
      } else {
        toast({ title: 'Bem-vindo!', description: 'Conectado à IQ Option com sucesso' });
        navigate('/client');
      }
    } catch (err) {
      toast({ title: 'Erro', description: 'Ocorreu um erro inesperado', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusMessage = () => {
    switch (connectionStatus) {
      case 'connecting':
        return 'Conectando à IQ Option...';
      case 'error':
        return 'Erro na conexão';
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Link */}
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para sinais
        </Link>

        <Card className="border-primary/20 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">
              Área do Cliente
            </CardTitle>
            <CardDescription>
              Entre com suas credenciais da IQ Option
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email IQ Option
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="bg-secondary/50"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Senha IQ Option
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="bg-secondary/50 pr-10"
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

              {/* Status Message */}
              {getStatusMessage() && (
                <p className="text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
                  {connectionStatus === 'connecting' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {getStatusMessage()}
                </p>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full gap-2"
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Entrar com IQ Option
                  </>
                )}
              </Button>
            </form>

            {/* Info */}
            <p className="text-xs text-muted-foreground text-center mt-6">
              Use suas credenciais da conta IQ Option
            </p>
          </CardContent>
        </Card>

        {/* Security Notice */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          🔒 Conexão direta e segura com a IQ Option
        </p>
      </div>
    </div>
  );
};

export default ClientLogin;
