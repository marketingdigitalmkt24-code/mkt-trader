import { demoTestStats, type DemoOutcomeRow } from './demo-test-stats';

const BRT_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export interface DemoDailyRow extends DemoOutcomeRow { entry_minute: string; account_type: string }
export const demoDayKey = (date: Date) => BRT_DAY.format(date);
const shiftDay = (day: string, offset: number) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

export function demoDailyWindow(today: string, page: number) {
 const dates = [shiftDay(today, -page * 2), shiftDay(today, -page * 2 - 1)];
 return { dates, from: `${dates[1]}T00:00:00-03:00`, to: `${shiftDay(dates[0], 1)}T00:00:00-03:00` };
}

export function demoDailySummaries(rows: DemoDailyRow[], dates: string[]) {
 return dates.map(date => ({ date, ...demoTestStats(rows.filter(row => ['PRACTICE','REAL'].includes(row.account_type) && demoDayKey(new Date(row.entry_minute)) === date)) }));
}

export function demoDailyPages(today: string, oldest: string) {
 return Math.max(1, Math.ceil((Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${oldest}T12:00:00Z`)) / 86400000) + 1) / 2));
}