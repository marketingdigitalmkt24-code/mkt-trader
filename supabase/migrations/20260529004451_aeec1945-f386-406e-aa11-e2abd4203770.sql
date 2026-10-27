ALTER TABLE public.user_trading_settings
  ADD COLUMN IF NOT EXISTS use_dynamic_stake boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iq_max_stake_pct numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS iq_stake_cap_usd numeric NOT NULL DEFAULT 200;