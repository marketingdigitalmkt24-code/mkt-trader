import { Activity, Wifi, RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  isConnected: boolean;
  lastUpdate: Date;
  nextUpdate: number;
  isLoading: boolean;
  onRefresh: () => void;
}

export function Header({ isConnected, lastUpdate, nextUpdate, isLoading, onRefresh }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 glass-card border-b border-border/50 mb-6">
      <div className="container py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-call to-gold flex items-center justify-center">
              <Activity className="w-6 h-6 text-background" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                Binary Analyzer
              </h1>
              <p className="text-xs text-muted-foreground">
                Análise Técnica Avançada
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                'bg-secondary hover:bg-secondary/80 text-foreground',
                isLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            {/* Auto Update Timer */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 rounded-lg">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground">
                {nextUpdate}s
              </span>
            </div>

            {/* Connection Status */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
                isConnected
                  ? 'bg-call/20 text-call'
                  : 'bg-put/20 text-put'
              )}
            >
              <Wifi className="w-3 h-3" />
              <span className="hidden sm:inline">{isConnected ? 'Live' : 'Offline'}</span>
            </div>
            
            {/* Last Update */}
            <div className="text-right hidden md:block">
              <div className="text-xs text-muted-foreground">Atualizado</div>
              <div className="text-sm font-mono text-foreground">
                {lastUpdate.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
