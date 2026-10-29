import { telegramTradingEnabled } from './principal-pause.ts';
const TELEGRAM_GATEWAY = 'https://connector-gateway.lovable.dev/telegram';
// Verified channel identity; avoids an upstream username lookup for each alert.
const TELEGRAM_CHANNEL = '-1003669008671';
export const IQ_TELEGRAM_CHANNEL = TELEGRAM_CHANNEL;

export interface IQAlert {
  asset: string;
  direction: 'call' | 'put';
  expiration: number;
  entryAt: number;
  signalId: string;
  timeframe: string;
  strategy?: string;
  entryStrategy?: string;
  brokerOrderId?: string;
  accountType?: string;
}

export function formatIQAlert(alert: IQAlert): string {
  const entryTime = new Date(alert.entryAt).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return [
    '📣 AGÊNCIA MKT TRADER — Sinal IQ Option',
    `💱 Ativo: ${alert.asset}`,
    `🎯 Estratégia: ${alert.strategy || 'Não identificada'}`,
    `Direção: ${alert.direction === 'call' ? '🟢 COMPRA (CALL)' : '🔴 VENDA (PUT)'}`,
    `⏰ Entrada prevista: ${entryTime} (Brasília)`,
    `⌛ Vencimento: ${alert.expiration} minuto(s)`,
    ...(alert.brokerOrderId ? [
      `✅ Ordem IQ confirmada: #${alert.brokerOrderId}`,
      `🏦 Conta: ${alert.accountType === 'REAL' ? 'Real' : 'Demo'}`,
      '⚠️ Sem garantia de lucro.',
    ] : [
      '📤 Entrada selecionada para envio à corretora; não é operação TESTE.',
      '⚠️ Aviso antecipado: a corretora ainda pode recusar a ordem. Sem garantia de lucro.',
    ]),
  ].join('\n');
}

export async function sendIQAlert(
  alert: IQAlert,
  credentials: { lovableKey: string; telegramKey: string },
  request: typeof fetch = fetch,
  autoTradingOn = false,
): Promise<number | undefined> {
  if (!telegramTradingEnabled(alert.entryStrategy, autoTradingOn)) return;
  if (!alert.signalId || alert.timeframe === 'TEST' || alert.timeframe === 'MT5') return;
  if (!credentials.lovableKey || !credentials.telegramKey) throw new Error('Telegram não configurado');
  for (let attempt = 0; attempt < 3; attempt++) {
    // Never resend an expired entry notice as if it were still actionable.
    const noticeDeadline = alert.brokerOrderId ? alert.entryAt + alert.expiration * 60000 : alert.entryAt;
    if ((attempt > 0 || alert.brokerOrderId) && Date.now() >= noticeDeadline) throw new Error('Telegram: entrada prevista já passou; aviso não reenviado');
    try {
      const response = await request(`${TELEGRAM_GATEWAY}/sendMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.lovableKey}`,
      'X-Connection-Api-Key': credentials.telegramKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL, text: formatIQAlert(alert) }),
    signal: AbortSignal.timeout(8000),
  });
      if (!response.ok) {
        const details = await response.text();
        console.error(`Telegram tentativa ${attempt + 1} [${response.status}]: ${details}`);
        if ([502, 503, 504].includes(response.status) && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        throw new Error(`Telegram [${response.status}]: ${details}`);
      }
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram [${response.status}]: ${JSON.stringify(data)}`);
  if (!Number.isSafeInteger(data.result?.message_id)) throw new Error('Telegram: message_id ausente');
  console.log(`📱 Telegram enviado: ${alert.asset} | sinal ${alert.signalId} | mensagem ${data.result?.message_id}`);
  return data.result.message_id;
    } catch (error) {
      // Explicit HTTP failures are handled above; don't retry ambiguous timeouts,
      // which could duplicate a message accepted before the response was lost.
      throw error;
    }
  }
  throw new Error('Telegram: tentativas de envio esgotadas');
}