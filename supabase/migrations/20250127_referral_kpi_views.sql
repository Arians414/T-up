DROP VIEW IF EXISTS public.vw_creator_summary;
DROP VIEW IF EXISTS public.vw_code_summary;
-- Referral KPI views refresh
CREATE OR REPLACE VIEW public.vw_creator_summary AS
SELECT
  c.id AS creator_id,
  c.name,
  c.email,
  c.created_at,
  COALESCE(COUNT(DISTINCT r.user_id), 0) AS referred_users,
  COALESCE(SUM(rr.amount_net_cents), 0) AS revenue_net_cents,
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
  rc.stripe_promo_code_id,
  rc.created_at,
  COALESCE(COUNT(DISTINCT r.user_id), 0) AS attributed_users,
  COALESCE(COUNT(DISTINCT CASE WHEN rr.period_start >= (now() - interval '30 days') THEN rr.user_id END), 0) AS last_30d_users
FROM public.referral_codes rc
LEFT JOIN public.referrals r ON r.code_id = rc.id
LEFT JOIN public.referral_revenue_log rr ON rr.user_id = r.user_id
GROUP BY rc.id, rc.code, rc.creator_id, rc.active, rc.discount_percent, rc.stripe_promo_code_id, rc.created_at;
