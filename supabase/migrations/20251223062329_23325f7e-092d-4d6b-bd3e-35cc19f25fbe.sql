-- Create table for user trading settings
CREATE TABLE public.user_trading_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  -- Auto trading settings
  auto_trading_enabled BOOLEAN NOT NULL DEFAULT false,
  trade_amount NUMERIC NOT NULL DEFAULT 1,
  min_confluence INTEGER NOT NULL DEFAULT 80,
  max_daily_trades INTEGER NOT NULL DEFAULT 10,
  use_ai_analysis BOOLEAN NOT NULL DEFAULT false,
  ai_min_confidence INTEGER NOT NULL DEFAULT 85,
  profit_target_type TEXT NOT NULL DEFAULT 'percentage',
  profit_target_value NUMERIC NOT NULL DEFAULT 10,
  -- Bank management settings
  risk_per_trade NUMERIC NOT NULL DEFAULT 2,
  max_consecutive_losses INTEGER NOT NULL DEFAULT 3,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Unique constraint per user
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_trading_settings ENABLE ROW LEVEL SECURITY;

-- Users can view their own settings
CREATE POLICY "Users can view their own settings"
ON public.user_trading_settings
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own settings
CREATE POLICY "Users can insert their own settings"
ON public.user_trading_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own settings
CREATE POLICY "Users can update their own settings"
ON public.user_trading_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can manage all settings
CREATE POLICY "Admins can manage all settings"
ON public.user_trading_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_user_trading_settings_updated_at
BEFORE UPDATE ON public.user_trading_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();