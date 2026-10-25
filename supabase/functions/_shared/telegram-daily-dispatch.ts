import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.89.0';
import { telegramTradingEnabled } from './principal-pause.ts';
import { IQ_TELEGRAM_CHANNEL } from './telegram-iq-alert.ts';
import { formatDailyReport, reportClock, type ReportRow } from './telegram-daily-report.ts';
export async function dispatchDailyReport(db: SupabaseClient, now = new Date(), request: typeof fetch = fetch) {
  if (!telegramTradingEnabled()) return 'paused';
  const clock = reportClock(now);
  if (!clock.due) return 'not-due';
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const telegramKey = Deno.env.get('TELEGRAM_API_KEY');
  if (!lovableKey || !telegramKey) throw new Error('Telegram não configurado');
  const { error: claimError } = await db.from('telegram_daily_reports').insert({ report_date: clock.date });
  if (claimError?.code === '23505') return 'already-claimed';
  if (claimError) throw claimError;
  let sending = false;
  try {
    const rows: ReportRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('operation_results')
        .select('signal_id, timeframe, iq_option_id, result, profit, created_at, entry_strategy, test_sequence_strategy, test_inverted_strategy')
        .not('signal_id', 'like', 'copy-%').not('signal_id', 'like', 'mt5-%')
        .or('timeframe.is.null,timeframe.neq.MT5').gte('created_at', clock.start).lte('created_at', clock.end)
        .order('created_at').order('id').range(from, from + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const { data: config, error: configError } = await db.rpc('get_master_iq_config').maybeSingle();
    if (configError) throw configError;
    const text = formatDailyReport(rows, now, config?.account_type ?? 'PRACTICE');
    const { error: saveError } = await db.from('telegram_daily_reports').update({ status: 'sending', message_text: text }).eq('report_date', clock.date);
    if (saveError) throw saveError;
    sending = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request('https://connector-gateway.lovable.dev/telegram/sendMessage', {
        method: 'POST', headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': telegramKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: IQ_TELEGRAM_CHANNEL, text }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const details = await response.text();
        console.error(`Telegram daily [${response.status}]: ${details}`);
        if ([502, 503, 504].includes(response.status) && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        throw new Error(`Telegram [${response.status}]: ${details}`);
      }
      const data = await response.json();
      if (!data.ok || !Number.isSafeInteger(data.result?.message_id)) throw new Error(`Telegram [${response.status}]: ${JSON.stringify(data)}`);
      const { error } = await db.from('telegram_daily_reports').update({ status: 'sent', message_id: data.result.message_id, sent_at: new Date().toISOString() }).eq('report_date', clock.date);
      if (error) throw error;
      return 'sent';
    }
  } catch (error) {
    await db.from('telegram_daily_reports').update({ status: sending ? 'delivery-unconfirmed' : 'failed', error: String(error) }).eq('report_date', clock.date);
    throw error;
  }
}
