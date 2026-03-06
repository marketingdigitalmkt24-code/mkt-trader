import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface UserTradingSettings {
  autoTradingEnabled: boolean;
  tradeAmount: number;
  mt5TradeAmount: number;
  minConfluence: number;
  maxDailyTrades: number;
  dailyLimitEnabled: boolean;
  useAIAnalysis: boolean;
  aiMinConfidence: number;
  profitTargetType: 'none' | 'percentage' | 'value';
  profitTargetValue: number;
  riskPerTrade: number;
  maxConsecutiveLosses: number;
}

const DEFAULT_SETTINGS: UserTradingSettings = {
  autoTradingEnabled: false,
  tradeAmount: 10,
  mt5TradeAmount: 1,
  minConfluence: 95,
  maxDailyTrades: 3,
  dailyLimitEnabled: true,
  useAIAnalysis: true,
  aiMinConfidence: 90,
  profitTargetType: 'none',
  profitTargetValue: 0,
  riskPerTrade: 2,
  maxConsecutiveLosses: 3,
};

export function useUserSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserTradingSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings from database
  const loadSettings = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_trading_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading settings:', error);
        return;
      }

      if (data) {
        setSettings({
          autoTradingEnabled: data.auto_trading_enabled,
          tradeAmount: Number(data.trade_amount),
          mt5TradeAmount: Number((data as any).mt5_trade_amount ?? 1),
          minConfluence: data.min_confluence,
          maxDailyTrades: data.max_daily_trades,
          dailyLimitEnabled: data.daily_limit_enabled ?? true,
          useAIAnalysis: data.use_ai_analysis,
          aiMinConfidence: data.ai_min_confidence,
          profitTargetType: data.profit_target_type as 'none' | 'percentage' | 'value',
          profitTargetValue: Number(data.profit_target_value),
          riskPerTrade: Number(data.risk_per_trade),
          maxConsecutiveLosses: data.max_consecutive_losses,
        });
        console.log('✅ Settings loaded from database');
      } else {
        // No settings found, use defaults
        console.log('📝 No settings found, using defaults');
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Save settings to database
  const saveSettings = useCallback(async (newSettings: Partial<UserTradingSettings>) => {
    if (!user?.id) {
      console.warn('Cannot save settings: user not logged in');
      return false;
    }

    try {
      setIsSaving(true);
      
      const mergedSettings = { ...settings, ...newSettings };
      
      const dbData: Record<string, any> = {
        user_id: user.id,
        auto_trading_enabled: mergedSettings.autoTradingEnabled,
        trade_amount: mergedSettings.tradeAmount,
        mt5_trade_amount: mergedSettings.mt5TradeAmount,
        min_confluence: mergedSettings.minConfluence,
        max_daily_trades: mergedSettings.maxDailyTrades,
        daily_limit_enabled: mergedSettings.dailyLimitEnabled,
        use_ai_analysis: mergedSettings.useAIAnalysis,
        ai_min_confidence: mergedSettings.aiMinConfidence,
        profit_target_type: mergedSettings.profitTargetType,
        profit_target_value: mergedSettings.profitTargetValue,
        risk_per_trade: mergedSettings.riskPerTrade,
        max_consecutive_losses: mergedSettings.maxConsecutiveLosses,
      };

      const { error } = await supabase
        .from('user_trading_settings')
        .upsert(dbData as any, { onConflict: 'user_id' });

      if (error) {
        console.error('Error saving settings:', error);
        toast({
          title: 'Erro ao salvar',
          description: 'Não foi possível salvar as configurações.',
          variant: 'destructive',
        });
        return false;
      }

      setSettings(mergedSettings);
      console.log('✅ Settings saved to database');
      
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user?.id, settings, toast]);

  // Load settings when user changes
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    isLoading,
    isSaving,
    saveSettings,
    reloadSettings: loadSettings,
  };
}
