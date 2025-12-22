// IQ Option Client Service
// Uses Edge Functions as proxy to avoid browser CORS/blocking issues

import { supabase } from '@/integrations/supabase/client';

interface IQOptionCredentials {
  email: string;
  password: string;
  accountType: string;
  userId?: string;
}

interface BalanceInfo {
  balance: number;
  currency: string;
  accountType: string;
}

interface TradeResult {
  success: boolean;
  tradeId?: string;
  error?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ConnectionCallback = (status: ConnectionStatus) => void;
type BalanceCallback = (balance: BalanceInfo | null) => void;

class IQOptionClient {
  private connectionStatus: ConnectionStatus = 'disconnected';
  private credentials: IQOptionCredentials | null = null;
  private balanceInfo: BalanceInfo | null = null;
  private lastConnectedAt: Date | null = null;
  
  private onConnectionChange: ConnectionCallback | null = null;
  private onBalanceChange: BalanceCallback | null = null;

  setCallbacks(onConnection: ConnectionCallback, onBalance: BalanceCallback) {
    this.onConnectionChange = onConnection;
    this.onBalanceChange = onBalance;
  }

  private updateStatus(status: ConnectionStatus) {
    this.connectionStatus = status;
    this.onConnectionChange?.(status);
  }

  async login(credentials: IQOptionCredentials): Promise<{ success: boolean; error?: string; balance?: number }> {
    console.log('🔐 Authenticating with IQ Option via Edge Function...');
    this.credentials = credentials;
    this.updateStatus('connecting');

    try {
      const { data, error } = await supabase.functions.invoke('iqoption-auth', {
        body: {
          email: credentials.email,
          password: credentials.password,
          accountType: credentials.accountType,
          userId: credentials.userId,
        },
      });

      if (error) {
        console.error('❌ Edge function error:', error);
        this.updateStatus('error');
        return { success: false, error: 'Erro ao conectar com o servidor' };
      }

      if (data?.success) {
        console.log('✅ Connected successfully');
        this.balanceInfo = {
          balance: data.balance || 0,
          currency: data.currency || 'USD',
          accountType: data.accountType || credentials.accountType,
        };
        this.lastConnectedAt = new Date();
        this.updateStatus('connected');
        this.onBalanceChange?.(this.balanceInfo);
        
        return { 
          success: true, 
          balance: data.balance 
        };
      } else {
        console.error('❌ Login failed:', data?.error);
        this.updateStatus('error');
        return { 
          success: false, 
          error: data?.error || 'Falha na autenticação' 
        };
      }
    } catch (error) {
      console.error('❌ Connection error:', error);
      this.updateStatus('error');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      };
    }
  }

  async refreshBalance(): Promise<BalanceInfo | null> {
    if (!this.credentials) {
      return null;
    }

    try {
      const { data, error } = await supabase.functions.invoke('iqoption-get-balance', {
        body: { userId: this.credentials.userId },
      });

      if (!error && data?.success) {
        this.balanceInfo = {
          balance: data.balance,
          currency: data.currency,
          accountType: data.accountType,
        };
        this.lastConnectedAt = new Date();
        this.updateStatus('connected');
        this.onBalanceChange?.(this.balanceInfo);
        return this.balanceInfo;
      }
    } catch (e) {
      console.error('Balance refresh error:', e);
    }

    return null;
  }

  async placeTrade(asset: string, direction: 'call' | 'put', amount: number, expiration: number): Promise<TradeResult> {
    if (this.connectionStatus !== 'connected') {
      return { success: false, error: 'Não conectado à IQ Option' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('iqoption-place-trade', {
        body: {
          asset,
          direction,
          amount,
          expiration,
          userId: this.credentials?.userId,
        },
      });

      if (error) {
        return { success: false, error: 'Erro ao executar trade' };
      }

      return {
        success: data?.success || false,
        tradeId: data?.tradeId,
        error: data?.error,
      };
    } catch (e) {
      return { 
        success: false, 
        error: e instanceof Error ? e.message : 'Erro desconhecido' 
      };
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  getBalance(): BalanceInfo | null {
    return this.balanceInfo;
  }

  getLastConnectedAt(): Date | null {
    return this.lastConnectedAt;
  }

  disconnect() {
    this.connectionStatus = 'disconnected';
    this.credentials = null;
    this.balanceInfo = null;
    this.updateStatus('disconnected');
    this.onBalanceChange?.(null);
  }
}

// Singleton instance
export const iqOptionClient = new IQOptionClient();
