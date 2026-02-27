import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { QuickStats } from '@/components/QuickStats';
import { TimeframeFilter } from '@/components/TimeframeFilter';
import { AllSignalsSection } from '@/components/AllSignalsSection';
import { AssetRanking } from '@/components/AssetRanking';
import { BankManagementCard } from '@/components/BankManagementCard';
import { SafetyFiltersCard } from '@/components/SafetyFiltersCard';
import { MarketStatusCard } from '@/components/MarketStatusCard';
import { SignalHistorySection } from '@/components/SignalHistorySection';
import { AIStatusIndicator } from '@/components/AIStatusIndicator';
import { mockAssetPerformance, safetyFilters } from '@/data/mockData';
import { Timeframe, MarketType, TradingSignal } from '@/types/trading';
import { useAutoSignals } from '@/hooks/useAutoSignals';
import { useSignalResults } from '@/hooks/useSignalResults';
import { useAutoTrading } from '@/hooks/useAutoTrading';
import { Loader2 } from 'lucide-react';

type MarketFilter = 'ALL' | MarketType;

const Index = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | 'ALL'>('ALL');
  const [selectedMarket, setSelectedMarket] = useState<MarketFilter>('ALL');
  
  const { 
    signals, 
    lastUpdate, 
    isLoading, 
    isSearching, 
    marketStatus,
  } = useAutoSignals();

  const {
    history,
    stats,
    todayStats,
    clearHistory,
  } = useSignalResults();

  const {
    config: autoTradingConfig,
    updateConfig: updateAutoTradingConfig,
    checkAndAutoTrade,
    isPlacingTrade,
    isAnalyzingAI,
    activeTradesCount,
    lastTradeResult,
    resetDailyTrades,
  } = useAutoTrading();

  // Auto trading: executar entrada quando sinal de alta probabilidade aparecer
  useEffect(() => {
    if (signals.length > 0) {
      checkAndAutoTrade(signals);
    }
  }, [signals, checkAndAutoTrade]);

  // Filter signals by timeframe and market type
  const filteredSignals = signals.filter((s) => {
    const tfMatch = selectedTimeframe === 'ALL' || s.timeframe === selectedTimeframe;
    const marketMatch = selectedMarket === 'ALL' || s.marketType === selectedMarket;
    return tfMatch && marketMatch;
  });

  return (
    <div className="min-h-screen bg-background">
      <Header 
        isConnected={true} 
        lastUpdate={lastUpdate}
        isLoading={isLoading}
        isSearching={isSearching}
      />
      
      <main className="container px-4 pb-6 sm:pb-8">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm flex items-center justify-center">
            <div className="glass-card p-4 sm:p-6 flex flex-col items-center gap-2 sm:gap-3">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-primary animate-spin" />
              <span className="text-xs sm:text-sm text-muted-foreground">Atualizando sinais...</span>
            </div>
          </div>
        )}

        {/* AI Status Indicator */}
        <div className="mb-4">
          <AIStatusIndicator
            isAutoTradingEnabled={autoTradingConfig.enabled}
            isAIEnabled={autoTradingConfig.useAIAnalysis}
            isAnalyzing={isAnalyzingAI}
            isPlacingTrade={isPlacingTrade}
            activeTradesCount={activeTradesCount}
            todayTrades={autoTradingConfig.todayTrades}
            maxDailyTrades={autoTradingConfig.maxDailyTrades}
            dailyLimitEnabled={autoTradingConfig.dailyLimitEnabled}
          />
        </div>

        <QuickStats signals={filteredSignals} />
        
        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <TimeframeFilter
            selected={selectedTimeframe}
            onChange={setSelectedTimeframe}
          />
          
          {/* Market Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-muted-foreground shrink-0">Mercado:</span>
            <div className="flex bg-secondary/50 rounded-lg p-1 overflow-x-auto">
              {(['ALL', 'forex', 'crypto', 'otc'] as MarketFilter[]).map((market) => (
                <button
                  key={market}
                  onClick={() => setSelectedMarket(market)}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    selectedMarket === market
                      ? market === 'otc' 
                        ? 'bg-blue-500/20 text-blue-400 shadow-lg'
                        : 'bg-primary text-primary-foreground shadow-lg'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {market === 'ALL' ? 'Todos' : market.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          {/* Main Content - Signals */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <SignalHistorySection 
              history={history}
              onClearHistory={clearHistory}
            />
            
            <AllSignalsSection signals={filteredSignals} />
          </div>

          {/* Sidebar - Stats & Management */}
          <div className="space-y-4 sm:space-y-6">
            <MarketStatusCard 
              otcOpen={marketStatus.otcOpen} 
              forexOpen={marketStatus.forexOpen} 
            />
            <BankManagementCard />
            <AssetRanking assets={mockAssetPerformance} />
            <SafetyFiltersCard filters={safetyFilters} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
