import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const ENTRY_LATENCY_LEAD_MS = 120;
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { sendIQAlert, IQ_TELEGRAM_CHANNEL } from '../_shared/telegram-iq-alert.ts';
import { canSendReversal, canReuseBrokerSession } from '../_shared/four-win-reversal.ts';
import { isNextMinuteStrategy } from '../_shared/force-loss-win.ts';
import { copyDayStart, copyTargetReached, copyProfileTargetBlocked } from '../_shared/copy-target.ts';
import { readCopyAccount } from '../_shared/copy-account.ts';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { entrySubmissionDelay } from '../_shared/entry-schedule.ts';
import { configuredEntryAmount, canMirrorToBroker } from '../_shared/iq-entry-policy.ts';
import { isAnticipation, freshAnticipationEntry } from '../_shared/anticipation-execution.ts';
import { iqMarketOpen } from '../_shared/iq-market-open.ts';
import { canNotifyAnticipation } from '../_shared/anticipation-telegram.ts';
import { selectedTrendCopyRequest } from '../_shared/selected-trend-copy.ts';
import { isNormalPrincipalTrend } from '../_shared/normal-trend.ts';
import { isDemoValidatedPrincipal } from '../_shared/demo-validated.ts';
import { principalIQEnabled } from '../_shared/principal-pause.ts';
import { masterAutoTradingEnabled } from '../_shared/auto-trading-gate.ts';
import { prepareTakashiCopy, prepareCopyPlacement, waitForConfirmedCopy } from '../_shared/copy-preparation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface TradeRequest {
  asset: string;
  direction: 'call' | 'put';
  amount: number;
  expiration: number;
  signalId?: string;
  isAutoTrade?: boolean;
  isAIAnalyzed?: boolean;
  timeframe?: string;
  mode?: 'option' | 'forex';
  entryStrategy?: string;
  entryAt?: number;
  brokerSession?: { ssid: string; configId: string };
}

const payoutById: Record<number, number> = {};
let usedMode = 'binary';

interface IQOptionCredentials {
  email: string;
  password: string;
  account_type: string;
}

// Multiple IQ Option API endpoints to try
const IQ_OPTION_AUTH_URLS = [
  'https://auth.iqoption.com/api/v2/login',
  'https://api.iqoption.com/api/v2/login',
];
const IQ_OPTION_WS_URL = 'wss://iqoption.com/echo/websocket';

