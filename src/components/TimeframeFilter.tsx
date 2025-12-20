import { Timeframe } from '@/types/trading';
import { cn } from '@/lib/utils';

interface TimeframeFilterProps {
  selected: Timeframe | 'ALL';
  onChange: (tf: Timeframe | 'ALL') => void;
}

export function TimeframeFilter({ selected, onChange }: TimeframeFilterProps) {
  const options: (Timeframe | 'ALL')[] = ['ALL', 'M1', 'M5'];

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Timeframe:</span>
      <div className="flex bg-secondary/50 rounded-lg p-1">
        {options.map((tf) => (
          <button
            key={tf}
            onClick={() => onChange(tf)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
              selected === tf
                ? 'bg-primary text-primary-foreground shadow-lg'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tf === 'ALL' ? 'Todos' : tf}
          </button>
        ))}
      </div>
    </div>
  );
}
