import { SignalHistory, SignalResult } from '@/types/trading';
import { SignalResultCard } from './SignalResultCard';
import { TradingStatsCard } from './TradingStatsCard';
import { History, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { useSignalResults } from '@/hooks/useSignalResults';

interface SignalHistorySectionProps {
  history: SignalHistory[];
  onRegisterResult: (signalId: string, result: SignalResult) => void;
  onClearHistory: () => void;
}

export function SignalHistorySection({ 
  history, 
  onRegisterResult,
  onClearHistory 
}: SignalHistorySectionProps) {
  const { stats, todayStats } = useSignalResults();
  
  const todayHistory = history.filter(h => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(h.timestamp) >= today;
  });

  if (history.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-secondary">
            <History className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Histórico de Resultados</h2>
            <p className="text-sm text-muted-foreground">
              {todayHistory.length} sinais hoje • {history.length} total
            </p>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onClearHistory}
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Limpar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <TradingStatsCard stats={todayStats} title="Hoje" />
        <TradingStatsCard stats={stats} title="Total" />
      </div>

      {/* History List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {history.slice(0, 20).map((entry) => (
          <SignalResultCard
            key={entry.id}
            signal={entry.signal}
            onRegisterResult={onRegisterResult}
            showManualButtons={!entry.result || entry.result === 'pending'}
          />
        ))}
      </div>
    </section>
  );
}
