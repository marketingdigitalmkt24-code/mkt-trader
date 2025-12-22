// IQ Option Client-Side Service
// Connects directly from the browser via WebSocket

interface IQOptionCredentials {
  email: string;
  password: string;
  accountType: string;
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
  private ws: WebSocket | null = null;
  private ssid: string | null = null;
  private credentials: IQOptionCredentials | null = null;
  private balanceId: number = 0;
  private activeAssets: Record<string, number> = {};
  private connectionStatus: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  
  private onConnectionChange: ConnectionCallback | null = null;
  private onBalanceChange: BalanceCallback | null = null;
  private pendingTradeResolve: ((result: TradeResult) => void) | null = null;

  // IQ Option WebSocket endpoints
  private readonly WS_URL = 'wss://iqoption.com/echo/websocket';

  setCallbacks(onConnection: ConnectionCallback, onBalance: BalanceCallback) {
    this.onConnectionChange = onConnection;
    this.onBalanceChange = onBalance;
  }

  private updateStatus(status: ConnectionStatus) {
    this.connectionStatus = status;
    this.onConnectionChange?.(status);
  }

  async login(credentials: IQOptionCredentials): Promise<{ success: boolean; error?: string }> {
    console.log('🔐 Connecting to IQ Option via WebSocket...');
    this.credentials = credentials;
    this.updateStatus('connecting');

    // Close existing connection if any
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    return new Promise((resolve) => {
      let authCompleted = false;
      
      const timeout = setTimeout(() => {
        if (!authCompleted) {
          console.error('❌ Connection timeout');
          this.ws?.close();
          this.ws = null;
          this.updateStatus('error');
          resolve({ success: false, error: 'Tempo de conexão esgotado. Verifique sua conexão de internet.' });
        }
      }, 20000);

      try {
        this.ws = new WebSocket(this.WS_URL);
      } catch (error) {
        clearTimeout(timeout);
        console.error('❌ Failed to create WebSocket:', error);
        this.updateStatus('error');
        resolve({ success: false, error: 'Falha ao criar conexão WebSocket' });
        return;
      }

      this.ws.onopen = () => {
        console.log('📡 WebSocket connected, sending authentication...');
        // IQ Option expects SSID auth, but we can try direct auth message
        this.ws?.send(JSON.stringify({
          name: 'ssid',
          msg: ''
        }));
        
        // Wait a bit then send authenticate
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              name: 'authenticate',
              msg: {
                email: credentials.email,
                password: credentials.password,
              },
            }));
          }
        }, 100);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WS message:', data.name);
          
          // Successful authentication - we get profile message
          if (data.name === 'profile') {
            console.log('✅ Authenticated successfully');
            authCompleted = true;
            clearTimeout(timeout);
            this.ssid = 'authenticated';
            this.handleProfileMessage(data.msg);
            this.updateStatus('connected');
            this.reconnectAttempts = 0;
            this.setupWebSocketHandlers();
            resolve({ success: true });
            return;
          }

          // Auth error responses
          if (data.name === 'authenticated') {
            if (data.msg === false) {
              authCompleted = true;
              clearTimeout(timeout);
              this.ws?.close();
              this.ws = null;
              this.updateStatus('error');
              resolve({ success: false, error: 'Email ou senha incorretos' });
              return;
            }
          }

          // SSID response - means we need to authenticate differently
          if (data.name === 'ssid') {
            // Server asking for SSID, but we don't have one - try authenticate
            console.log('📤 Server requested SSID, sending auth...');
          }

          // Error message
          if (data.name === 'error' || data.name === 'auth-error') {
            authCompleted = true;
            clearTimeout(timeout);
            this.ws?.close();
            this.ws = null;
            this.updateStatus('error');
            const errorMsg = data.msg?.message || data.msg || 'Falha na autenticação';
            resolve({ success: false, error: errorMsg });
            return;
          }

          // Timeouts
          if (data.name === 'timeSync') {
            // Ignore time sync
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        if (!authCompleted) {
          authCompleted = true;
          clearTimeout(timeout);
          this.updateStatus('error');
          resolve({ 
            success: false, 
            error: 'Erro na conexão WebSocket. A IQ Option pode estar bloqueando conexões do navegador.' 
          });
        }
      };

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        if (!authCompleted) {
          authCompleted = true;
          clearTimeout(timeout);
          this.updateStatus('error');
          resolve({ 
            success: false, 
            error: `Conexão fechada (código: ${event.code}). Tente novamente.` 
          });
        }
      };
    });
  }

  private handleProfileMessage(profile: any) {
    const balances = profile?.balances || [];
    
    for (const balance of balances) {
      if (this.credentials?.accountType === 'PRACTICE' && balance.type === 4) {
        this.balanceId = balance.id;
        this.onBalanceChange?.({
          balance: balance.amount,
          currency: balance.currency,
          accountType: 'PRACTICE',
        });
        break;
      } else if (this.credentials?.accountType === 'REAL' && balance.type === 1) {
        this.balanceId = balance.id;
        this.onBalanceChange?.({
          balance: balance.amount,
          currency: balance.currency,
          accountType: 'REAL',
        });
        break;
      }
    }

    // Request initialization data
    this.ws?.send(JSON.stringify({
      name: 'sendMessage',
      msg: {
        name: 'get-initialization-data',
        version: '3.0',
        body: {},
      },
    }));
  }

  private setupWebSocketHandlers() {
    if (!this.ws) return;

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Skip timeSync messages
        if (data.name === 'timeSync') return;

        // Handle balance updates
        if (data.name === 'balance-changed') {
          const balance = data.msg;
          if (balance.id === this.balanceId) {
            this.onBalanceChange?.({
              balance: balance.current_amount,
              currency: balance.currency,
              accountType: this.credentials?.accountType || 'PRACTICE',
            });
          }
        }

        // Handle initialization data
        if (data.name === 'initialization-data') {
          console.log('📊 Received initialization data');
          const binary = data.msg?.binary?.actives || {};
          
          this.activeAssets = {};
          for (const [id, info] of Object.entries(binary)) {
            const assetInfo = info as { name?: string; enabled?: boolean; is_suspended?: boolean };
            if (assetInfo.enabled && !assetInfo.is_suspended) {
              const name = assetInfo.name || '';
              this.activeAssets[name.toUpperCase()] = parseInt(id);
            }
          }
          console.log('📈 Available assets:', Object.keys(this.activeAssets).length);
        }

        // Handle trade responses
        if (data.name === 'binary-options.option-opened') {
          const tradeId = data.msg?.id || data.msg?.option_id;
          if (tradeId && this.pendingTradeResolve) {
            this.pendingTradeResolve({ success: true, tradeId: String(tradeId) });
            this.pendingTradeResolve = null;
          }
        }

        if (data.name === 'option' && data.msg?.id) {
          if (data.msg.message?.includes('not found')) {
            this.pendingTradeResolve?.({ success: false, error: data.msg.message });
          } else {
            this.pendingTradeResolve?.({ success: true, tradeId: String(data.msg.id) });
          }
          this.pendingTradeResolve = null;
        }

        // Handle errors
        if (data.name === 'error') {
          this.pendingTradeResolve?.({ 
            success: false, 
            error: data.msg?.message || 'Unknown error' 
          });
          this.pendingTradeResolve = null;
        }

      } catch (e) {
        console.error('Message parse error:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('🔌 WebSocket closed');
      this.updateStatus('disconnected');
      this.tryReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateStatus('error');
    };
  }

  private tryReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.credentials) {
        this.login(this.credentials).catch(console.error);
      }
    }, delay);
  }

  async placeTrade(asset: string, direction: 'call' | 'put', amount: number, expiration: number): Promise<TradeResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'Not connected to IQ Option' };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingTradeResolve = null;
        resolve({ success: false, error: 'Trade timeout' });
      }, 20000);

      this.pendingTradeResolve = (result) => {
        clearTimeout(timeout);
        resolve(result);
      };

      // Find asset ID
      const assetName = asset.toUpperCase().replace(/\//g, '').replace(/-/g, '');
      const assetNameWithDash = asset.toUpperCase().replace(/\//g, '-');
      
      let assetId = this.activeAssets[assetName] || 
                    this.activeAssets[assetNameWithDash] ||
                    this.activeAssets[asset.toUpperCase()];

      if (!assetId) {
        // Try partial match for OTC
        const baseAsset = assetName.replace('OTC', '').replace('-', '');
        for (const [name, id] of Object.entries(this.activeAssets)) {
          if (name.includes(baseAsset)) {
            assetId = id;
            break;
          }
        }
      }

      if (!assetId) {
        clearTimeout(timeout);
        resolve({ success: false, error: `Asset ${asset} not available` });
        return;
      }

      // Calculate expiration time
      const now = Math.floor(Date.now() / 1000);
      const nextMinute = Math.ceil(now / 60) * 60;
      const expirationTime = nextMinute + (expiration * 60);

      console.log(`📈 Placing ${direction.toUpperCase()} on ${asset} (ID: ${assetId})`);

      // Set balance first
      this.ws?.send(JSON.stringify({
        name: 'sendMessage',
        msg: {
          name: 'set-active-balance',
          version: '1.0',
          body: { balance_id: this.balanceId },
        },
      }));

      // Place trade
      this.ws?.send(JSON.stringify({
        name: 'sendMessage',
        msg: {
          name: 'binary-options.open-option',
          version: '1.0',
          body: {
            user_balance_id: this.balanceId,
            active_id: assetId,
            option_type_id: 3,
            direction: direction,
            expired: expirationTime,
            price: amount,
            profit_percent: 0,
          },
        },
      }));
    });
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  getActiveAssets(): string[] {
    return Object.keys(this.activeAssets);
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.ssid = null;
    this.updateStatus('disconnected');
  }
}

// Singleton instance
export const iqOptionClient = new IQOptionClient();
