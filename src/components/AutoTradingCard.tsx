import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Bot, DollarSign, Target, Calendar, AlertTriangle, Play, Square } from 'lucide-react';
import { useAutoTrading } from '@/hooks/useAutoTrading';
import { Badge } from './ui/badge';

export function AutoTradingCard() {
  const { config, updateConfig, isPlacingTrade, lastTradeResult } = useAutoTrading();
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <Button 
        variant={config.enabled ? "default" : "outline"}
        size="sm" 
        onClick={() => setIsOpen(true)}
        className={`gap-2 ${config.enabled ? 'bg-green-600 hover:bg-green-700' : ''}`}
      >
        <Bot className="w-4 h-4" />
        Auto Trading
        {config.enabled && <Badge variant="secondary" className="ml-1 text-xs">ON</Badge>}
      </Button>
    );
  }

  return (
    <Card className={`border-2 ${config.enabled ? 'border-green-500/50 bg-green-500/5' : 'border-muted'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className={`w-5 h-5 ${config.enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
            <CardTitle className="text-lg">Auto Trading</CardTitle>
            {isPlacingTrade && (
              <Badge variant="outline" className="animate-pulse">
                Executando...
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            ✕
          </Button>
        </div>
        <CardDescription>
          Execute entradas automaticamente quando sinais de alta probabilidade aparecerem
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
          <div className="flex items-center gap-2">
            {config.enabled ? (
              <Play className="w-4 h-4 text-green-500" />
            ) : (
              <Square className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-medium">
              {config.enabled ? 'Auto Trading Ativo' : 'Auto Trading Desativado'}
            </span>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => updateConfig({ enabled })}
          />
        </div>

        {/* Amount per trade */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Valor por entrada
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">R$</span>
            <Input
              type="number"
              min={1}
              max={1000}
              value={config.amount}
              onChange={(e) => updateConfig({ amount: Number(e.target.value) })}
              className="w-24"
            />
          </div>
        </div>

        {/* Minimum Confluence */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Confluência mínima: {config.minConfluence}%
          </Label>
          <Slider
            value={[config.minConfluence]}
            onValueChange={([value]) => updateConfig({ minConfluence: value })}
            min={60}
            max={100}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Só executa entradas com confluência acima de {config.minConfluence}%
          </p>
        </div>

        {/* Max Daily Trades */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Limite diário de entradas
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={50}
              value={config.maxDailyTrades}
              onChange={(e) => updateConfig({ maxDailyTrades: Number(e.target.value) })}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">
              ({config.todayTrades} de {config.maxDailyTrades} hoje)
            </span>
          </div>
        </div>

        {/* Status */}
        {lastTradeResult && (
          <div className={`p-3 rounded-lg ${lastTradeResult.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            <p className="text-sm">
              {lastTradeResult.success ? '✅' : '❌'} {lastTradeResult.message}
            </p>
          </div>
        )}

        {/* Warning */}
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              <strong>Atenção:</strong> O auto trading executará entradas reais na sua conta IQ Option. 
              Use com responsabilidade e sempre monitore os resultados.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}