import { Activity } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { OpenPositionsSection } from './OpenPositionsSection';
import { DemoOpenOperations } from './DemoOpenOperations';
import { DemoTestOperations } from './DemoTestOperations';
import { DemoDailyHistory } from './DemoDailyHistory';

export function QuedaForteOperationsCard() {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Operações em Tempo Real · 2</h3>
        </div>
        <OpenPositionsSection />
        <DemoOpenOperations strategy="TENDENCIA_FORCA_RECUO" />
        <DemoTestOperations strategy="TENDENCIA_FORCA_RECUO" />
        <DemoDailyHistory strategy="TENDENCIA_FORCA_RECUO" />
      </CardContent>
    </Card>
  );
}
