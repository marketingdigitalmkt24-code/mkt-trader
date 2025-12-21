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
            {/* Searching Status */}
            {isSearching && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gold/20 text-gold rounded-lg text-xs font-medium animate-pulse">
                <Search className="w-3 h-3" />
                <span className="hidden sm:inline">Buscando sinais...</span>
              </div>
            )}

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
