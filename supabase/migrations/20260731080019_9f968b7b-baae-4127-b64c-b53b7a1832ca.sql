ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS method_fee_wire_pct numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS method_fee_card_pct numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS method_fee_crypto_pct numeric NOT NULL DEFAULT 0;