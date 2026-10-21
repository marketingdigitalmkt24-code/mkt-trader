// Rótulos de origem das entradas reais (mesmos usados no card "Entradas na IQ Option" do admin e do cliente).
export function entryOriginLabel(entryStrategy: string | null | undefined): string {
  switch (entryStrategy) {
    case 'RETOMADA': return '📐 Retomada';
    case 'VELA_FORCA': return '🕯️ Vela de Força';
    case 'RECUO_EMA21': return '📉 Recuo na média 21';
    case 'FORCA_INVERTIDA': return '🔄 Força Invertida';
    case 'THREE_FORCE': return '🕯️ Após 3 Velas de Força';
    case 'FOUR_WIN_REVERSAL': return '🔄 Após 4 ganhos';
    case 'TENDENCIA': return 'Tendência';
    case 'TENDENCIA_V1': return '📐 Tendência V1';
    case 'HISTORICO': return '📜 Histórico bom';
    case 'EMPATE': return '🤝 Empate';
    case 'REVERSAO_RSI': return '🔄 Reversão RSI';
    default: return 'Não identificada';
  }
}
