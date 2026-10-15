const TELEGRAM_GATEWAY = 'https://connector-gateway.lovable.dev/telegram';
const TELEGRAM_CHANNEL = '@agenciaMKT_Trader';
export const IQ_TELEGRAM_CHANNEL = TELEGRAM_CHANNEL;

export interface IQAlert {
  asset: string;
  direction: 'call' | 'put';
  expiration: number;
  entryAt: number;
  signalId: string;
  timeframe: string;
  strategy?: string;
}

export function formatIQAlert(alert: IQAlert): string {
  const entryTime = new Date(alert.entryAt).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return [
    'AGENCIA MKT TRADER — IQ Option',
    `Ativo: ${alert.asset}`,
    `Estratégia: ${alert.strategy || 'Não identificada'}`,
    `Direção: ${alert.direction === 'call' ? '🟢 COMPRA (CALL)' : '🔴 VENDA (PUT)'}`,
    `Entrada prevista: ${entryTime} (Brasília)`,
    `Vencimento: ${alert.expiration} minuto(s)`,
    'Entrada selecionada para envio à corretora; não é operação TESTE.',
    'Aviso antecipado: a corretora ainda pode recusar a ordem. Sem garantia de lucro.',
  ].join('\n');
}

export async function sendIQAlert(
  alert: IQAlert,
  credentials: { lovableKey: string; telegramKey: string },
  request: typeof fetch = fetch,
): Promise<number | undefined> {
  if (!alert.signalId || alert.timeframe === 'TEST' || alert.timeframe === 'MT5') return;
  if (!credentials.lovableKey || !credentials.telegramKey) throw new Error('Telegram não configurado');
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
  if (!response.ok) throw new Error(`Telegram [${response.status}]: ${await response.text()}`);
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram [${response.status}]: ${JSON.stringify(data)}`);
  if (!Number.isSafeInteger(data.result?.message_id)) throw new Error('Telegram: message_id ausente');
  console.log(`📱 Telegram enviado: ${alert.asset} | sinal ${alert.signalId} | mensagem ${data.result?.message_id}`);
  return data.result.message_id;
}