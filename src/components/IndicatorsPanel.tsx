import { TechnicalIndicators } from '@/types/trading';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  BarChart3, 
  Waves,
  Target,
  Gauge,
  ArrowUpDown
} from 'lucide-react';

interface IndicatorsPanelProps {
  indicators: TechnicalIndicators;
  signalType: 'CALL' | 'PUT';
}

export function IndicatorsPanel({ indicators, signalType }: IndicatorsPanelProps) {
  const isCall = signalType === 'CALL';

  const getConfluenceColor = (score: number) => {
    if (score >= 80) return 'text-call';
    if (score >= 60) return 'text-gold';
    return 'text-muted-foreground';
  };

  const getConfluenceBg = (score: number) => {
    if (score >= 80) return 'bg-call/20';
    if (score >= 60) return 'bg-gold/20';
    return 'bg-muted';
  };

  return (
    <div className="space-y-3">
      {/* Confluence Score Header */}
      <div className={cn(
        'flex items-center justify-between p-3 rounded-lg',
        getConfluenceBg(indicators.confluenceScore)
      )}>
        <div className="flex items-center gap-2">
          <Target className={cn('w-5 h-5', getConfluenceColor(indicators.confluenceScore))} />
          <span className="text-sm font-medium">Confluência</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-2xl font-bold',
            getConfluenceColor(indicators.confluenceScore)
          )}>
            {indicators.confluenceScore}%
          </span>
          <span className="text-xs text-muted-foreground">
            ({indicators.confluenceCount}/7 indicadores)
          </span>
        </div>
      </div>

      {/* Indicators Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* RSI */}
        <IndicatorBox
          icon={<Gauge className="w-4 h-4" />}
          name="RSI"
          value={indicators.rsi.value.toFixed(1)}
          status={indicators.rsi.signal}
          isPositive={
            (isCall && indicators.rsi.signal === 'oversold') ||
            (!isCall && indicators.rsi.signal === 'overbought')
          }
        />

        {/* Stochastic */}
        <IndicatorBox
          icon={<Activity className="w-4 h-4" />}
          name="Stochastic"
          value={`${indicators.stochastic.k.toFixed(0)}/${indicators.stochastic.d.toFixed(0)}`}
          status={indicators.stochastic.signal}
          isPositive={
            (isCall && indicators.stochastic.signal === 'oversold') ||
            (!isCall && indicators.stochastic.signal === 'overbought')
          }
        />

        {/* MACD */}
        <IndicatorBox
          icon={<BarChart3 className="w-4 h-4" />}
          name="MACD"
          value={indicators.macd.histogram > 0 ? '+' + indicators.macd.histogram.toFixed(4) : indicators.macd.histogram.toFixed(4)}
          status={indicators.macd.trend}
          isPositive={
            (isCall && indicators.macd.trend === 'bullish') ||
            (!isCall && indicators.macd.trend === 'bearish')
          }
        />

        {/* Bollinger Bands */}
        <IndicatorBox
          icon={<Waves className="w-4 h-4" />}
          name="Bollinger"
          value={
            indicators.bollinger.position === 'below_lower' ? 'Banda Inferior' :
            indicators.bollinger.position === 'above_upper' ? 'Banda Superior' : 'Meio'
          }
          status={indicators.bollinger.position === 'middle' ? 'neutral' : 'active'}
          isPositive={
            (isCall && indicators.bollinger.position === 'below_lower') ||
            (!isCall && indicators.bollinger.position === 'above_upper')
          }
        />

        {/* Moving Averages */}
        <IndicatorBox
          icon={indicators.movingAverages.trend === 'bullish' ? 
            <TrendingUp className="w-4 h-4" /> : 
            <TrendingDown className="w-4 h-4" />
          }
          name="EMAs"
          value={indicators.movingAverages.trend === 'bullish' ? 'Alta' : indicators.movingAverages.trend === 'bearish' ? 'Baixa' : 'Lateral'}
          status={indicators.movingAverages.trend}
          isPositive={
            (isCall && indicators.movingAverages.trend === 'bullish') ||
            (!isCall && indicators.movingAverages.trend === 'bearish')
          }
        />

        {/* ATR / Volatility */}
        <IndicatorBox
          icon={<ArrowUpDown className="w-4 h-4" />}
          name="Volatilidade"
          value={
            indicators.atr.volatility === 'high' ? 'Alta' :
            indicators.atr.volatility === 'medium' ? 'Média' : 'Baixa'
          }
          status={indicators.atr.volatility}
          isPositive={indicators.atr.volatility === 'medium'}
        />

        {/* Support/Resistance */}
        <IndicatorBox
          icon={<Target className="w-4 h-4" />}
          name="S/R"
          value={
            indicators.supportResistance.pricePosition === 'near_support' ? 'Próx. Suporte' :
            indicators.supportResistance.pricePosition === 'near_resistance' ? 'Próx. Resist.' : 'Meio'
          }
          status={indicators.supportResistance.pricePosition}
          isPositive={
            (isCall && indicators.supportResistance.pricePosition === 'near_support') ||
            (!isCall && indicators.supportResistance.pricePosition === 'near_resistance')
          }
          fullWidth
        />
      </div>
    </div>
  );
}

interface IndicatorBoxProps {
  icon: React.ReactNode;
  name: string;
  value: string;
  status: string;
  isPositive: boolean;
  fullWidth?: boolean;
}

function IndicatorBox({ icon, name, value, status, isPositive, fullWidth }: IndicatorBoxProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 p-2 rounded-lg bg-secondary/50',
      fullWidth && 'col-span-2'
    )}>
      <div className={cn(
        'p-1.5 rounded-md',
        isPositive ? 'bg-call/20 text-call' : 'bg-muted text-muted-foreground'
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{name}</div>
        <div className={cn(
          'text-sm font-medium truncate',
          isPositive ? 'text-call' : 'text-foreground'
        )}>
          {value}
        </div>
      </div>
      {isPositive && (
        <div className="w-2 h-2 rounded-full bg-call animate-pulse" />
      )}
    </div>
  );
}
