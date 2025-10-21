-- HOW TO APPLY (Studio):
-- 1) Open Supabase Studio → SQL Editor
-- 2) Paste entire file and Run
-- 3) Verify:
--    \dt public.creators public.referral_codes public.referral_sessions public.referrals public.referral_revenue_log public.creator_payouts
--    \dv public.vw_creator_summary public.vw_code_summary
--    SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='profiles'
--        AND column_name IN ('referred_code','referred_creator_id','referred_at');

BEGIN;

-- Referral backend schema (creators, codes, attribution, revenue logs, payouts)
-- NOTE: All statements are idempotent for safe re-runs.

-- Creators (influencers / partners)
CREATE TABLE IF NOT EXISTS public.creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  /* optional future payout fields (iban, bank_name, tax_id) */
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Referral codes (human friendly, multiple per creator)
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, -- e.g. "JACK20"
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE RESTRICT,
  discount_percent int NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
  active boolean NOT NULL DEFAULT true,
  stripe_promo_code_id text, -- filled later when syncing with Stripe
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pre-signup capture (device/install first-touch)
CREATE TABLE IF NOT EXISTS public.referral_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id text NOT NULL UNIQUE, -- anonymous install identifier
  code_id uuid NOT NULL REFERENCES public.referral_codes(id) ON DELETE RESTRICT,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE RESTRICT,
  captured_at timestamptz NOT NULL DEFAULT now()
);

-- Sticky attribution at signup (first code wins)
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  code_id uuid NOT NULL REFERENCES public.referral_codes(id) ON DELETE RESTRICT,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE RESTRICT,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Denormalized hints on profile for quick reads
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS referred_code text;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS referred_creator_id uuid REFERENCES public.creators(id);

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS referred_at timestamptz;

-- Net revenue log (Stripe invoices -> commissions)
CREATE TABLE IF NOT EXISTS public.referral_revenue_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE RESTRICT,
  stripe_invoice_id text NOT NULL,
  amount_net_cents int NOT NULL CHECK (amount_net_cents >= 0), -- after fees/discounts
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_invoice_id)
);

-- Monthly payouts rollup (one row per creator per month)
CREATE TABLE IF NOT EXISTS public.creator_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  month date NOT NULL, -- e.g., 2025-11-01 (first day of month)
  amount_cents int NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL CHECK (status IN ('pending','approved','paid')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, month)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_referrals_creator_id ON public.referrals(creator_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code_id ON public.referrals(code_id);
CREATE INDEX IF NOT EXISTS idx_codes_creator_id ON public.referral_codes(creator_id);
CREATE INDEX IF NOT EXISTS idx_revenue_log_creator ON public.referral_revenue_log(creator_id);
CREATE INDEX IF NOT EXISTS idx_revenue_log_user ON public.referral_revenue_log(user_id);
CREATE INDEX IF NOT EXISTS idx_creator_payouts_status ON public.creator_payouts(status);

-- RLS: lock tables to service_role only (everything admin controlled via edge functions later)
ALTER TABLE IF EXISTS public.creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referral_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referral_revenue_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.creator_payouts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'creators' AND policyname = 'creators_service') THEN
    CREATE POLICY creators_service ON public.creators FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referral_codes' AND policyname = 'referral_codes_service') THEN
    CREATE POLICY referral_codes_service ON public.referral_codes FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referral_sessions' AND policyname = 'referral_sessions_service') THEN
    CREATE POLICY referral_sessions_service ON public.referral_sessions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'referrals_service') THEN
    CREATE POLICY referrals_service ON public.referrals FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referral_revenue_log' AND policyname = 'referral_rev_service') THEN
    CREATE POLICY referral_rev_service ON public.referral_revenue_log FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'creator_payouts' AND policyname = 'creator_payouts_service') THEN
    CREATE POLICY creator_payouts_service ON public.creator_payouts FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
  END IF;
END
$$;

CREATE OR REPLACE VIEW public.vw_creator_summary AS
SELECT
  c.id AS creator_id,
  c.name,
  c.email,
  COALESCE(COUNT(DISTINCT r.user_id), 0) AS referred_users,
  COALESCE(SUM(rr.amount_net_cents), 0) AS revenue_net_cents,
  c.created_at,
  COALESCE(COUNT(DISTINCT CASE WHEN rr.period_start >= (now() - interval '30 days') THEN rr.user_id END), 0) AS last_30d_users,
  COALESCE(SUM(CASE WHEN rr.period_start >= (now() - interval '30 days') THEN rr.amount_net_cents ELSE 0 END), 0) AS last_30d_revenue_net_cents
FROM public.creators c
LEFT JOIN public.referrals r ON r.creator_id = c.id
LEFT JOIN public.referral_revenue_log rr ON rr.creator_id = c.id
GROUP BY c.id, c.name, c.email, c.created_at;

CREATE OR REPLACE VIEW public.vw_code_summary AS
SELECT
  rc.id AS code_id,
  rc.code,
  rc.creator_id,
  rc.active,
  rc.discount_percent,
  COALESCE(COUNT(DISTINCT r.user_id), 0) AS attributed_users,
  rc.stripe_promo_code_id,
  rc.created_at,
  COALESCE(COUNT(DISTINCT CASE WHEN rr.period_start >= (now() - interval '30 days') THEN rr.user_id END), 0) AS last_30d_users
FROM public.referral_codes rc
LEFT JOIN public.referrals r ON r.code_id = rc.id
LEFT JOIN public.referral_revenue_log rr ON rr.user_id = r.user_id
GROUP BY rc.id, rc.code, rc.creator_id, rc.active, rc.discount_percent, rc.stripe_promo_code_id, rc.created_at;

COMMIT;
