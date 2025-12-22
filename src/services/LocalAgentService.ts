// Serviço para comunicar com o Agente Local via BroadcastChannel

export interface AgentState {
  connected: boolean;
  balance: number;
  accountType: 'PRACTICE' | 'REAL';
  assets: Array<{ id: number; name: string; enabled: boolean }>;
}

export interface TradeRequest {
  asset: string;
  direction: 'call' | 'put';
  amount: number;
  expiration: number;
}

class LocalAgentService {
  private channel: BroadcastChannel | null = null;
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private stateListeners: Set<(state: AgentState) => void> = new Set();
  private lastState: AgentState | null = null;
  private isAvailable = false;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('iqoption_agent');
      this.setupListeners();
      this.checkAgentAvailability();
    }
  }

  private setupListeners() {
    if (!this.channel) return;

    this.channel.onmessage = (event) => {
      const { type, requestId, data, error } = event.data;

      // Handle responses to our requests
      if (requestId && this.pendingRequests.has(requestId)) {
        const pending = this.pendingRequests.get(requestId)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);

        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(data);
        }
        return;
      }

      // Handle broadcasts from agent
      switch (type) {
        case 'state':
          this.lastState = data;
          this.isAvailable = true;
          this.notifyStateListeners(data);
          break;
        case 'pong':
          this.isAvailable = true;
          break;
      }
    };
  }

  private checkAgentAvailability() {
    // Ping periodically to check if agent is running
    setInterval(() => {
      this.ping().catch(() => {
        this.isAvailable = false;
        this.lastState = null;
      });
    }, 5000);
  }

  private sendRequest<T>(type: string, data?: any, timeoutMs = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.channel) {
        reject(new Error('BroadcastChannel not supported'));
        return;
      }

      const requestId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      this.channel.postMessage({ type, requestId, data });
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.sendRequest<{ connected: boolean }>('ping', null, 2000);
      this.isAvailable = true;
      return true;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  async getState(): Promise<AgentState | null> {
    try {
      const state = await this.sendRequest<AgentState>('getState', null, 3000);
      this.lastState = state;
      this.isAvailable = true;
      return state;
    } catch {
      return null;
    }
  }

  async getBalance(): Promise<{ balance: number; accountType: string } | null> {
    try {
      return await this.sendRequest('getBalance', null, 3000);
    } catch {
      return null;
    }
  }

  async placeTrade(trade: TradeRequest): Promise<any> {
    return this.sendRequest('placeTrade', trade, 30000);
  }

  onStateChange(listener: (state: AgentState) => void): () => void {
    this.stateListeners.add(listener);
    // Immediately call with last known state
    if (this.lastState) {
      listener(this.lastState);
    }
    return () => this.stateListeners.delete(listener);
  }

  private notifyStateListeners(state: AgentState) {
    this.stateListeners.forEach(listener => listener(state));
  }

  getIsAvailable(): boolean {
    return this.isAvailable;
  }

  getLastState(): AgentState | null {
    return this.lastState;
  }

  getAgentUrl(): string {
    return `${window.location.origin}/iqoption-agent.html`;
  }
}

export const localAgentService = new LocalAgentService();
