import { Activity, Wifi, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  isConnected: boolean;
  lastUpdate: Date | null;
  isLoading: boolean;
  isSearching?: boolean;
}

export function Header({ isConnected, lastUpdate, isLoading, isSearching }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 glass-card border-b border-border/50 mb-4 sm:mb-6">
      <div className="container px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-call to-gold flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 sm:w-6 sm:h-6 text-background" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-foreground truncate">
                Binary Analyzer
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Análise Técnica Avançada
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Searching Status */}
            {isSearching && (
              <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-gold/20 text-gold rounded-lg text-xs font-medium animate-pulse">
                <Search className="w-3 h-3" />
                <span className="hidden xs:inline sm:inline">Buscando...</span>
              </div>
            )}

            {/* Connection Status */}
            <div
              className={cn(
                'flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-medium',
                isConnected
                  ? 'bg-call/20 text-call'
                  : 'bg-put/20 text-put'
              )}
            >
              <Wifi className="w-3 h-3" />
              <span className="hidden xs:inline sm:inline">{isConnected ? 'Live' : 'Offline'}</span>
            </div>
            
            {/* Last Update */}
            {lastUpdate && (
              <div className="text-right hidden md:block">
                <div className="text-xs text-muted-foreground">Último sinal</div>
                <div className="text-sm font-mono text-foreground">
                  {lastUpdate.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
