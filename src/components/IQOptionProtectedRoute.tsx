import { Navigate } from 'react-router-dom';
import { useIQOptionAuth } from '@/contexts/IQOptionAuthContext';
import { Loader2 } from 'lucide-react';

interface IQOptionProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  requireAdmin?: boolean;
}

export function IQOptionProtectedRoute({ 
  children, 
  redirectTo = '/admin/login',
  requireAdmin = false 
}: IQOptionProtectedRouteProps) {
  const { user, isLoading, isConnected } = useIQOptionAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user || !isConnected) {
    return <Navigate to={redirectTo} replace />;
  }

  if (requireAdmin && !user.isAdmin) {
    return <Navigate to="/client" replace />;
  }

  return <>{children}</>;
}
