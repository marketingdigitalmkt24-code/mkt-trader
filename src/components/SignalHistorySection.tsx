import { useState } from 'react';
import { SignalHistory, SignalResult, TradingStats } from '@/types/trading';
import { SignalResultCard } from './SignalResultCard';
import { TradingStatsCard } from './TradingStatsCard';
import { History, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

interface SignalHistorySectionProps {
  history: SignalHistory[];
  onRegisterResult: (signalId: string, result: SignalResult) => void;
  onClearHistory: () => void;
}

const ITEMS_PER_PAGE = 10;

function calculateStats(historyData: SignalHistory[]): TradingStats {
  const completed = historyData.filter((h) => h.result !== 'pending');
  const wins = completed.filter((h) => h.result === 'win').length;
  const losses = completed.filter((h) => h.result === 'loss').length;
  const ties = completed.filter((h) => h.result === 'tie').length;
  const pending = historyData.filter((h) => h.result === 'pending').length;

  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const totalProfit = historyData.reduce((sum, h) => sum + h.profit, 0);

  // streak
  let streak = 0;
  let streakType: 'win' | 'loss' | 'none' = 'none';

  for (let i = completed.length - 1; i >= 0; i--) {
    const result = completed[i].result;
    if (result === 'tie') continue;

    if (streakType === 'none') {
      streakType = result as 'win' | 'loss';
      streak = 1;
    } else if (result === streakType) {
      streak++;
    } else {
      break;
    }
  }

  return {
    totalSignals: historyData.length,
    wins,
    losses,
    ties,
    pending,
    winRate: Math.round(winRate * 10) / 10,
    totalProfit: Math.round(totalProfit * 100) / 100,
    streak,
    streakType,
  };
}

export function SignalHistorySection({ 
  history, 
  onRegisterResult,
  onClearHistory 
}: SignalHistorySectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  
  const todayHistory = history.filter((h) => {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    return new Date(h.timestamp).getTime() >= todayUtc.getTime();
  });

  // Calculate today's wins and losses
  const todayWins = todayHistory.filter(h => h.result === 'win').length;
  const todayLosses = todayHistory.filter(h => h.result === 'loss').length;
  const todayTies = todayHistory.filter(h => h.result === 'tie').length;
  const totalStats = calculateStats(history);
  const computedTodayStats = calculateStats(todayHistory);

  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedHistory = history.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

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
              Hoje: <span className="text-call font-medium">{todayWins}W</span> / <span className="text-put font-medium">{todayLosses}L</span> / <span className="text-muted-foreground">{todayTies}T</span> • {history.length} total
            </p>
          </div>
        </div>
        
        {history.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={onClearHistory}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <TradingStatsCard stats={computedTodayStats} title="Hoje" />
        <TradingStatsCard stats={totalStats} title="Total" />
      </div>

      {/* History List */}
      {history.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <History className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum resultado registrado ainda</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Os resultados aparecerão automaticamente após os sinais expirarem
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedHistory.map((entry) => (
            <SignalResultCard
              key={entry.id}
              signal={entry.signal}
              onRegisterResult={onRegisterResult}
              showManualButtons={!entry.result || entry.result === 'pending'}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => goToPage(pageNum)}
                  className="w-8 h-8 p-0"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          
          <span className="text-sm text-muted-foreground ml-2">
            {startIndex + 1}-{Math.min(endIndex, history.length)} de {history.length}
          </span>
        </div>
      )}
    </section>
  );
}
