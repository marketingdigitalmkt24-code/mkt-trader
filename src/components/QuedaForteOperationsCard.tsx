import { Activity } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { DemoOpenOperations } from './DemoOpenOperations';
import { DemoTestOperations } from './DemoTestOperations';
import { DemoDailyHistory } from './DemoDailyHistory';

export function QuedaForteOperationsCard() {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Operações em Tempo Real · Queda forte</h3>
        </div>
        <p className="mb-2 text-xs font-medium text-primary">Estratégia: Queda forte</p>
        <DemoOpenOperations strategy="QUEDA_FORTE" />
        <DemoTestOperations strategy="QUEDA_FORTE" />
        <DemoDailyHistory strategy="QUEDA_FORTE" />
      </CardContent>
    </Card>
  );
}
