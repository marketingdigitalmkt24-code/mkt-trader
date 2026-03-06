import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface QueuedTrade {
  id: string;
  asset: string;
  direction: string;
  amount: number;
  expiration: number;
  signal_id: string;
  timeframe: string;
  confluence_score: number;
  status: string;
  created_at: string;
}

interface TradeExecutorStats {
  pending: number;
  executed: number;
  failed: number;
  lastExecution: Date | null;
}

// IQ Option WebSocket trade executor
async function executeTradeViaWebSocket(
  ssid: string,
  accountType: string,
  trade: QueuedTrade
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://iqoption.com/echo/websocket');
    let balanceId = 0;
    let tradeId: string | null = null;
    let tradePlaced = false;

    const timeout = setTimeout(() => {
      ws.close();
      if (tradePlaced) {
        resolve({ success: true, tradeId: `pending_${Date.now()}` });
      } else {
        resolve({ success: false, error: 'Trade timeout' });
      }
    }, 25000);

    ws.onopen = () => {
      console.log(`🔗 [Queue] WS connected for ${trade.asset}`);
      ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.name === 'profile') {
          const balances = data.msg.balances || [];
          for (const b of balances) {
            if (accountType === 'PRACTICE' && b.type === 4) { balanceId = b.id; break; }
            if (accountType === 'REAL' && b.type === 1) { balanceId = b.id; break; }
          }
          if (!balanceId && balances.length > 0) balanceId = balances[0].id;

          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: { name: 'get-initialization-data', version: '3.0', body: {} }
          }));
        }

        if (data.name === 'initialization-data') {
          const binary = data.msg?.binary?.actives || {};
          const turbo = data.msg?.turbo?.actives || {};

          // Build asset map with turbo preference
          const assetMap: Record<string, { id: number; type: number; turboId?: number; binaryId?: number }> = {};

          function mapActives(actives: Record<string, any>, optType: number) {
            for (const [id, info] of Object.entries(actives)) {
              const ai = info as any;
              if (!ai.enabled || ai.is_suspended) continue;
              const name = (ai.name || '').toUpperCase();
              const numId = parseInt(id);

              function setA(key: string) {
                const ex = assetMap[key];
                if (ex) {
                  if (optType === 3) { ex.turboId = numId; ex.id = numId; ex.type = 3; }
                  else { ex.binaryId = numId; }
                } else {
                  assetMap[key] = {
                    id: numId, type: optType,
                    turboId: optType === 3 ? numId : undefined,
                    binaryId: optType === 1 ? numId : undefined,
                  };
                }
              }

              setA(name);
              let base = name.startsWith('FRONT.') ? name.replace('FRONT.', '') : name;
              const isOTC = base.includes('-OTC');
              const clean = base.replace('-OTC', '').replace('-OP', '');
              const slash = clean.length === 6 && /^[A-Z]{6}$/.test(clean)
                ? `${clean.slice(0, 3)}/${clean.slice(3)}` : null;

              if (isOTC) {
                [`${clean}-OTC`, `${clean} OTC`].forEach(v => setA(v));
                if (slash) [`${slash}-OTC`, `${slash} OTC`].forEach(v => setA(v));
              } else {
                [clean, `${clean}-OP`].forEach(v => setA(v));
                if (slash) [slash, `${slash}-OP`].forEach(v => setA(v));
              }
            }
          }

          mapActives(binary, 1);
          mapActives(turbo, 3);

          // Find asset
          const isOTC = trade.asset.toUpperCase().includes('OTC');
          const clean = trade.asset.toUpperCase().replace(/[\/\- ]/g, '').replace('OTC', '');
          const slash = clean.length === 6 && /^[A-Z]{6}$/.test(clean)
            ? `${clean.slice(0, 3)}/${clean.slice(3)}` : clean;

          const variations = isOTC
            ? [trade.asset.toUpperCase(), `${clean}-OTC`, `${clean} OTC`, `${slash}-OTC`, `${slash} OTC`]
            : [trade.asset.toUpperCase(), slash, clean, `${clean}-OP`, `${slash}-OP`];

          let found: typeof assetMap[string] | undefined;
          for (const v of variations) {
            if (v && assetMap[v]) { found = assetMap[v]; break; }
          }

          // OTC fallback
          if (!found && !isOTC) {
            for (const v of [`${clean}-OTC`, `${slash}-OTC`]) {
              if (assetMap[v]) { found = assetMap[v]; break; }
            }
          }

          if (!found) {
            console.error(`❌ [Queue] Asset ${trade.asset} not found`);
            clearTimeout(timeout); ws.close();
            resolve({ success: false, error: `Asset ${trade.asset} not available` });
            return;
          }

          // Set balance
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: { name: 'set-active-balance', version: '1.0', body: { balance_id: balanceId } }
          }));

          // Calculate expiration
          const now = Math.floor(Date.now() / 1000);
          const nextMin = Math.ceil(now / 60) * 60;
          const expTime = nextMin + (trade.expiration * 60);

          // Prefer turbo for short trades
          const useId = found.turboId || found.id;
          const useType = found.turboId ? 3 : found.type;

          console.log(`📤 [Queue] ${trade.direction} ${trade.asset} | ID:${useId} | ${useType === 3 ? 'TURBO' : 'BINARY'} | $${trade.amount}`);
          tradePlaced = true;

          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: {
              name: 'binary-options.open-option',
              version: '1.0',
              body: {
                user_balance_id: balanceId,
                active_id: useId,
                option_type_id: useType,
                direction: trade.direction.toLowerCase(),
                expired: expTime,
                price: trade.amount,
                profit_percent: 0,
              },
            },
          }));

          // Retry with binary if turbo was used, after 5s
          if (found.binaryId && useType === 3) {
            setTimeout(() => {
              if (!tradeId) {
                console.log(`🔄 [Queue] Retry BINARY for ${trade.asset}`);
                ws.send(JSON.stringify({
                  name: 'sendMessage',
                  msg: {
                    name: 'binary-options.open-option',
                    version: '1.0',
                    body: {
                      user_balance_id: balanceId,
                      active_id: found!.binaryId!,
                      option_type_id: 1,
                      direction: trade.direction.toLowerCase(),
                      expired: expTime,
                      price: trade.amount,
                      profit_percent: 0,
                    },
                  },
                }));
              }
            }, 5000);
          }
        }

        // Trade success
        if (data.name === 'binary-options.option-opened' || data.name === 'option') {
          const id = data.msg?.id || data.msg?.option_id;
          if (id && !tradeId) {
            tradeId = String(id);
            console.log(`✅ [Queue] Trade placed! ID: ${tradeId}`);
            clearTimeout(timeout); ws.close();
            resolve({ success: true, tradeId });
          }
        }

        // Trade error
        if (data.name === 'binary-options.open-option' && (data.msg?.result === 'error' || data.msg?.message)) {
          console.error(`❌ [Queue] Trade error:`, data.msg);
          clearTimeout(timeout); ws.close();
          resolve({ success: false, error: data.msg?.message || 'Trade rejected' });
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ success: false, error: 'WebSocket error' });
    };
    ws.onclose = () => clearTimeout(timeout);
  });
}

