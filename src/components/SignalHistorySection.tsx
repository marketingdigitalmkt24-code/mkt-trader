import { useEffect, useState } from 'react';
import { SignalHistory, TradingStats } from '@/types/trading';
import { SignalResultCard } from './SignalResultCard';
import { TradingStatsCard } from './TradingStatsCard';
import { History, Trash2, ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface SignalHistorySectionProps {
  history: SignalHistory[];
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

function formatDate(timestamp: Date): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit',
    year: '2-digit'
  });
}

export function SignalHistorySection({ 
  history, 
  onClearHistory 
}: SignalHistorySectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [allHistoryPage, setAllHistoryPage] = useState(1);
  const [activeTab, setActiveTab] = useState('today');
  
  // Filter today's history and sort by most recent first
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  
  const todayHistory = history
    .filter((h) => new Date(h.timestamp).getTime() >= todayUtc.getTime())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // All history sorted by most recent first
  const allHistory = [...history].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Calculate today's wins and losses
  const todayWins = todayHistory.filter(h => h.result === 'win').length;
  const todayLosses = todayHistory.filter(h => h.result === 'loss').length;
  const todayTies = todayHistory.filter(h => h.result === 'tie').length;
  const totalStats = calculateStats(history);
  const computedTodayStats = calculateStats(todayHistory);

  // Paginate today's history
  const todayTotalPages = Math.ceil(todayHistory.length / ITEMS_PER_PAGE);
  const todayStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const todayEndIndex = todayStartIndex + ITEMS_PER_PAGE;
  const paginatedTodayHistory = todayHistory.slice(todayStartIndex, todayEndIndex);

  // Paginate all history
  const allTotalPages = Math.ceil(allHistory.length / ITEMS_PER_PAGE);
  const allStartIndex = (allHistoryPage - 1) * ITEMS_PER_PAGE;
  const allEndIndex = allStartIndex + ITEMS_PER_PAGE;
  const paginatedAllHistory = allHistory.slice(allStartIndex, allEndIndex);

  // Always show the most recent trades when new ones arrive
  useEffect(() => {
    setCurrentPage(1);
  }, [todayHistory.length]);

  const goToPage = (page: number, isToday: boolean) => {
    const maxPages = isToday ? todayTotalPages : allTotalPages;
    const newPage = Math.max(1, Math.min(page, maxPages));
    if (isToday) {
      setCurrentPage(newPage);
    } else {
      setAllHistoryPage(newPage);
    }
  };

  const renderPagination = (
    currentPageNum: number, 
    totalPages: number, 
    startIndex: number, 
    endIndex: number, 
    totalItems: number,
    isToday: boolean
  ) => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-center gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPageNum - 1, isToday)}
          disabled={currentPageNum === 1}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <div className="flex items-center gap-1">
          {/* First page */}
          {currentPageNum > 3 && totalPages > 5 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(1, isToday)}
                className="w-8 h-8 p-0"
              >
                1
              </Button>
              {currentPageNum > 4 && <span className="text-muted-foreground px-1">...</span>}
            </>
          )}
          
          {/* Page numbers */}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPageNum <= 3) {
              pageNum = i + 1;
            } else if (currentPageNum >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPageNum - 2 + i;
            }
            
            // Skip if we already showed first page or will show last page
            if (pageNum <= 0 || pageNum > totalPages) return null;
            if (currentPageNum > 3 && totalPages > 5 && pageNum === 1) return null;
            if (currentPageNum < totalPages - 2 && totalPages > 5 && pageNum === totalPages) return null;
            
            return (
              <Button
                key={pageNum}
                variant={currentPageNum === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => goToPage(pageNum, isToday)}
                className="w-8 h-8 p-0"
              >
                {pageNum}
              </Button>
            );
          })}
          
          {/* Last page */}
          {currentPageNum < totalPages - 2 && totalPages > 5 && (
            <>
              {currentPageNum < totalPages - 3 && <span className="text-muted-foreground px-1">...</span>}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(totalPages, isToday)}
                className="w-8 h-8 p-0"
              >
                {totalPages}
              </Button>
            </>
          )}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPageNum + 1, isToday)}
          disabled={currentPageNum === totalPages}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        
        <span className="text-sm text-muted-foreground ml-2">
          {startIndex + 1}-{Math.min(endIndex, totalItems)} de {totalItems}
        </span>
      </div>
    );
  };

  const renderHistoryList = (items: SignalHistory[], showDate: boolean = false) => {
    if (items.length === 0) {
      return (
        <div className="glass-card p-8 text-center">
          <History className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum resultado registrado</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Os resultados aparecerão automaticamente após os sinais expirarem
          </p>
        </div>
      );
    }

    // Group by date if showing all history
    if (showDate) {
      const groupedByDate: Record<string, SignalHistory[]> = {};
      items.forEach(item => {
        const dateKey = formatDate(item.timestamp);
        if (!groupedByDate[dateKey]) {
          groupedByDate[dateKey] = [];
        }
        groupedByDate[dateKey].push(item);
      });

      return (
        <div className="space-y-4">
          {Object.entries(groupedByDate).map(([date, dateItems]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">{date}</span>
                <span className="text-xs text-muted-foreground/70">
                  ({dateItems.length} trades)
                </span>
              </div>
              <div className="space-y-2">
                {dateItems.map((entry) => (
                  <SignalResultCard
                    key={entry.id}
                    signal={entry.signal}
                    showManualButtons={false}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {items.map((entry) => (
          <SignalResultCard
            key={entry.id}
            signal={entry.signal}
            showManualButtons={false}
          />
        ))}
      </div>
    );
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
              Hoje: <span className="text-call font-medium">{todayWins}W</span> / <span className="text-put font-medium">{todayLosses}L</span> / <span className="text-muted-foreground">{todayTies}T</span> • Total: {history.length} trades
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

      {/* Tabs for Today / All History */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="today" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Hoje ({todayHistory.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Todo Histórico ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-0">
          {renderHistoryList(paginatedTodayHistory, false)}
          {renderPagination(
            currentPage, 
            todayTotalPages, 
            todayStartIndex, 
            todayEndIndex, 
            todayHistory.length, 
            true
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-0">
          {renderHistoryList(paginatedAllHistory, true)}
          {renderPagination(
            allHistoryPage, 
            allTotalPages, 
            allStartIndex, 
            allEndIndex, 
            allHistory.length, 
            false
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
