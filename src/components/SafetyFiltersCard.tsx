import { SafetyFilter } from '@/types/trading';
import { Shield, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SafetyFiltersCardProps {
  filters: SafetyFilter[];
}

export function SafetyFiltersCard({ filters }: SafetyFiltersCardProps) {
  const activeCount = filters.filter((f) => f.isActive).length;

  return (
    <section className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-call" />
          <h3 className="font-semibold text-foreground">Filtros de Segurança</h3>
        </div>
        <span className="text-xs bg-call/20 text-call px-2 py-1 rounded-full">
          {activeCount}/{filters.length} ativos
        </span>
      </div>

      <div className="space-y-2">
        {filters.map((filter) => (
          <div
            key={filter.id}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg transition-colors',
              filter.isActive ? 'bg-call/10 border border-call/20' : 'bg-secondary/50'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{filter.icon}</span>
              <div>
                <div className="text-sm font-medium">{filter.name}</div>
                <div className="text-xs text-muted-foreground">{filter.description}</div>
              </div>
            </div>
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center',
                filter.isActive ? 'bg-call text-background' : 'bg-muted text-muted-foreground'
              )}
            >
              {filter.isActive ? (
                <Check className="w-4 h-4" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
