import { selectedDemoTrend, freshSelectedTrend } from './selected-demo-trend.ts';
import { QUEDA_WIN_RETRY } from './queda-win-call.ts';
export function selectedDemoPrincipal(c: { signal_id: string; entry_strategy: string; entry_minute: string; direction: string } | null, now: number) {
  return selectedDemoTrend(c, now) || Boolean(c && c.entry_strategy === QUEDA_WIN_RETRY
    && c.signal_id.startsWith('queda-win-retry-v1-') && c.direction === 'CALL'
    && freshSelectedTrend(Date.parse(c.entry_minute), now));
}