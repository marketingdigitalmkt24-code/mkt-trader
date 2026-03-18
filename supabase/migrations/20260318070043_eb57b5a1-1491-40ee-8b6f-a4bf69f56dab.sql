
CREATE TABLE public.price_candles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_candles_symbol_time ON public.price_candles (symbol, created_at DESC);
