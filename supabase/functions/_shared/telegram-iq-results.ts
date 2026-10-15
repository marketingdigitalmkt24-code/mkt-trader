import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';

interface IQResult {
  signal_id: string;
  asset: string;
  direction: string;
  result: string;
  profit: number;
  created_at: string;
  timeframe: string;
  iq_option_id: string | null;
}

export function isFinalIQResult(op: IQResult): boolean {
  return !!op.iq_option_id && !['TEST', 'MT5'].includes(op.timeframe)
    && !op.signal_id.startsWith('mt5-') && ['win', 'loss', 'tie'].includes(op.result)
    && Number.isFinite(Number(op.profit));
}

export function formatIQResult(op: IQResult, strategy: string | null): string {
  const profit = Number(op.profit);
  const time = new Date(op.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return [
    '📊 AGÊNCIA MKT TRADER — Resultado IQ Option',
    `💱 Ativo: ${op.asset}`,
    `🎯 Estratégia: ${strategy || 'Não identificada'}`,
    `Direção: ${op.direction.toUpperCase() === 'CALL' ? '🟢 COMPRA (CALL)' : '🔴 VENDA (PUT)'}`,
    `⏰ Entrada: ${time} (Brasília)`,
    `Resultado: ${op.result === 'win' ? '✅ GANHO' : op.result === 'loss' ? '❌ PERDA' : '➖ EMPATE'}`,
    `💰 Resultado líquido: ${profit > 0 ? '+' : profit < 0 ? '-' : ''}US$ ${Math.abs(profit).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ].join('\n');
}

// Only persisted successful signal deliveries are eligible. Conditional leases
// prevent concurrent cron/browser invocations from normally sending duplicates.
export async function dispatchIQResults(db: SupabaseClient, request: typeof fetch = fetch): Promise<number> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const telegramKey = Deno.env.get('TELEGRAM_API_KEY');
  if (!lovableKey || !telegramKey) return 0;
  const stale = new Date(Date.now() - 120000).toISOString();
  const { data: deliveries, error } = await db.from('telegram_iq_deliveries')
    .select('signal_id, chat_id, signal_message_id, strategy')
    .or(`result_status.eq.pending,and(result_status.eq.sending,claimed_at.lt.${stale})`)
    .order('created_at').limit(50);
  if (error) throw error;
  let sent = 0;
  for (const delivery of deliveries || []) {
    const { data: op, error: opError } = await db.from('operation_results')
      .select('signal_id, asset, direction, result, profit, created_at, timeframe, iq_option_id')
      .eq('signal_id', delivery.signal_id).in('result', ['win', 'loss', 'tie'])
      .not('iq_option_id', 'is', null).not('timeframe', 'in', '(TEST,MT5)')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (opError) throw opError;
    if (!op || !isFinalIQResult(op)) continue;
    const claimedAt = new Date().toISOString();
    const { data: claim, error: claimError } = await db.from('telegram_iq_deliveries')
      .update({ result_status: 'sending', claimed_at: claimedAt })
      .eq('signal_id', delivery.signal_id)
      .or(`result_status.eq.pending,and(result_status.eq.sending,claimed_at.lt.${stale})`)
      .select('signal_id').maybeSingle();
    if (claimError) throw claimError;
    if (!claim) continue;
    let delivered = false;
    try {
      const response = await request('https://connector-gateway.lovable.dev/telegram/sendMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': telegramKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: delivery.chat_id, text: formatIQResult(op, delivery.strategy),
          reply_parameters: { message_id: delivery.signal_message_id, allow_sending_without_reply: true } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Telegram [${response.status}]: ${await response.text()}`);
      const data = await response.json();
      if (!data.ok || !Number.isSafeInteger(data.result?.message_id)) throw new Error(`Telegram [${response.status}]: ${JSON.stringify(data)}`);
      delivered = true;
      const { error: saveError } = await db.from('telegram_iq_deliveries')
        .update({ result_status: 'sent', result_message_id: data.result.message_id, result_sent_at: new Date().toISOString() })
        .eq('signal_id', delivery.signal_id).eq('claimed_at', claimedAt);
      if (saveError) throw saveError;
      sent++;
    } catch (failure) {
      console.error('Telegram IQ resultado:', String(failure));
      if (!delivered) await db.from('telegram_iq_deliveries').update({ result_status: 'pending', claimed_at: null })
        .eq('signal_id', delivery.signal_id).eq('claimed_at', claimedAt);
    }
  }
  return sent;
}