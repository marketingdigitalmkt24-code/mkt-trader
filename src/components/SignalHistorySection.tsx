import { useState } from 'react';
import { SignalHistory, SignalResult } from '@/types/trading';
import { SignalResultCard } from './SignalResultCard';
import { TradingStatsCard } from './TradingStatsCard';
import { History, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { useSignalResults } from '@/hooks/useSignalResults';

interface SignalHistorySectionProps {
  history: SignalHistory[];
  onRegisterResult: (signalId: string, result: SignalResult) => void;
  onClearHistory: () => void;
}

const ITEMS_PER_PAGE = 10;

export function SignalHistorySection({ 
  history, 
  onRegisterResult,
  onClearHistory 
}: SignalHistorySectionProps) {
  const { stats, todayStats } = useSignalResults();
  const [currentPage, setCurrentPage] = useState(1);
  
  const todayHistory = history.filter(h => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(h.timestamp) >= today;
  });

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
              {todayHistory.length} sinais hoje • {history.length} total
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
        <TradingStatsCard stats={todayStats} title="Hoje" />
        <TradingStatsCard stats={stats} title="Total" />
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
