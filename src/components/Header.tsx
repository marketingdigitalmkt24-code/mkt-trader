import { Activity, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  isConnected: boolean;
}

export function Header({ isConnected }: HeaderProps) {
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
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
                isConnected
                  ? 'bg-call/20 text-call'
                  : 'bg-put/20 text-put'
              )}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span className="hidden sm:inline">Conectado</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </div>
            
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Atualizado</div>
              <div className="text-sm font-mono text-foreground">
                {new Date().toLocaleTimeString('pt-BR', {
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