export function useTradeQueueExecutor() {
  const [stats, setStats] = useState<TradeExecutorStats>({
    pending: 0, executed: 0, failed: 0, lastExecution: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const ssidRef = useRef<string | null>(null);
  const accountTypeRef = useRef<string>('PRACTICE');
  const processingRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Login to IQ Option via HTTP (from browser = residential IP)
  const loginToIQ = useCallback(async (): Promise<string | null> => {
    if (ssidRef.current) return ssidRef.current;

    const { data: config } = await supabase
      .from('iqoption_config')
      .select('email, password, account_type')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!config) return null;
    accountTypeRef.current = config.account_type;

    try {
      const res = await fetch('https://auth.iqoption.com/api/v2/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({ identifier: config.email, password: config.password }),
      });
      const data = await res.json();
      if (data?.code === 'success' && data?.ssid) {
        ssidRef.current = data.ssid;
        console.log('✅ [Queue] IQ Option login successful (browser)');
        return data.ssid;
      }
    } catch (e) {
      console.error('❌ [Queue] Browser login failed:', e);
    }
    return null;
  }, []);

  // Process pending trades from queue
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      // Fetch pending trades
      const { data: pendingTrades } = await supabase
        .from('trade_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5);

      if (!pendingTrades || pendingTrades.length === 0) {
        processingRef.current = false;
        return;
      }

      console.log(`📋 [Queue] ${pendingTrades.length} trades pendentes`);
      setIsProcessing(true);

      // Login if needed
      const ssid = await loginToIQ();
      if (!ssid) {
        console.error('❌ [Queue] Cannot login to IQ Option from browser');
        // Mark trades as failed
        for (const trade of pendingTrades) {
          await supabase.from('trade_queue')
            .update({ status: 'failed', error: 'Browser login failed' })
            .eq('id', trade.id);
        }
        processingRef.current = false;
        setIsProcessing(false);
        return;
      }

      // Execute each trade
      for (const trade of pendingTrades) {
        // Mark as executing
        await supabase.from('trade_queue')
          .update({ status: 'executing' })
          .eq('id', trade.id);

        console.log(`🎯 [Queue] Executing: ${trade.asset} ${trade.direction} $${trade.amount}`);

        const result = await executeTradeViaWebSocket(ssid, accountTypeRef.current, trade as QueuedTrade);

        if (result.success) {
          // Update queue
          await supabase.from('trade_queue')
            .update({
              status: 'executed',
              iq_option_id: result.tradeId || null,
              executed_at: new Date().toISOString(),
            })
            .eq('id', trade.id);

          // Save to operation_results
          await supabase.from('operation_results').insert({
            signal_id: trade.signal_id,
            asset: trade.asset,
            direction: trade.direction.toUpperCase(),
            entry_price: trade.amount,
            result: 'pending',
            profit: 0,
            iq_option_id: result.tradeId || null,
            is_auto_trade: true,
            is_ai_analyzed: false,
            timeframe: trade.timeframe || 'M1',
          });

          console.log(`✅ [Queue] ${trade.asset} executed! ID: ${result.tradeId}`);
          toast.success(`Trade executado: ${trade.asset} ${trade.direction}`);

          setStats(prev => ({
            ...prev,
            executed: prev.executed + 1,
            pending: Math.max(0, prev.pending - 1),
            lastExecution: new Date(),
          }));
        } else {
          await supabase.from('trade_queue')
            .update({ status: 'failed', error: result.error || 'Unknown error' })
            .eq('id', trade.id);

          console.error(`❌ [Queue] ${trade.asset} failed: ${result.error}`);
          
          setStats(prev => ({
            ...prev,
            failed: prev.failed + 1,
            pending: Math.max(0, prev.pending - 1),
          }));
        }

        // Small delay between trades
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      console.error('❌ [Queue] Process error:', e);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [loginToIQ]);

  // Poll for pending trades
  useEffect(() => {
    // Initial check
    processQueue();

    // Poll every 5 seconds
    intervalRef.current = setInterval(processQueue, 5000);

    // Subscribe to realtime changes on trade_queue
    const channel = supabase
      .channel('trade-queue-executor')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trade_queue',
      }, (payload) => {
        console.log('📥 [Queue] New trade received:', payload.new);
        setStats(prev => ({ ...prev, pending: prev.pending + 1 }));
        // Process immediately
        setTimeout(processQueue, 500);
      })
      .subscribe();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [processQueue]);

  // Update pending count periodically
  useEffect(() => {
    const updateStats = async () => {
      const { count: pendingCount } = await supabase
        .from('trade_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: executedCount } = await supabase
        .from('trade_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'executed');

      const { count: failedCount } = await supabase
        .from('trade_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');

      setStats(prev => ({
        ...prev,
        pending: pendingCount || 0,
        executed: executedCount || 0,
        failed: failedCount || 0,
      }));
    };

    updateStats();
    const interval = setInterval(updateStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Invalidate session periodically (every 10 min)
  useEffect(() => {
    const interval = setInterval(() => {
      ssidRef.current = null;
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { stats, isProcessing };
}
