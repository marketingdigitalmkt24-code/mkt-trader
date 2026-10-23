import { BankManagementCard } from '@/components/BankManagementCard';
import { IQEntriesTodayCard } from '@/components/IQEntriesTodayCard';
import { BrokerConnectionsCard } from '@/components/BrokerConnectionsCard';
import { LiveOperationsCard } from '@/components/LiveOperationsCard';
import { AIAnalysisStatusCard } from '@/components/AIAnalysisStatusCard';
import { ForceAnticipationTestCard } from '@/components/ForceAnticipationTestCard';
import { ForceFormingTestCard } from '@/components/ForceFormingTestCard';

export function TradingDashboard() {
  return (
    <div className="space-y-3 sm:space-y-4">
      <BrokerConnectionsCard />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <BankManagementCard />
        <IQEntriesTodayCard />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <LiveOperationsCard />
        <AIAnalysisStatusCard />
      </div>
      <ForceAnticipationTestCard />
      <ForceFormingTestCard />
    </div>
  );
}
