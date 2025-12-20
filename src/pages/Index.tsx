import { useState } from 'react';
import { Header } from '@/components/Header';
import { QuickStats } from '@/components/QuickStats';
import { TimeframeFilter } from '@/components/TimeframeFilter';
import { HotSignalsSection } from '@/components/HotSignalsSection';
import { AllSignalsSection } from '@/components/AllSignalsSection';
import { AssetRanking } from '@/components/AssetRanking';
import { BankManagementCard } from '@/components/BankManagementCard';
import { SafetyFiltersCard } from '@/components/SafetyFiltersCard';
import { mockAssetPerformance, mockBankManagement, safetyFilters } from '@/data/mockData';
import { Timeframe } from '@/types/trading';
import { useAutoSignals } from '@/hooks/useAutoSignals';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | 'ALL'>('ALL');
  const { signals, lastUpdate, nextUpdate, isLoading, refreshSignals } = useAutoSignals(30000);

  // Filter signals by timeframe
  const filteredSignals = selectedTimeframe === 'ALL'
    ? signals
    : signals.filter((s) => s.timeframe === selectedTimeframe);

  return (
    <div className="min-h-screen bg-background">
      <Header 
        isConnected={true} 
        lastUpdate={lastUpdate}
        nextUpdate={nextUpdate}
        isLoading={isLoading}
        onRefresh={refreshSignals}
      />
      
      <main className="container pb-8">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm flex items-center justify-center">
            <div className="glass-card p-6 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">Atualizando sinais...</span>
            </div>
          </div>
        )}

        <QuickStats signals={filteredSignals} />
        
        <TimeframeFilter
          selected={selectedTimeframe}
          onChange={setSelectedTimeframe}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content - Signals */}
          <div className="lg:col-span-2 space-y-6">
            <HotSignalsSection signals={filteredSignals} />
            <AllSignalsSection signals={filteredSignals} />
          </div>

          {/* Sidebar - Stats & Management */}
          <div className="space-y-6">
            <BankManagementCard bank={mockBankManagement} />
            <AssetRanking assets={mockAssetPerformance} />
            <SafetyFiltersCard filters={safetyFilters} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
