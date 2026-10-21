import { confirmedAnticipationOrder, isAnticipation } from './anticipation-execution.ts';

export function canNotifyAnticipation(input: {
  strategy?: string; authorized: boolean; timeframe?: string; entryAt?: number;
  success?: boolean; tradeId?: string;
}, now: number): boolean {
  return isAnticipation(input.strategy) && input.authorized && input.timeframe === 'M1'
    && confirmedAnticipationOrder(input) && typeof input.entryAt === 'number'
    && input.entryAt % 60000 === 0 && now >= input.entryAt && now < input.entryAt + 60000;
}