// IQ Option Client-Side Service
// Connects directly from the browser to avoid server IP blocking

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
  private reconnectTimeout: NodeJS.Timeout | null = null;
  
  private onConnectionChange: ConnectionCallback | null = null;
  private onBalanceChange: BalanceCallback | null = null;
  private pendingTradeResolve: ((result: TradeResult) => void) | null = null;

  // IQ Option endpoints
  private readonly AUTH_URL = 'https://auth.iqoption.com/api/v2/login';
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
    console.log('🔐 Client-side login to IQ Option...');
    this.credentials = credentials;
    this.updateStatus('connecting');

    try {
      // Use a CORS proxy or direct connection
      // Note: This may require a proxy due to CORS restrictions
      const response = await fetch(this.AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          identifier: credentials.email,
          password: credentials.password,
        }),
        mode: 'cors',
      });

      const data = await response.json();
      
      if (data.code === 'success' && data.ssid) {
        console.log('✅ Login successful');
        this.ssid = data.ssid;
        await this.connectWebSocket();
        return { success: true };
      } else {
        console.error('❌ Login failed:', data.message);
        this.updateStatus('error');
        return { success: false, error: data.message || 'Login failed' };
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      // If CORS error, try WebSocket-only approach
      if (error instanceof TypeError && String(error).includes('CORS')) {
        console.log('⚠️ CORS error, trying direct WebSocket connection...');
        return this.tryDirectWebSocketLogin(credentials);
      }
      this.updateStatus('error');
      return { success: false, error: String(error) };
    }
  }

  private async tryDirectWebSocketLogin(credentials: IQOptionCredentials): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.credentials = credentials;
      
      const ws = new WebSocket(this.WS_URL);
      let loginSent = false;
      
      const timeout = setTimeout(() => {
        ws.close();
        this.updateStatus('error');
        resolve({ success: false, error: 'Connection timeout' });
      }, 15000);

      ws.onopen = () => {
        console.log('📡 WebSocket connected, sending credentials...');
        // Send login via WebSocket
        ws.send(JSON.stringify({
          name: 'authenticate',
          msg: {
            email: credentials.email,
            password: credentials.password,
          },
        }));
        loginSent = true;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.name === 'authenticated' || data.name === 'profile') {
            console.log('✅ Authenticated via WebSocket');
            clearTimeout(timeout);
            this.ws = ws;
            this.ssid = data.ssid || 'websocket_session';
            this.handleProfileMessage(data.msg);
            this.updateStatus('connected');
            this.setupWebSocketHandlers();
            resolve({ success: true });
          } else if (data.name === 'auth-error' || data.name === 'error') {
            clearTimeout(timeout);
            ws.close();
            this.updateStatus('error');
            resolve({ success: false, error: data.msg?.message || 'Authentication failed' });
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        clearTimeout(timeout);
        this.updateStatus('error');
        resolve({ success: false, error: 'WebSocket connection failed' });
      };
    });
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.ssid) {
      console.error('No SSID available');
      return;
    }

    return new Promise((resolve, reject) => {
      console.log('📡 Connecting to IQ Option WebSocket...');
      
      this.ws = new WebSocket(this.WS_URL);
      
      const timeout = setTimeout(() => {
        console.error('WebSocket connection timeout');
        this.ws?.close();
        this.updateStatus('error');
        reject(new Error('Connection timeout'));
      }, 15000);

      this.ws.onopen = () => {
        console.log('🔌 WebSocket opened, authenticating with SSID...');
        this.ws?.send(JSON.stringify({
          name: 'ssid',
          msg: this.ssid,
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.name === 'profile') {
            console.log('✅ WebSocket authenticated');
            clearTimeout(timeout);
            this.handleProfileMessage(data.msg);
            this.updateStatus('connected');
            this.reconnectAttempts = 0;
            this.setupWebSocketHandlers();
            resolve();
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        clearTimeout(timeout);
        this.updateStatus('error');
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.updateStatus('disconnected');
        this.tryReconnect();
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
      if (this.ssid) {
        this.connectWebSocket().catch(console.error);
      } else if (this.credentials) {
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

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws?.close();
    this.ws = null;
    this.ssid = null;
    this.updateStatus('disconnected');
  }
}

// Singleton instance
export const iqOptionClient = new IQOptionClient();
