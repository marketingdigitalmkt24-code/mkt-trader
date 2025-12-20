import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { QuickStats } from '@/components/QuickStats';
import { TimeframeFilter } from '@/components/TimeframeFilter';
import { HotSignalsSection } from '@/components/HotSignalsSection';
import { AllSignalsSection } from '@/components/AllSignalsSection';
import { AssetRanking } from '@/components/AssetRanking';
import { BankManagementCard } from '@/components/BankManagementCard';
import { SafetyFiltersCard } from '@/components/SafetyFiltersCard';
import { mockSignals, mockAssetPerformance, mockBankManagement, safetyFilters } from '@/data/mockData';
import { Timeframe } from '@/types/trading';

const Index = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe | 'ALL'>('ALL');
  const [isConnected, setIsConnected] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter signals by timeframe
  const filteredSignals = selectedTimeframe === 'ALL'
    ? mockSignals
    : mockSignals.filter((s) => s.timeframe === selectedTimeframe);

  return (
    <div className="min-h-screen bg-background">
      <Header isConnected={isConnected} />
      
      <main className="container pb-8">
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
