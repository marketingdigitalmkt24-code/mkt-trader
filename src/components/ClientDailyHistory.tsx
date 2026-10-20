import { Card } from '@/components/ui/card';
import { DailyHistory } from '@/components/DailyHistory';
import { useClientCopyHistory } from '@/hooks/useClientCopyHistory';
import { clientDayStart } from '@/lib/client-copy-results';

// Histórico diário do cliente (somente as cópias dele), 5 dias por página.
export function ClientDailyHistory() {
  const { operations } = useClientCopyHistory();
  if (!operations.some(op => op.created_at < clientDayStart())) return null;
  return (
    <Card className="p-3 sm:p-4 border-border/50 [&>div]:mt-0">
      <DailyHistory title="Histórico Diário IQ Option" operations={operations} perPage={5} />
    </Card>
  );
}
