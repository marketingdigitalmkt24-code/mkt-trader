/** Format broker amounts as received; never convert or assume an unconfirmed currency. */
export function formatAccountMoney(value: number, currency?: string | null, signed = false) {
  const code = currency?.trim().toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code) || !Number.isFinite(value)) return '—';
  const amount = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${value < 0 ? '−' : signed ? '+' : ''}${amount}`;
}