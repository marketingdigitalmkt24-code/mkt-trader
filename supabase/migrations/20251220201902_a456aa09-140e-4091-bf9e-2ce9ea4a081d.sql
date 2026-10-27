-- Create table for trading signals
CREATE TABLE public.trading_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id TEXT NOT NULL UNIQUE,
  asset TEXT NOT NULL,
  asset_icon TEXT NOT NULL DEFAULT '📊',
  type TEXT NOT NULL CHECK (type IN ('CALL', 'PUT')),
  timeframe TEXT NOT NULL,
  expiration TEXT NOT NULL,
  strength INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'high_probability',
  price NUMERIC NOT NULL,
  is_hot BOOLEAN NOT NULL DEFAULT true,
  market_type TEXT NOT NULL,
  confluence_score INTEGER NOT NULL DEFAULT 0,
  confluence_count INTEGER NOT NULL DEFAULT 0,
  confirmations JSONB NOT NULL DEFAULT '[]',
  indicators JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trading_signals ENABLE ROW LEVEL SECURITY;

-- Allow public read access (signals are shared)
CREATE POLICY "Allow public read signals"
ON public.trading_signals
FOR SELECT
USING (true);

-- Allow public insert (for signal generation)
CREATE POLICY "Allow public insert signals"
ON public.trading_signals
FOR INSERT
WITH CHECK (true);

-- Allow public delete (for cleanup)
CREATE POLICY "Allow public delete signals"
ON public.trading_signals
FOR DELETE
USING (true);

-- Create index for faster queries
CREATE INDEX idx_trading_signals_created_at ON public.trading_signals(created_at DESC);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_signals;