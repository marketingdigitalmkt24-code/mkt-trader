export const HISTORY_DAYS = 30;

export const brtDayKey = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

export const historyStart = () => new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();

export const dayLabel = (iso: string) => {
  const key = brtDayKey(iso);
  const today = brtDayKey(new Date().toISOString());
  const yesterday = brtDayKey(new Date(Date.now() - 86400000).toISOString());
  return key === today ? `Hoje · ${key}` : key === yesterday ? `Ontem · ${key}` : key;
};
