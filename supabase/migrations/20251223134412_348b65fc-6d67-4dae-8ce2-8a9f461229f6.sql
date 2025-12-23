-- Adiciona coluna para controlar se o limite diário está habilitado
ALTER TABLE public.user_trading_settings 
ADD COLUMN IF NOT EXISTS daily_limit_enabled boolean NOT NULL DEFAULT true;