async function tryHttpLogin(email: string, password: string): Promise<string | null> {
  for (const url of IQ_OPTION_AUTH_URLS) {
    try {
      console.log(`🔄 Attempting HTTP login: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Origin': 'https://iqoption.com',
          'Referer': 'https://iqoption.com/',
        },
        body: new URLSearchParams({ identifier: email, password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      if (data?.code === 'success' && data?.ssid) {
        console.log('✅ HTTP login successful');
        return data.ssid;
      }
      if (data?.code === 'invalid') return null;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`❌ HTTP login failed for ${url}:`, msg);
    }
  }
  return null;
}

async function tryWsLogin(email: string, password: string): Promise<string | null> {
  try {
    console.log(`🔄 Attempting WS login: ${IQ_OPTION_WS_URL}`);
    const ssid = await new Promise<string | null>((resolve) => {
      const ws = new WebSocket(IQ_OPTION_WS_URL);
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; ws.close(); resolve(null); }
      }, 12000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ name: 'authenticate', msg: { email, password } }));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.name === 'authenticated') {
            clearTimeout(timeout); resolved = true; ws.close();
            resolve(msg.msg?.ssid || `ws-auth-${Date.now()}`);
          }
          if (msg.name === 'error' || msg.name === 'auth-error') {
            clearTimeout(timeout); resolved = true; ws.close(); resolve(null);
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => { if (!resolved) { resolved = true; ws.close(); resolve(null); } };
      ws.onclose = () => { clearTimeout(timeout); };
    });
    return ssid;
  } catch { return null; }
}

async function loginToIQOption(email: string, password: string): Promise<{ ssid: string | null; error: string | null }> {
  let ssid = await tryHttpLogin(email, password);
  if (ssid) return { ssid, error: null };
  
  console.log('🔄 HTTP failed, trying WebSocket authentication...');
  ssid = await tryWsLogin(email, password);
  if (ssid) return { ssid, error: null };
  
  return { ssid: null, error: 'Não foi possível conectar à IQ Option' };
}

// Copy trading: espelha uma ordem confirmada da conta principal para os clientes
// com copy ativo. Falhas de um cliente nunca afetam os demais nem a conta principal.
async function mirrorCopyTrades(
  supabase: any,
  tradeRequest: TradeRequest,
  masterSignalId: string,
  master: Promise<{ ok: boolean; timeframe: string; expirationIso: string | null }>,
  principal: { user_id: string; email: string; account_type: string },
  autoTradingOn = false,
) {
  if (!principalIQEnabled(tradeRequest.entryStrategy, autoTradingOn)) return;
  try {
    if (tradeRequest.mode === 'forex') return; // copy apenas para binárias/turbo
    const { data: copies } = await supabase
      .from('copy_trading_configs')
      .select('user_id')
      .eq('enabled', true);
    if (!copies?.length) return;

    const dayStartIso = copyDayStart();

    // Clientes em paralelo: o login de um não atrasa a ordem do outro
    await Promise.allSettled(copies.map(async (copy: any) => {
      try {
        const [{ data: cfg }, { data: settings }] = await Promise.all([
          supabase.from('iqoption_config').select('id, updated_at, email, password, account_type')
            .eq('user_id', copy.user_id).eq('is_active', true).limit(1).maybeSingle(),
          supabase.from('user_trading_settings').select('trade_amount, profit_target_type, profit_target_value')
            .eq('user_id', copy.user_id).maybeSingle(),
        ]);
        if (!cfg?.email || !cfg?.password) { console.log(`⏭️ Copy ${copy.user_id}: sem credenciais IQ Option`); return; }
        if (!canMirrorToBroker(principal, { ...cfg, user_id: copy.user_id })) return;
        const accountType = readCopyAccount(cfg);
        if (!accountType) return;

        if (!configuredEntryAmount(settings?.trade_amount)) return;
        // Authentication is read-only preparation; reservations/targets still gate every placement.
        const loginPreparation = (async () => {
          let preparedSession: string | null = null;
          for (let attempt = 1; attempt <= 3 && !preparedSession; attempt++) {
            if (tradeRequest.entryAt && Date.now() >= tradeRequest.entryAt + 30000) break;
            const login = await loginToIQOption(cfg.email, cfg.password);
            preparedSession = login.ssid;
            if (!preparedSession && attempt < 3) await new Promise(r => setTimeout(r, 800));
          }
          return preparedSession;
        })();
        // Prepare read-only limits while the principal and client login are in flight.
        let copiedProfit = 0;
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from('operation_results').select('profit')
            .like('signal_id', `copy-${copy.user_id}-%`).gte('created_at', dayStartIso)
            .not('iq_option_id', 'is', null).not('timeframe', 'in', '(TEST,MT5)')
            .order('id').range(offset, offset + 999);
          if (error) return;
          copiedProfit += (data || []).reduce((sum: number, row: { profit: number }) => sum + Number(row.profit || 0), 0);
          if (!data || data.length < 1000) break;
        }
        const ssid = await loginPreparation;
        if (!ssid) { console.log(`⏭️ Copy ${copy.user_id}: login falhou após 3 tentativas`); return; }
        let amount: number | null = null;
        const res = await prepareCopyPlacement(master, async () => {
        if (!await masterAutoTradingEnabled(supabase)) return false;
        const [{ data: currentConfig }, { data: currentCopy }] = await Promise.all([
          supabase.from('iqoption_config').select('id, updated_at, account_type').eq('user_id', copy.user_id).eq('is_active', true).limit(1).maybeSingle(),
          supabase.from('copy_trading_configs').select('enabled').eq('user_id', copy.user_id).maybeSingle(),
        ]);
        if (!currentCopy?.enabled || currentConfig?.id !== cfg.id || currentConfig?.updated_at !== cfg.updated_at
          || readCopyAccount(currentConfig) !== accountType) return false;
        const copySignal = `copy-${copy.user_id}-${masterSignalId}`;
        const { data: reservedAmount, error: reserveError } = await supabase.rpc('reserve_iq_entry', { p_client: copy.user_id, p_signal: copySignal });
        amount = configuredEntryAmount(reservedAmount);
        if (reserveError || amount === null) return false;

        // Respeita a meta de lucro do cliente
        if (settings?.profit_target_type === 'value' && Number(settings.profit_target_value) > 0) {
          if (copyTargetReached(copiedProfit, Number(settings.profit_target_value))) {
            await supabase.from('copy_trading_configs').update({ enabled: false }).eq('user_id', copy.user_id);
            console.log(`🎯 Copy ${copy.user_id}: meta de lucro atingida, pulando`);
            return false;
          }
        }

        // Unknown broker outcomes fail closed; never expire a possibly submitted order.
        await supabase.from('iq_entry_leases').update({ reserved_until: 'infinity' }).eq('scope', `client:${copy.user_id}`).eq('signal_id', copySignal);
        return true;
        }, gate => placeTradeFireAndForget(ssid, accountType, { ...tradeRequest }, gate,
          { profit: copiedProfit, value: Number(settings?.profit_target_value), type: settings?.profit_target_type || 'value' }, autoTradingOn,
          () => amount));
        const copySignal = `copy-${copy.user_id}-${masterSignalId}`;
        if (res.error === 'Copy profit target reached') await supabase.from('copy_trading_configs').update({ enabled: false }).eq('user_id', copy.user_id);
        const { timeframe, expirationIso } = await master;
        if (res.success && res.tradeId) {
          const { error: saveError } = await supabase.from('operation_results').insert({
            signal_id: copySignal,
            asset: tradeRequest.asset,
            direction: tradeRequest.direction.toUpperCase(),
            entry_price: amount,
            result: 'pending',
            profit: 0,
            iq_option_id: res.tradeId,
            is_auto_trade: true,
            is_ai_analyzed: false,
            entry_strategy: 'COPY_TRADE',
            timeframe,
            expiration_time: expirationIso,
          });
          if (!saveError) await supabase.from('iq_entry_leases').update({ reserved_until: new Date().toISOString() }).eq('scope', `client:${copy.user_id}`).eq('signal_id', copySignal);
          console.log(`📋 Copy ${copy.user_id}: ordem espelhada ${res.tradeId} ($${amount} ${accountType})`);
        } else {
          console.log(`❌ Copy ${copy.user_id}: ${res.error || 'ordem recusada'}`);
        }
      } catch (e) {
        console.error(`❌ Copy ${copy.user_id} erro:`, String(e));
      }
    }));
  } catch (e) {
    console.error('❌ Copy mirror fatal:', String(e));
  }
}

// Track asset type (binary vs turbo) for correct option_type_id
interface AssetInfo {
  id: number;
  optionType: number; // 1 = binary, 3 = turbo
  turboId?: number;  // Alternative turbo ID if available
  binaryId?: number; // Alternative binary ID if available
}

async function placeTradeFireAndForget(
  ssid: string, 
  accountType: string,
  trade: TradeRequest,
  gate?: Promise<boolean>,
  copyTarget?: { profit: number; value: number; type: string },
  autoTradingOn = false,
  copyAmount?: () => number | null,
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  if (!principalIQEnabled(trade.entryStrategy, autoTradingOn)) return { success: false, error: 'Principal IQ and copies paused by user' };
  return new Promise((resolve) => {
    // Copies follow the confirmed principal's minute, never a new future candle.
    const anchoredCopy = !!gate;
    const anchoredEntry = anchoredCopy || isNextMinuteStrategy(trade.entryStrategy);
    console.log('📡 Connecting to IQ Option WebSocket for trading...');
    const ws = new WebSocket(IQ_OPTION_WS_URL);
    
    let balanceId = 0;
    let tradeId: string | null = null;
    const activeAssets: Record<string, AssetInfo> = {};
    let tradePlaced = false;
    let fxSender: ((leverage: number) => void) | null = null;
    const fxLevers = [500, 300, 100, 50];
    
    // Shorter timeout - we don't wait for result, just confirmation of placement
    const timeout = setTimeout(() => {
      console.log('⏰ Trade placement timeout');
      ws.close();
      if (tradePlaced && tradeId) {
        resolve({ success: true, tradeId });
      } else {
        // Trade was NOT confirmed by IQ Option - do NOT save as pending
        console.log('❌ Trade NOT confirmed - will not save fake pending entry');
        resolve({ success: false, error: 'Trade timeout - no confirmation from IQ Option' });
      }
    }, 90000);

    ws.onopen = () => {
      console.log('🔗 WebSocket connected, authenticating...');
      ws.send(JSON.stringify({ name: 'ssid', msg: ssid }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.name === 'profile') {
          console.log('✅ Authenticated, getting assets...');
          
          const balances = data.msg.balances || [];
          const ownBalance = balances.find((balance: { type: number; amount: number }) => balance.type === (accountType === 'PRACTICE' ? 4 : 1));
          if (copyTarget && copyProfileTargetBlocked(copyTarget.profit, copyTarget.value, copyTarget.type, Number(ownBalance?.amount))) {
            clearTimeout(timeout); ws.close();
            resolve({ success: false, error: 'Copy profit target reached' });
            return;
          }
          for (const balance of balances) {
            if (accountType === 'PRACTICE' && balance.type === 4) {
              balanceId = balance.id; break;
            } else if (accountType === 'REAL' && balance.type === 1) {
              balanceId = balance.id; break;
            }
          }
          if (!balanceId && anchoredEntry) {
            clearTimeout(timeout); ws.close();
            resolve({ success: false, error: 'Conta configurada não disponível; entrada cancelada' });
            return;
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
          
          // Map assets with their correct option type
          function mapAssets(actives: Record<string, any>, optionType: number) {
            for (const [id, info] of Object.entries(actives)) {
              const assetInfo = info as { name?: string; enabled?: boolean; is_suspended?: boolean };
              if (!assetInfo.enabled || assetInfo.is_suspended) continue;
              if ((isAnticipation(trade.entryStrategy) || anchoredCopy) && (!trade.entryAt || optionType !== 3
                || !iqMarketOpen(info, Math.floor(Date.now() / 1000), trade.entryAt / 1000 + trade.expiration * 60))) continue;
              
              const name = (assetInfo.name || '').toUpperCase();
              const numId = parseInt(id);
              const commission = (info as any)?.option?.profit?.commission;
              if (typeof commission === 'number') payoutById[numId] = 100 - commission;
              
              // Merge with existing entry to keep both turbo and binary IDs
              function setAsset(key: string) {
                const existing = activeAssets[key];
                if (existing) {
                  // Update with new type info
                  if (optionType === 3) existing.turboId = numId;
                  else existing.binaryId = numId;
                  // Prefer turbo for the main ID (better for short-term trades)
                  if (optionType === 3) {
                    existing.id = numId;
                    existing.optionType = 3;
                  }
                } else {
                  activeAssets[key] = { 
                    id: numId, 
                    optionType,
                    turboId: optionType === 3 ? numId : undefined,
                    binaryId: optionType === 1 ? numId : undefined,
                  };
                }
              }
              
              setAsset(name);
              
              let baseName = name.startsWith('FRONT.') ? name.replace('FRONT.', '') : name;
              const isOTC = baseName.includes('-OTC');
              const isOP = baseName.includes('-OP');
              const cleanName = baseName.replace('-OTC', '').replace('-OP', '');
              
              const withSlash = cleanName.length === 6 && /^[A-Z]{6}$/.test(cleanName)
                ? `${cleanName.slice(0, 3)}/${cleanName.slice(3)}` : null;
              
              if (isOTC) {
                [`${cleanName}-OTC`, `${cleanName} OTC`, `${cleanName}OTC`].forEach(v => setAsset(v));
                if (withSlash) {
                  [`${withSlash}-OTC`, `${withSlash} OTC`, `${withSlash}OTC`].forEach(v => setAsset(v));
                }
              } else {
                [cleanName, `${cleanName}-OP`].forEach(v => setAsset(v));
                if (withSlash) {
                  [withSlash, `${withSlash}-OP`].forEach(v => setAsset(v));
                }
              }
            }
          }
          
          // Map binary first, then turbo (turbo updates existing entries)
          mapAssets(binary, 1);
          mapAssets(turbo, 3);
          
          console.log(`📊 ${Object.keys(activeAssets).length} asset variations mapped`);
          
          // Find the asset
          const isOTCAsset = trade.asset.toUpperCase().includes('OTC');
          let cleanAsset = trade.asset.toUpperCase().replace(/[\/\- ]/g, '').replace('OTC', '');
          const withSlash = cleanAsset.length === 6 && /^[A-Z]{6}$/.test(cleanAsset)
            ? `${cleanAsset.slice(0, 3)}/${cleanAsset.slice(3)}` : cleanAsset;
          
          let searchVariations: string[];
          if (isOTCAsset) {
            searchVariations = [
              trade.asset.toUpperCase(), `${cleanAsset}-OTC`, `${cleanAsset} OTC`,
              `${withSlash}-OTC`, `${withSlash} OTC`, `FRONT.${cleanAsset}-OTC`,
            ];
          } else {
            searchVariations = [
              trade.asset.toUpperCase(), withSlash, cleanAsset,
              `${cleanAsset}-OP`, `${withSlash}-OP`, `FRONT.${cleanAsset}-OP`,
            ];
          }
          
          let foundAsset: AssetInfo | undefined;
          let matchedName = '';
          
          for (const variation of searchVariations) {
            if (variation && activeAssets[variation]) {
              foundAsset = activeAssets[variation];
              matchedName = variation;
              break;
            }
          }
          
          // OTC fallback if not found and not OTC asset
          if (!foundAsset && !isOTCAsset && !anchoredEntry) {
            const otcVariations = [
              `${cleanAsset}-OTC`, `${cleanAsset} OTC`, `${withSlash}-OTC`, `${withSlash} OTC`,
            ];
            for (const v of otcVariations) {
              if (activeAssets[v]) {
                foundAsset = activeAssets[v];
                matchedName = v;
                console.log(`🔄 Using OTC fallback: ${v}`);
                break;
              }
            }
          }
          
          if (!foundAsset) {
            console.error(`❌ Asset ${trade.asset} not found. Available: ${Object.keys(activeAssets).filter(k => k.length <= 12).slice(0, 30).join(', ')}`);
            clearTimeout(timeout); ws.close();
            resolve({ success: false, error: `Asset ${trade.asset} not available` });
            return;
          }
          
          const hasTurbo = !!foundAsset.turboId;
          const hasBinary = !!foundAsset.binaryId;
          console.log(`✅ Found: "${matchedName}" -> Turbo:${foundAsset.turboId || 'N/A'}, Binary:${foundAsset.binaryId || 'N/A'}, Default:${foundAsset.id}(${foundAsset.optionType === 1 ? 'BIN' : 'TUR'})`);
          
          // Set balance
          ws.send(JSON.stringify({
            name: 'sendMessage',
            msg: { name: 'set-active-balance', version: '1.0', body: { balance_id: balanceId } }
          }));
          
          // ===== FOREX (margem) alavancagem 1000x, take profit de 1000% no servidor da IQ =====
          if (trade.mode === 'forex') {
            if (isOTCAsset) {
              clearTimeout(timeout); ws.close();
              resolve({ success: false, error: 'Forex não disponível para OTC' });
              return;
            }
            usedMode = 'forex';
            tradePlaced = true;
            const sendForex = (leverage: number) => {
              console.log(`📤 FOREX ${trade.direction} ${cleanAsset} margem $${trade.amount} x${leverage} TP 1000%`);
              ws.send(JSON.stringify({
                name: 'sendMessage', request_id: 'fx1',
                msg: { name: 'place-order-temp', version: '4.0', body: {
                  user_balance_id: balanceId, client_platform_id: 9,
                  instrument_type: 'forex', instrument_id: cleanAsset,
                  side: trade.direction === 'call' ? 'buy' : 'sell', type: 'market',
                  amount: trade.amount, leverage,
                  limit_price: null, stop_price: null,
                  use_token_for_commission: false, auto_margin_call: false, use_trail_stop: false,
                  take_profit_kind: 'percent', take_profit_value: 1000,
                  stop_lose_kind: null, stop_lose_value: null,
                } },
              }));
            };
            fxSender = sendForex;
            sendForex(1000);
            // Sem resposta em 5s -> tenta próxima alavancagem
            const fxRetry = () => setTimeout(() => {
              if (!tradeId && fxLevers.length) {
                const next = fxLevers.shift()!;
                console.log(`🔄 FOREX sem resposta — tentando x${next}`);
                sendForex(next);
                fxRetry();
              }
            }, 5000);
            fxRetry();
            return;
          }

          const sendDigital = (reason: string) => {
            usedMode = 'digital';
            tradePlaced = true;
            const expMs = candleOpenMs + trade.expiration * 60000;
            const e = new Date(expMs);
            const pad = (n: number) => String(n).padStart(2, '0');
            const instrumentId = `do${foundAsset!.id}A${e.getUTCFullYear()}${pad(e.getUTCMonth()+1)}${pad(e.getUTCDate())}D${pad(e.getUTCHours())}${pad(e.getUTCMinutes())}00T${trade.expiration}M${trade.direction === 'call' ? 'C' : 'P'}SPT`;
            console.log(`📤 DIGITAL (${reason}) ${instrumentId} $${trade.amount}`);
            ws.send(JSON.stringify({
              name: 'sendMessage', request_id: 'dg1',
              msg: { name: 'digital-options.place-digital-option', version: '3.0', body: {
                user_balance_id: balanceId, instrument_id: instrumentId,
                amount: String(trade.amount), asset_id: foundAsset!.id, instrument_index: 0,
              } },
            }));
          };

          // ===== Entrada sincronizada: exatamente na ABERTURA da próxima vela (:00) =====
          // Envia ~120ms antes para compensar a latência do relay e chegar na IQ às :00.
          const nowMs0 = Date.now();
          const candleOpenMs = anchoredEntry && trade.entryAt
            ? trade.entryAt : Math.ceil((nowMs0 + 1000) / 60000) * 60000;
          if (anchoredEntry && (!canSendReversal(candleOpenMs, nowMs0)
            || (isAnticipation(trade.entryStrategy) && !freshAnticipationEntry(candleOpenMs, nowMs0)))) {
            clearTimeout(timeout); ws.close();
            resolve({ success: false, error: 'Entrada prevista passou; ordem não enviada atrasada' });
            return;
          }
          const entryDelay = entrySubmissionDelay(candleOpenMs, nowMs0, ENTRY_LATENCY_LEAD_MS);
          console.log(`⏱️ Aguardando ${(entryDelay / 1000).toFixed(1)}s para entrar na abertura da vela ${new Date(candleOpenMs).toISOString()}`);

          const fire = async () => {
            if (gate && !(await gate)) {
              clearTimeout(timeout); ws.close();
              resolve({ success: false, error: 'Ordem principal não confirmada; copy não enviado' });
              return;
            }
            if (copyAmount) {
              const reserved = configuredEntryAmount(copyAmount());
              if (reserved === null) {
                clearTimeout(timeout); ws.close();
                resolve({ success: false, error: 'Copy amount unavailable; no order sent' });
                return;
              }
              trade.amount = reserved;
            }
            // Recheck at actual submission: event-loop delay must never create a late order.
            if (anchoredEntry && (!canSendReversal(candleOpenMs, Date.now())
              || (isAnticipation(trade.entryStrategy) && !freshAnticipationEntry(candleOpenMs, Date.now())))) {
              clearTimeout(timeout); ws.close();
              resolve({ success: false, error: 'Virada do minuto perdida; entrada cancelada sem ordem atrasada' });
              return;
            }
            const optPayout = payoutById[foundAsset!.turboId || foundAsset!.binaryId || foundAsset!.id] || 0;
            if ((isAnticipation(trade.entryStrategy) || anchoredCopy) && !hasTurbo) {
              clearTimeout(timeout); ws.close();
              resolve({ success: false, error: 'Ativo M1 não disponível; entrada cancelada' });
              return;
            }
            if (!anchoredCopy && !isAnticipation(trade.entryStrategy) && (!hasTurbo || (optPayout > 0 && optPayout < 80))) {
              sendDigital(!hasTurbo ? 'sem turbo' : `payout ${optPayout}%`);
              return;
            }
            usedMode = 'binary';
            const expirationTime = candleOpenMs / 1000 + trade.expiration * 60;
            const useId = foundAsset!.turboId!;
            console.log(`📤 Placing ${trade.direction.toUpperCase()} on ${matchedName} | ID:${useId} | TURBO | $${trade.amount} | Exp:${trade.expiration}min | offset:${Date.now() - candleOpenMs}ms`);
            tradePlaced = true;
            ws.send(JSON.stringify({
              name: 'sendMessage',
              msg: {
                name: 'binary-options.open-option', version: '1.0',
                body: {
                  user_balance_id: balanceId, active_id: useId, option_type_id: 3,
                  direction: trade.direction, expired: expirationTime,
                  price: trade.amount, profit_percent: 0,
                },
              },
            }));
            if (!anchoredEntry) {
              setTimeout(() => { if (!tradeId) sendDigital('turbo sem resposta'); }, 2500);
            }
          };
          if (entryDelay === 0) void fire();
          else setTimeout(fire, entryDelay);
        }

        if (data.request_id === 'fx1') console.log('📨 FOREX resposta:', JSON.stringify(data).slice(0, 400));
        else if (usedMode === 'forex' && !['heartbeat', 'timeSync', 'front'].includes(data.name)) console.log('📨 FOREX msg:', data.name, JSON.stringify(data.msg ?? {}).slice(0, 300));
        if (usedMode === 'forex' && (data.name === 'order-changed' || data.name === 'position-changed') && data.msg?.id && !tradeId) {
          tradeId = String(data.msg.id);
          console.log(`✅ FOREX aberto via ${data.name}! ID: ${tradeId}`);
          clearTimeout(timeout); ws.close();
          resolve({ success: true, tradeId });
          return;
        }
        
        // Respostas de DIGITAL / FOREX
        if (data.request_id === 'fx1' || data.request_id === 'dg1' || data.name === 'digital-option-placed') {
          const id = data.msg?.id;
          if (id) {
            tradeId = String(id);
            console.log(`✅ ${usedMode.toUpperCase()} aberto! ID: ${tradeId}`);
            clearTimeout(timeout); ws.close();
            resolve({ success: true, tradeId });
            return;
          }
          if (data.request_id === 'fx1' && fxSender && fxLevers.length && (data.msg?.message || data.status >= 400)) {
            const next = fxLevers.shift()!;
            console.log(`🔄 FOREX rejeitado (${data.msg?.message || data.status}) — tentando x${next}`);
            fxSender(next);
            return;
          }
          if (data.msg?.message || data.status >= 400) {
            console.error(`❌ ${usedMode} erro:`, JSON.stringify(data.msg));
            clearTimeout(timeout); ws.close();
            resolve({ success: false, error: data.msg?.message || `${usedMode} rejeitado` });
            return;
          }
        }

        // Trade opened successfully
        if (data.name === 'binary-options.option-opened' || data.name === 'option') {
          const id = data.msg?.id || data.msg?.option_id;
          if (id) {
            tradeId = String(id);
            console.log(`✅ Trade placed! ID: ${tradeId}`);
            clearTimeout(timeout); ws.close();
            resolve({ success: true, tradeId });
            return;
          }
        }
        
        // Handle error responses
        if (data.name === 'binary-options.open-option' && (data.msg?.result === 'error' || data.msg?.message)) {
          console.error('❌ Trade error:', JSON.stringify(data.msg));
          clearTimeout(timeout); ws.close();
          resolve({ success: false, error: data.msg?.message || data.msg?.reason || 'Trade rejected' });
          return;
        }
        
        if (data.name === 'error') {
          console.error('❌ Error:', JSON.stringify(data.msg));
          clearTimeout(timeout); ws.close();
          resolve({ success: false, error: data.msg?.message || 'Unknown error' });
          return;
        }
        
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      clearTimeout(timeout);
      resolve({ success: false, error: 'WebSocket connection error' });
    };
    ws.onclose = () => { clearTimeout(timeout); };
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return Response.json({ error: 'Service unavailable' }, { status: 503, headers: corsHeaders });
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    // Auto Trading switch off => no principal entry or copy reaches IQ Option.
    const autoTradingOn = await masterAutoTradingEnabled(supabase);
    if (!autoTradingOn)
      return Response.json({ skipped: 'Auto Trading disabled' }, { status: 410, headers: corsHeaders });
    if (body?.prepareCopyCandidate !== undefined) {
      if (req.headers.get('Authorization') !== `Bearer ${supabaseKey}`)
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      if (typeof body.prepareCopyCandidate !== 'string' || body.prepareCopyCandidate.length > 255 || Object.keys(body).length !== 1)
        return Response.json({ error: 'Invalid preparation request' }, { status: 400, headers: corsHeaders });
      const [{ data: candidate }, { data: principal }] = await Promise.all([
        supabase.from('iq_demo_test_candidates').select('signal_id,asset,direction,entry_strategy,entry_minute,score').eq('signal_id', body.prepareCopyCandidate).maybeSingle(),
        readMasterIQConfig(supabase),
      ]);
      const copyRequest = prepareTakashiCopy(candidate, Date.now());
      if (!principal || !copyRequest || !principalIQEnabled(copyRequest.entryStrategy, autoTradingOn))
        return Response.json({ skipped: 'No fresh authorized copy preparation' }, { headers: corsHeaders });
      // The same invocation owns prepared client sessions and waits for persisted broker confirmation.
      const master = waitForConfirmedCopy(copyRequest.signalId, copyRequest.entryAt, async () => {
        const [{ data: order, error: orderError }, { data: queued, error: queueError }] = await Promise.all([
          supabase.from('operation_results').select('signal_id,asset,direction,iq_option_id,entry_strategy,timeframe,expiration_time,entry_price').eq('signal_id', copyRequest.signalId).maybeSingle(),
          supabase.from('trade_queue').select('iq_option_id').eq('signal_id', copyRequest.signalId).eq('status', 'executed').maybeSingle(),
        ]);
        if (orderError || queueError) throw orderError || queueError;
        return { order, executed: Boolean(queued?.iq_option_id && queued.iq_option_id === order?.iq_option_id
          && order?.entry_strategy === copyRequest.entryStrategy && order?.asset === copyRequest.asset
          && order?.direction === copyRequest.direction.toUpperCase()) };
      });
      const task = mirrorCopyTrades(supabase, copyRequest, copyRequest.signalId, master, principal, autoTradingOn);
      await Promise.allSettled([task, master]);
      return Response.json({ success: true, signalId: copyRequest.signalId }, { headers: corsHeaders });
    }
    if (body?.copyPrincipalSignalId !== undefined) {
      if (req.headers.get('Authorization') !== `Bearer ${supabaseKey}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
      if (typeof body.copyPrincipalSignalId !== 'string' || body.copyPrincipalSignalId.length > 255
        || Object.keys(body).length !== 1) return Response.json({ error: 'Invalid copy request' }, { status: 400, headers: corsHeaders });
      const { data: order, error } = await supabase.from('operation_results')
        .select('signal_id,asset,direction,iq_option_id,entry_strategy,timeframe,expiration_time,entry_price')
        .eq('signal_id', body.copyPrincipalSignalId).maybeSingle();
      if (error) throw error;
      if (!principalIQEnabled(order?.entry_strategy, autoTradingOn)) return Response.json({ skipped: 'Principal strategy paused' }, { status: 410, headers: corsHeaders });
      const copyRequest = selectedTrendCopyRequest(order, Date.now());
      if (!copyRequest) return Response.json({ skipped: 'No fresh confirmed principal order' }, { headers: corsHeaders });
      const [{ data: principal }, { data: queued }] = await Promise.all([
        readMasterIQConfig(supabase),
        supabase.from('trade_queue').select('id').eq('signal_id', copyRequest.signalId)
          .eq('status', 'executed').eq('iq_option_id', order.iq_option_id).maybeSingle(),
      ]);
      if (!principal || !queued) return Response.json({ skipped: 'Principal confirmation unavailable' }, { headers: corsHeaders });
      await mirrorCopyTrades(supabase, copyRequest, copyRequest.signalId,
        Promise.resolve({ ok: true, timeframe: order.timeframe, expirationIso: order.expiration_time }), principal, autoTradingOn);
      return Response.json({ success: true, signalId: copyRequest.signalId }, { headers: corsHeaders });
    }
    const tradeRequest: TradeRequest = body;
    // Direct principal entries only run while the Auto Trading switch is on.
    if (!principalIQEnabled(tradeRequest.entryStrategy, autoTradingOn)) return Response.json({ success: false, error: 'Direct principal strategies paused' }, { status: 410, headers: corsHeaders });
    if ((tradeRequest.signalId || '').startsWith('forca_antecipada-') && !isAnticipation(tradeRequest.entryStrategy)) {
      return Response.json({ error: 'Invalid anticipation strategy' }, { status: 400, headers: corsHeaders });
    }
    // Never allow an unauthenticated request to reserve or place a principal order.
    if (req.headers.get('Authorization') !== `Bearer ${supabaseKey}`) {
      const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
      const { data: auth } = await supabase.auth.getUser(token || '');
      if (!auth?.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', auth.user.id).eq('role', 'admin').maybeSingle();
      if (!role) return Response.json({ error: 'Admin required' }, { status: 403, headers: corsHeaders });
    }
    let authorizedQueue: { id: string; created_at: string; entry_strategy: string | null } | undefined;
    if (isNormalPrincipalTrend({ signal_id: tradeRequest.signalId || '', entry_strategy: tradeRequest.entryStrategy }) || tradeRequest.entryStrategy === 'FORCE_LOSS_WIN' || tradeRequest.entryStrategy === 'FORCA_INVERTIDA' || /forca_invertida-/.test(tradeRequest.signalId || '') || tradeRequest.signalId?.startsWith('force-lw-') || /-force-lw-/.test(tradeRequest.signalId || '')) {
      return Response.json({ success: false, error: 'Strategy removed' }, { status: 410, headers: corsHeaders });
    }
    // Only Demo-validated strategies may open principal orders (user, Oct 24 2026); copies use the endpoint above.
    if (!isDemoValidatedPrincipal(tradeRequest.entryStrategy)) {
      return Response.json({ success: false, error: 'Strategy not validated by Demo operations' }, { status: 410, headers: corsHeaders });
    }
    if (isNextMinuteStrategy(tradeRequest.entryStrategy)) {
      if (req.headers.get('Authorization') !== `Bearer ${supabaseKey}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
      if (!canSendReversal(Number(tradeRequest.entryAt), Date.now())
        || (isAnticipation(tradeRequest.entryStrategy) && (!freshAnticipationEntry(Number(tradeRequest.entryAt), Date.now())
          || tradeRequest.mode === 'forex' || tradeRequest.timeframe !== 'M1'))
        || Number(tradeRequest.entryAt) > Date.now() + 60000
        || Number(tradeRequest.entryAt) % 60000 !== 0
        || !['call', 'put'].includes(tradeRequest.direction) || tradeRequest.expiration !== 1) {
        return Response.json({ error: 'Invalid next-minute entry' }, { status: 400, headers: corsHeaders });
      }
      // Conditional lease: even a duplicate server invocation cannot place twice.
      const { data: lease } = await supabase.from('trade_queue').update({ error: 'placement_claimed' })
        .eq('signal_id', tradeRequest.signalId || '').eq('asset', tradeRequest.asset)
        .eq('direction', tradeRequest.direction.toUpperCase()).eq('amount', tradeRequest.amount)
        .eq('entry_strategy', tradeRequest.entryStrategy || '').eq('status', 'executing').is('error', null)
        .select('id, created_at, entry_strategy');
      if (!lease?.length) return Response.json({ error: 'Next-minute entry already claimed or unauthorized' }, { status: 409, headers: corsHeaders });
      authorizedQueue = lease[0];
    }
    const { brokerSession: privateSession, ...loggedRequest } = tradeRequest;
    console.log('📥 Trade request:', JSON.stringify(loggedRequest));
    
    if (!tradeRequest.asset || !tradeRequest.direction || !tradeRequest.amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get IQ Option credentials
    const serverReversal = isNextMinuteStrategy(tradeRequest.entryStrategy)
      && req.headers.get('Authorization') === `Bearer ${supabaseKey}`;
    const expectedConfigId = serverReversal && typeof privateSession?.configId === 'string'
      ? privateSession.configId : undefined;
    const { data: configData } = await readMasterIQConfig(supabase, expectedConfigId);

    if (!configData) {
      return new Response(
        JSON.stringify({ success: false, error: 'No IQ Option credentials configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reservationSignal = tradeRequest.signalId || `manual-${crypto.randomUUID()}`;
    const { data: reservedAmount, error: reserveError } = await supabase.rpc('reserve_iq_entry', { p_client: null, p_signal: reservationSignal });
    const configuredAmount = configuredEntryAmount(reservedAmount);
    if (reserveError || configuredAmount === null) return Response.json({ success: false, error: 'Já existe uma operação aberta ou o valor de entrada não está configurado.' }, { status: 409, headers: corsHeaders });
    tradeRequest.amount = configuredAmount;
    tradeRequest.signalId = reservationSignal;

    // Place trade (fire-and-forget, don't wait for result)
    // A notificação exige um sinal já autorizado pelo gerador na fila real.
    // Nenhum parâmetro enviado pelo navegador habilita alertas por si só.
    let notifyEntry: ((entryAt: number) => Promise<number | undefined>) | undefined;
    let entryStrategy: string | null = isAnticipation(tradeRequest.entryStrategy) && authorizedQueue ? 'FORCA_ANTECIPADA' : null;
    if (!isAnticipation(tradeRequest.entryStrategy) && tradeRequest.isAutoTrade && tradeRequest.signalId && tradeRequest.mode !== 'forex'
      && tradeRequest.timeframe !== 'TEST' && tradeRequest.timeframe !== 'MT5') {
      // Reuse the exact service-only lease instead of another serial authorization read.
      const { data: queued } = authorizedQueue ? { data: authorizedQueue } : await supabase.from('trade_queue').select('id, created_at, entry_strategy')
        .eq('signal_id', tradeRequest.signalId).eq('asset', tradeRequest.asset)
        .eq('direction', tradeRequest.direction.toUpperCase()).eq('status', 'executing')
        .gte('created_at', new Date(Date.now() - 90000).toISOString()).limit(1).maybeSingle();
      if (queued) {
        const signalId = tradeRequest.signalId;
        // Origem informada pelo gerador autorizado (Perda anterior desativada em 15/10/2026).
        const reqStrategy = queued.entry_strategy;
        if (reqStrategy === 'HISTORICO' || reqStrategy === 'TENDENCIA' || reqStrategy === 'EMPATE' || reqStrategy === 'REVERSAO_RSI' || reqStrategy === 'TENDENCIA_V1' || isNextMinuteStrategy(reqStrategy || undefined)) entryStrategy = reqStrategy;
        const strategy = entryStrategy === 'RETOMADA' ? 'Retomada' : entryStrategy === 'FORCA_INVERTIDA' ? 'Força Invertida'
          : entryStrategy === 'HISTORICO' ? 'Histórico bom'
          : entryStrategy === 'TENDENCIA' ? 'Tendência alinhada'
          : entryStrategy === 'TENDENCIA_V1' ? 'Tendência V1'
          : entryStrategy === 'REVERSAO_RSI' ? 'Reversão RSI'
          : entryStrategy === 'VELA_FORCA' ? 'Vela de Força'
          : entryStrategy === 'EMPATE' ? 'Após empate' : 'IA';
        notifyEntry = async entryAt => {
          // Regra (16/10/2026): só envia ao Telegram quando houver OUTRO sinal
          // no mesmo minuto com a estratégia complementar (Tendência + Reversão RSI).
          // O par pode ser real (trade_queue) ou TESTE (operation_results, ativo
          // recusado pela corretora); par de teste também libera o envio e recebe
          // uma mensagem própria marcada como TESTE.
          // Tendência V1 (pedido 16/10/2026): vai ao Telegram direto, sem exigir par.
          const complementary = isNextMinuteStrategy(entryStrategy || undefined) || entryStrategy === 'TENDENCIA_V1' ? 'DIRECT'
            : entryStrategy === 'TENDENCIA' ? 'REVERSAO_RSI'
            : entryStrategy === 'REVERSAO_RSI' ? 'TENDENCIA' : null;
          if (!complementary) {
            console.log(`📵 Telegram ignorado: sinal ${signalId} (${entryStrategy}) sem estratégia complementar`);
            return undefined;
          }
          const { data: pairSignals } = await supabase.from('trade_queue').select('signal_id, entry_strategy')
            .eq('status', 'executing').neq('signal_id', signalId)
            .gte('created_at', new Date(Date.now() - 120000).toISOString()).limit(5);
          let hasComplementaryPair = complementary === 'DIRECT' || (pairSignals || []).some(p => p.entry_strategy === complementary);
          let testPair: { signal_id: string; asset: string; direction: string } | null = null;
          if (!hasComplementaryPair) {
            const { data: testPairs } = await supabase.from('operation_results')
              .select('signal_id, asset, direction')
              .eq('timeframe', 'TEST').eq('entry_strategy', complementary)
              .gte('created_at', new Date(Date.now() - 120000).toISOString())
              .order('created_at', { ascending: false }).limit(1);
            testPair = (testPairs || [])[0] || null;
            hasComplementaryPair = !!testPair;
          }
          if (!hasComplementaryPair) {
            console.log(`📵 Telegram ignorado: sinal ${signalId} (${entryStrategy}) sem par Tendência+Reversão RSI no mesmo minuto`);
            return undefined;
          }
          const messageId = await sendIQAlert({
          asset: tradeRequest.asset, direction: tradeRequest.direction,
          expiration: tradeRequest.expiration, entryAt, signalId,
          timeframe: tradeRequest.timeframe || 'M1',
          strategy,
        }, {
          lovableKey: Deno.env.get('LOVABLE_API_KEY') || '',
          telegramKey: Deno.env.get('TELEGRAM_API_KEY') || '',
          }, fetch, autoTradingOn);
          if (messageId === undefined) return undefined;
          const { error: deliveryError } = await supabase.from('telegram_iq_deliveries').upsert({
            signal_id: signalId, chat_id: IQ_TELEGRAM_CHANNEL, signal_message_id: messageId, strategy,
          }, { onConflict: 'signal_id', ignoreDuplicates: true });
          if (deliveryError) throw deliveryError;
          await supabase.from('operation_results').update({ telegram_sent: true }).eq('signal_id', signalId);
          // Par de teste (ativo recusado): avisa no canal com marcação de TESTE,
          // sem registrar no ledger de resultados (não há resultado real a enviar).
          if (testPair) {
            const testEntryTime = new Date(entryAt).toLocaleTimeString('pt-BR', {
              timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
            const testText = [
              '🧪 AGÊNCIA MKT TRADER — Sinal TESTE (sem ordem real)',
              `💱 Ativo: ${testPair.asset}`,
              `🎯 Estratégia: ${complementary === 'REVERSAO_RSI' ? 'Reversão RSI' : 'Tendência alinhada'}`,
              `Direção: ${String(testPair.direction).toUpperCase() === 'CALL' ? '🟢 COMPRA (CALL)' : '🔴 VENDA (PUT)'}`,
              `⏰ Entrada prevista: ${testEntryTime} (Brasília)`,
              '⚠️ A corretora recusou este ativo; entrada apenas simulada. Sem garantia de lucro.',
            ].join('\n');
            try {
              const testResp = await fetch('https://connector-gateway.lovable.dev/telegram/sendMessage', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY') || ''}`,
                  'X-Connection-Api-Key': Deno.env.get('TELEGRAM_API_KEY') || '',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ chat_id: IQ_TELEGRAM_CHANNEL, text: testText }),
                signal: AbortSignal.timeout(8000),
              });
              if (testResp.ok) {
                await supabase.from('operation_results').update({ telegram_sent: true }).eq('signal_id', testPair.signal_id);
                console.log(`📱 Telegram TESTE enviado: ${testPair.asset} | sinal ${testPair.signal_id}`);
              } else {
                console.error(`❌ Telegram TESTE [${testResp.status}]: ${await testResp.text()}`);
              }
            } catch (e) {
              console.error('❌ Telegram TESTE:', String(e));
            }
          }
          return messageId;
        };
      }
    }
    // Telegram sai ANTES da entrada (30–60 s, pedido 15/10/2026) para entrada manual.
    // Se a IQ Option recusar a ordem, uma resposta de CANCELADO é enviada ao sinal.
    let notification: Promise<number | undefined> | undefined;
    if (notifyEntry) {
      const entryAt = isNextMinuteStrategy(tradeRequest.entryStrategy) && tradeRequest.entryAt
        ? tradeRequest.entryAt : Math.ceil((Date.now() + 1000) / 60000) * 60000;
      notification = notifyEntry(entryAt).catch(error => { console.error('❌ Telegram IQ:', String(error)); return undefined; });
      // @ts-ignore EdgeRuntime is available in the hosted runtime
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(notification);
    }
    const cancelAlert = async () => {
      if (!notification) return;
      const msgId = await notification;
      if (msgId === undefined) return;
      await supabase.from('telegram_iq_deliveries').update({ result_status: 'cancelled', result_sent_at: new Date().toISOString() })
        .eq('signal_id', tradeRequest.signalId!);
      await fetch('https://connector-gateway.lovable.dev/telegram/sendMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY') || ''}`,
          'X-Connection-Api-Key': Deno.env.get('TELEGRAM_API_KEY') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: IQ_TELEGRAM_CHANNEL,
          text: `🚫 SINAL CANCELADO\n💱 ${tradeRequest.asset}\n⚠️ A corretora recusou este ativo agora. Não entre nesta operação.`,
          reply_parameters: { message_id: msgId, allow_sending_without_reply: true },
        }),
      }).catch(e => console.error('❌ Telegram cancel:', String(e)));
    };
    const reusableSession = typeof privateSession?.ssid === 'string' && privateSession.ssid.length > 0
      && privateSession.ssid.length <= 4096 && typeof privateSession.configId === 'string'
      && canReuseBrokerSession(serverReversal, privateSession.configId, configData.id);
    // Telegram already sends in parallel; skip repeated login only for a trusted same-account session.
    const { ssid, error: loginError } = reusableSession
      ? { ssid: privateSession?.ssid, error: null }
      : await loginToIQOption(configData.email, configData.password);
    if (!ssid) {
      await cancelAlert();
      return new Response(
        JSON.stringify({ success: false, error: loginError || 'Failed to login' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Copy: prepara login/gráfico dos clientes em paralelo e envia assim que a principal confirmar.
    let settleMaster: (m: { ok: boolean; timeframe: string; expirationIso: string | null }) => void = () => {};
    const masterOutcome = new Promise<{ ok: boolean; timeframe: string; expirationIso: string | null }>(res => { settleMaster = res; });
    const copyTask = mirrorCopyTrades(supabase, tradeRequest, tradeRequest.signalId || `auto_${Date.now()}`, masterOutcome, configData, autoTradingOn);
    // @ts-ignore EdgeRuntime exists in Supabase runtime
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(copyTask);
    const masterLeaseScope = isAnticipation(tradeRequest.entryStrategy) ? 'master:forca_antecipada' : 'master';
    await supabase.from('iq_entry_leases').update({ reserved_until: 'infinity' }).eq('scope', masterLeaseScope).eq('signal_id', reservationSignal);
    const result = await placeTradeFireAndForget(ssid, configData.account_type, tradeRequest, undefined, undefined, autoTradingOn);
    const definiteRefusal = result.error && /invalid instrument|not available|não disponível|não enviada|não enviado|entrada cancelada|insufficient|not enough/i.test(result.error);
    if (!result.success && definiteRefusal) await supabase.from('iq_entry_leases').update({ reserved_until: new Date().toISOString() }).eq('scope', masterLeaseScope).eq('signal_id', reservationSignal);
    if (!(result.success && result.tradeId)) settleMaster({ ok: false, timeframe: '', expirationIso: null });
    if (!(result.success && result.tradeId)) await cancelAlert();
    console.log('📊 Trade result:', JSON.stringify(result));

    // Save to operation_results
    if (result.success && result.tradeId) {
      const isForex = usedMode === 'forex';
      const timeframe = isForex ? 'FOREX' : (tradeRequest.timeframe || (tradeRequest.expiration <= 1 ? 'M1' : 'M5'));
      // Expiração = início do minuto de entrada (arredondado) + duração, para a sincronização achar a ordem logo ao vencer.
      const expirationIso = isForex ? null
        : isNextMinuteStrategy(tradeRequest.entryStrategy) && tradeRequest.entryAt
        ? new Date(tradeRequest.entryAt + tradeRequest.expiration * 60000).toISOString()
        : new Date((Math.round(Date.now() / 60000) + (tradeRequest.expiration || 1)) * 60000).toISOString();
      
      const { error: saveError } = await supabase.from('operation_results').insert({
        signal_id: tradeRequest.signalId || `auto_${Date.now()}`,
        asset: tradeRequest.asset,
        direction: tradeRequest.direction.toUpperCase(),
        entry_price: tradeRequest.amount,
        result: isForex ? 'open' : 'pending',
        profit: 0,
        iq_option_id: result.tradeId,
        is_auto_trade: tradeRequest.isAutoTrade || false,
        is_ai_analyzed: tradeRequest.isAIAnalyzed || false,
        entry_strategy: entryStrategy,
        timeframe,
        expiration_time: expirationIso,
      });
      settleMaster({ ok: !saveError && timeframe !== 'TEST' && timeframe !== 'MT5', timeframe, expirationIso });
      if (!saveError) await supabase.from('iq_entry_leases').update({ reserved_until: new Date().toISOString() }).eq('scope', masterLeaseScope).eq('signal_id', reservationSignal);
      
      console.log(`💾 Saved pending trade: ${result.tradeId}`);

      // Anticipation is sent only after IQ confirmation, without delaying placement.
      if (canNotifyAnticipation({ strategy: tradeRequest.entryStrategy, authorized: !!authorizedQueue,
        timeframe, entryAt: tradeRequest.entryAt, success: result.success, tradeId: result.tradeId }, Date.now())) {
        const confirmedAlert = async () => {
          const signalId = tradeRequest.signalId;
          const entryAt = tradeRequest.entryAt;
          if (!signalId || typeof entryAt !== 'number') return;
          const messageId = await sendIQAlert({ asset: tradeRequest.asset, direction: tradeRequest.direction,
            expiration: tradeRequest.expiration, entryAt, signalId, timeframe,
            strategy: 'Antecipação de Força', brokerOrderId: result.tradeId, accountType: configData.account_type,
          }, { lovableKey: Deno.env.get('LOVABLE_API_KEY') || '', telegramKey: Deno.env.get('TELEGRAM_API_KEY') || '' }, fetch, autoTradingOn);
          if (messageId === undefined) return;
          const { error } = await supabase.from('telegram_iq_deliveries').upsert({ signal_id: signalId,
            chat_id: IQ_TELEGRAM_CHANNEL, signal_message_id: messageId, strategy: 'Antecipação de Força',
          }, { onConflict: 'signal_id', ignoreDuplicates: true });
          if (error) throw error;
          await supabase.from('operation_results').update({ telegram_sent: true }).eq('signal_id', signalId);
        };
        const alertTask = confirmedAlert().catch(error => console.error('❌ Telegram antecipação:', String(error)));
        // @ts-ignore EdgeRuntime exists in the hosted runtime
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(alertTask);
      }

      // Copy trading: espelha a ordem confirmada para os clientes com copy ativo

      // Schedule result checks right at expiry (fast win/loss → instant post-win continuation)
      if (!isForex) {
        const expMs = expirationIso ? new Date(expirationIso).getTime() : Date.now() + 60000;
        const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/iqoption-check-results`;
        const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const delays = [1500, 4000, 8000, 14000, 25000, 45000].map(d => Math.max(0, expMs - Date.now() + d));
        const task = (async () => {
          let last = 0;
          for (const d of delays) {
            await new Promise(r => setTimeout(r, d - last));
            last = d;
            try {
              const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: '{}' });
              const j = await r.json().catch(() => ({}));
              console.log(`⚡ Fast result check (+${d}ms):`, JSON.stringify(j).slice(0, 200));
              if (j?.updatedResults > 0) break;
            } catch (e) { console.log('fast check error', e); }
          }
        })();
        // @ts-ignore EdgeRuntime exists in Supabase runtime
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(task);
      }
    }

    // Update trade_queue if this came from queue
    if (tradeRequest.signalId && tradeRequest.mode !== 'forex') {
      await supabase.from('trade_queue')
        .update({ 
          status: result.success ? 'executed' : 'failed',
          iq_option_id: result.tradeId || null,
          error: result.error || null,
          executed_at: new Date().toISOString(),
        })
        .eq('signal_id', tradeRequest.signalId)
        .in('status', ['pending', 'executing']);
    }

    return new Response(
      JSON.stringify({ ...result, mode: usedMode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
