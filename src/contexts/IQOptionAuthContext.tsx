import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { iqOptionClient } from '@/services/IQOptionClient';
import { supabase } from '@/integrations/supabase/client';

interface IQOptionUser {
  email: string;
  accountType: string;
  isAdmin?: boolean;
}

interface BalanceInfo {
  balance: number;
  currency: string;
  accountType: string;
}

interface IQOptionAuthContextType {
  user: IQOptionUser | null;
  balance: BalanceInfo | null;
  isLoading: boolean;
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => void;
}

const IQOptionAuthContext = createContext<IQOptionAuthContextType | undefined>(undefined);

export function IQOptionAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<IQOptionUser | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  // Set up callbacks for IQ Option client
  useEffect(() => {
    iqOptionClient.setCallbacks(
      (status) => {
        setConnectionStatus(status);
        setIsConnected(status === 'connected');
      },
      (balanceInfo) => {
        setBalance(balanceInfo);
      }
    );

    // Try to restore session from localStorage
    const savedSession = localStorage.getItem('iq_session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        // Don't auto-login, just show that we have saved credentials
        setUser(session.user);
      } catch (e) {
        localStorage.removeItem('iq_session');
      }
    }
    setIsLoading(false);
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    setIsLoading(true);
    setConnectionStatus('connecting');

    try {
      // First, try to find the IQ Option config in database to get account type
      const { data: configs } = await supabase
        .from('iqoption_config')
        .select('*')
        .eq('email', email)
        .eq('is_active', true)
        .limit(1);

      const config = configs?.[0];
      const accountType = config?.account_type || 'PRACTICE';

      // Try to login to IQ Option
      const result = await iqOptionClient.login({
        email,
        password,
        accountType,
      });

      if (result.success) {
        // Check if this user is an admin
        const { data: adminConfig } = await supabase
          .from('iqoption_config')
          .select('user_id')
          .limit(1);

        // If there's no config yet, this is the first/admin user
        // Or check if this email matches the stored admin email
        const isAdmin = !adminConfig || adminConfig.length === 0 || 
          (config && !config.user_id); // Legacy admin without user_id

        const userData: IQOptionUser = {
          email,
          accountType,
          isAdmin,
        };

        setUser(userData);
        setIsConnected(true);

        // Save session
        localStorage.setItem('iq_session', JSON.stringify({
          user: userData,
          timestamp: Date.now(),
        }));

        return { error: null };
      } else {
        setConnectionStatus('error');
        return { error: result.error || 'Falha ao conectar com IQ Option' };
      }
    } catch (error) {
      console.error('Login error:', error);
      setConnectionStatus('error');
      return { error: 'Erro ao tentar fazer login' };
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = () => {
    iqOptionClient.disconnect();
    setUser(null);
    setBalance(null);
    setIsConnected(false);
    setConnectionStatus('disconnected');
    localStorage.removeItem('iq_session');
  };

  return (
    <IQOptionAuthContext.Provider
      value={{
        user,
        balance,
        isLoading,
        isConnected,
        connectionStatus,
        signIn,
        signOut,
      }}
    >
      {children}
    </IQOptionAuthContext.Provider>
  );
}

export function useIQOptionAuth() {
  const context = useContext(IQOptionAuthContext);
  if (context === undefined) {
    throw new Error('useIQOptionAuth must be used within an IQOptionAuthProvider');
  }
  return context;
}
