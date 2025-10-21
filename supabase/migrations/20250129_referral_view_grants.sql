-- Hardening for referral KPI views (idempotent)
REVOKE ALL ON TABLE public.vw_code_summary    FROM anon, authenticated, public
REVOKE ALL ON TABLE public.vw_creator_summary FROM anon, authenticated, public
GRANT SELECT ON TABLE public.vw_code_summary    TO service_role, dashboard_user
GRANT SELECT ON TABLE public.vw_creator_summary TO service_role, dashboard_user
ALTER VIEW public.vw_code_summary    SET (security_barrier = true)
ALTER VIEW public.vw_creator_summary SET (security_barrier = true)
