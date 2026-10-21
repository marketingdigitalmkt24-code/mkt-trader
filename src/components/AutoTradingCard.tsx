import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Bot, DollarSign, Target, Calendar, AlertTriangle, Play, Square, Save, X, TrendingUp, Brain, Sparkles } from 'lucide-react';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface AutoTradingConfig {
  enabled: boolean;
  amount: number;
  mt5Amount: number;
  minConfluence: number;
  maxDailyTrades: number;
  dailyLimitEnabled: boolean;
  todayTrades: number;
  // Profit target settings
  profitTargetType: 'none' | 'percentage' | 'value';
  profitTargetValue: number;
  // AI analysis settings
  useAIAnalysis: boolean;
  aiMinConfidence: number;
  // Scaled entries strategy
  useScaledEntries: boolean;
  scaledEntriesCount: number;
  scaledEntriesDelay: number;
  // IQ dynamic stake
  useDynamicStake: boolean;
  iqMaxStakePct: number;
  iqStakeCapUsd: number;
}

interface AutoTradingCardProps {
  config: AutoTradingConfig;
  updateConfig: (updates: Partial<AutoTradingConfig>) => void;
  isPlacingTrade: boolean;
  isAnalyzingAI?: boolean;
  lastTradeResult: { success: boolean; message: string } | null;
  defaultOpen?: boolean;
  currentBalance?: number;
  dailyProfit?: number;
}

export function AutoTradingCard({ config, updateConfig, isPlacingTrade, isAnalyzingAI = false, lastTradeResult, defaultOpen = false, currentBalance = 0, dailyProfit = 0 }: AutoTradingCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [localConfig, setLocalConfig] = useState(config);
  const [hasChanges, setHasChanges] = useState(false);

  // Calculate if profit target is reached
  const isProfitTargetReached = () => {
    if (config.profitTargetType === 'none' || config.profitTargetValue <= 0) return false;
    
    if (config.profitTargetType === 'percentage') {
      // Calculate target based on percentage of initial balance
      const initialBalance = currentBalance - dailyProfit;
      if (initialBalance <= 0) return false;
      const targetProfit = (initialBalance * config.profitTargetValue) / 100;
      return dailyProfit >= targetProfit;
    } else {
      // Fixed value target
      return dailyProfit >= config.profitTargetValue;
    }
  };

  const profitTargetReached = isProfitTargetReached();

  // Sync local config when parent config changes
  useEffect(() => {
    if (!hasChanges) {
      setLocalConfig(config);
    }
  }, [config, hasChanges]);

  // Auto-disable when profit target is reached
  useEffect(() => {
    if (profitTargetReached && config.enabled) {
      updateConfig({ enabled: false });
    }
  }, [profitTargetReached, config.enabled, updateConfig]);

  const handleLocalChange = (updates: Partial<AutoTradingConfig>) => {
    setLocalConfig(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateConfig(localConfig);
    setHasChanges(false);
  };

  const handleCancel = () => {
    setLocalConfig(config);
    setHasChanges(false);
  };

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
        {config.useAIAnalysis && config.enabled && <Badge variant="outline" className="ml-1 text-xs bg-purple-500/20"><Brain className="w-3 h-3 mr-1" />IA</Badge>}
        {profitTargetReached && <Badge variant="destructive" className="ml-1 text-xs">META</Badge>}
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
            {isAnalyzingAI && (
              <Badge variant="outline" className="animate-pulse bg-purple-500/20">
                <Brain className="w-3 h-3 mr-1" />
                IA Analisando...
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
            {localConfig.enabled ? (
              <Play className="w-4 h-4 text-green-500" />
            ) : (
              <Square className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-medium">
              {localConfig.enabled ? 'Auto Trading Ativo' : 'Auto Trading Desativado'}
            </span>
          </div>
          <Switch
            checked={localConfig.enabled}
            onCheckedChange={(enabled) => handleLocalChange({ enabled })}
          />
        </div>

        {/* Amount per trade - IQ Option */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-orange-500" />
            Valor entrada IQ Option {localConfig.useDynamicStake && <Badge variant="secondary" className="text-xs">Dinâmico</Badge>}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min={1}
              max={1000}
              value={localConfig.amount}
              disabled={localConfig.useDynamicStake}
              onChange={(e) => handleLocalChange({ amount: Number(e.target.value) })}
              className="w-24"
            />
            {localConfig.useDynamicStake && currentBalance > 0 && (
              <span className="text-xs text-muted-foreground">
                ≈ ${Math.min(currentBalance * (localConfig.iqMaxStakePct / 100), localConfig.iqStakeCapUsd).toFixed(2)} por trade
              </span>
            )}
          </div>
        </div>

        {/* Dynamic Stake (IQ Option) — % of bank */}
        <div className="space-y-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="flex items-center gap-2 font-semibold">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                Stake dinâmico (% da banca IQ)
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Cresce automaticamente conforme a banca aumenta — efeito composto.
              </p>
            </div>
            <Switch
              checked={localConfig.useDynamicStake}
              onCheckedChange={(useDynamicStake) => handleLocalChange({ useDynamicStake })}
            />
          </div>
          {localConfig.useDynamicStake && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-xs">% por entrada ({localConfig.iqMaxStakePct}%)</Label>
                <Slider
                  min={1}
                  max={10}
                  step={0.5}
                  value={[localConfig.iqMaxStakePct]}
                  onValueChange={([v]) => handleLocalChange({ iqMaxStakePct: v })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teto USD por trade</Label>
                <Input
                  type="number"
                  min={5}
                  max={5000}
                  step={5}
                  value={localConfig.iqStakeCapUsd}
                  onChange={(e) => handleLocalChange({ iqStakeCapUsd: Number(e.target.value) })}
                  className="h-9"
                />
              </div>
            </div>
          )}
        </div>


        {/* Minimum Confluence - Hidden when AI is active */}
        {!(localConfig.useAIAnalysis ?? true) && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Confluência mínima: {localConfig.minConfluence}%
            </Label>
            <Slider
              value={[localConfig.minConfluence]}
              onValueChange={([value]) => handleLocalChange({ minConfluence: value })}
              min={60}
              max={100}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Só executa entradas com confluência acima de {localConfig.minConfluence}%
            </p>
          </div>
        )}

        {/* Max Daily Trades */}
        <div className="space-y-3 p-3 bg-secondary/30 rounded-lg">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span className="font-medium">Limite diário de entradas</span>
            </Label>
            <Switch
              checked={localConfig.dailyLimitEnabled ?? true}
              onCheckedChange={(dailyLimitEnabled) => handleLocalChange({ dailyLimitEnabled })}
            />
          </div>
          
          {(localConfig.dailyLimitEnabled ?? true) && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={50}
                value={localConfig.maxDailyTrades}
                onChange={(e) => handleLocalChange({ maxDailyTrades: Number(e.target.value) })}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">
                ({config.todayTrades} de {localConfig.maxDailyTrades} hoje)
              </span>
            </div>
          )}
          
          <p className="text-xs text-muted-foreground">
            {(localConfig.dailyLimitEnabled ?? true)
              ? `Máximo de ${localConfig.maxDailyTrades} operações por dia.`
              : 'Sem limite de operações diárias.'}
          </p>
        </div>

        {/* AI Analysis */}
        <div className="space-y-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-500" />
              <span className="font-medium">Análise por IA</span>
              <Badge variant="outline" className="text-xs bg-purple-500/20">
                <Sparkles className="w-3 h-3 mr-1" />
                Novo
              </Badge>
            </Label>
            <Switch
              checked={localConfig.useAIAnalysis ?? true}
              onCheckedChange={(useAIAnalysis) => handleLocalChange({ useAIAnalysis })}
            />
          </div>
          
          {(localConfig.useAIAnalysis ?? true) && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Confiança mínima da IA: {localConfig.aiMinConfidence ?? 70}%
              </Label>
              <Slider
                value={[localConfig.aiMinConfidence ?? 70]}
                onValueChange={([value]) => handleLocalChange({ aiMinConfidence: value })}
                min={50}
                max={95}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                A IA analisa padrões técnicos e histórico para prever os melhores sinais.
                <span className="text-purple-400 font-medium"> Quando ativa, substitui o filtro de confluência.</span>
              </p>
            </div>
          )}
        </div>

        {/* Profit Target */}
        <div className="space-y-3 p-3 bg-secondary/30 rounded-lg">
          <Label className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Meta de Lucro (opcional)
          </Label>
          
          <Select
            value={localConfig.profitTargetType}
            onValueChange={(value) => handleLocalChange({ profitTargetType: value as 'none' | 'percentage' | 'value' })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sem meta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem meta (funcionamento contínuo)</SelectItem>
              <SelectItem value="percentage">Porcentagem da banca (%)</SelectItem>
              <SelectItem value="value">Valor fixo ($)</SelectItem>
            </SelectContent>
          </Select>

          {localConfig.profitTargetType !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {localConfig.profitTargetType === 'percentage' ? '%' : '$'}
              </span>
              <Input
                type="number"
                min={1}
                step={localConfig.profitTargetType === 'percentage' ? 1 : 0.01}
                value={localConfig.profitTargetValue}
                onChange={(e) => handleLocalChange({ profitTargetValue: Number(e.target.value) })}
                className="w-32"
                placeholder={localConfig.profitTargetType === 'percentage' ? 'Ex: 5' : 'Ex: 50.00'}
              />
              <span className="text-xs text-muted-foreground">
                {localConfig.profitTargetType === 'percentage' 
                  ? `(${((currentBalance - dailyProfit) * localConfig.profitTargetValue / 100).toFixed(2)} USD)`
                  : 'de lucro'}
              </span>
            </div>
          )}

          {profitTargetReached && (
            <div className="p-2 bg-call/20 border border-call/30 rounded-lg">
              <p className="text-sm text-call font-medium flex items-center gap-2">
                <Target className="w-4 h-4" />
                🎉 Meta de lucro atingida! Auto Trading pausado.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {localConfig.profitTargetType === 'none' 
              ? 'Deixe sem meta para o auto trading funcionar continuamente.'
              : 'Quando o lucro diário atingir a meta, o auto trading será desligado automaticamente.'}
          </p>
        </div>

        {/* Save/Cancel Buttons */}
        {hasChanges && (
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 gap-2">
              <Save className="w-4 h-4" />
              Salvar
            </Button>
            <Button variant="outline" onClick={handleCancel} className="gap-2">
              <X className="w-4 h-4" />
              Cancelar
            </Button>
          </div>
        )}

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