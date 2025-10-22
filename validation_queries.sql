-- ============================================
-- Stripe + Referral Flow Validation Queries
-- Project: sxgqbxgeoqsbssiwbbpi
-- ============================================
-- Run these queries in Supabase SQL Editor or psql
-- All queries should return results if the flow is working correctly

\echo '\n=== 1. CREATOR CHECK ==='
\echo 'Verify Demo Creator exists'
SELECT 
  id,
  name,
  email,
  created_at
FROM public.creators
WHERE name = 'Demo Creator';

\echo '\n=== 2. REFERRAL CODE CHECK ==='
\echo 'Verify DEMO20 code exists and is active'
SELECT 
  rc.id,
  rc.code,
  rc.creator_id,
  rc.discount_percent,
  rc.active,
  rc.stripe_promo_code_id,
  c.name as creator_name,
  rc.created_at
FROM public.referral_codes rc
JOIN public.creators c ON rc.creator_id = c.id
WHERE rc.code = 'DEMO20';

\echo '\n=== 3. REFERRAL SESSION CHECK ==='
\echo 'Verify referral session captured for test install_id'
SELECT 
  rs.id,
  rs.install_id,
  rs.code_id,
  rs.creator_id,
  rc.code,
  c.name as creator_name,
  rs.captured_at
FROM public.referral_sessions rs
JOIN public.referral_codes rc ON rs.code_id = rc.id
JOIN public.creators c ON rs.creator_id = c.id
WHERE rs.install_id = 'install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53';

\echo '\n=== 4. PROFILE CHECK ==='
\echo 'Verify user profile with referred_code = DEMO20'
\echo 'CRITICAL: entitlement_status should be "active", not "none"'
SELECT 
  user_id,
  entitlement_status,
  stripe_customer_id,
  referred_code,
  referred_creator_id,
  referred_at,
  current_week_number,
  next_week_due_at,
  created_at
FROM public.profiles
WHERE referred_code = 'DEMO20'
ORDER BY created_at DESC
LIMIT 5;

\echo '\n=== 5. REFERRAL ATTRIBUTION CHECK ==='
\echo 'Verify referral link created for DEMO20 users'
SELECT 
  r.id,
  r.user_id,
  r.code_id,
  r.creator_id,
  r.attributed_at,
  rc.code,
  c.name as creator_name,
  p.entitlement_status,
  p.stripe_customer_id
FROM public.referrals r
JOIN public.referral_codes rc ON r.code_id = rc.id
JOIN public.creators c ON r.creator_id = c.id
LEFT JOIN public.profiles p ON r.user_id = p.user_id
WHERE rc.code = 'DEMO20'
ORDER BY r.attributed_at DESC
LIMIT 5;

\echo '\n=== 6. REVENUE LOG CHECK ==='
\echo 'Verify referral revenue tracked from invoice.payment_succeeded'
\echo 'CRITICAL: Should have at least 1 row after triggering invoice event'
SELECT 
  rrl.id,
  rrl.user_id,
  rrl.creator_id,
  rrl.stripe_invoice_id,
  rrl.amount_net_cents,
  ROUND(rrl.amount_net_cents / 100.0, 2) as amount_dollars,
  rrl.period_start,
  rrl.period_end,
  rrl.created_at,
  c.name as creator_name,
  c.email as creator_email,
  p.referred_code
FROM public.referral_revenue_log rrl
JOIN public.creators c ON rrl.creator_id = c.id
LEFT JOIN public.profiles p ON rrl.user_id = p.user_id
ORDER BY rrl.created_at DESC
LIMIT 10;

\echo '\n=== 7. REVENUE SUMMARY BY CREATOR ==='
\echo 'Aggregate revenue by creator'
SELECT 
  c.id as creator_id,
  c.name as creator_name,
  c.email,
  COUNT(DISTINCT rrl.user_id) as referred_users_with_revenue,
  COUNT(rrl.id) as total_invoices,
  SUM(rrl.amount_net_cents) as total_net_cents,
  ROUND(SUM(rrl.amount_net_cents) / 100.0, 2) as total_net_dollars
FROM public.creators c
LEFT JOIN public.referral_revenue_log rrl ON c.id = rrl.creator_id
GROUP BY c.id, c.name, c.email
ORDER BY total_net_cents DESC NULLS LAST;

\echo '\n=== 8. CREATOR PAYOUTS CHECK ==='
\echo 'Verify monthly payout rollup'
SELECT 
  cp.id,
  cp.creator_id,
  cp.month,
  cp.amount_cents,
  ROUND(cp.amount_cents / 100.0, 2) as amount_dollars,
  cp.status,
  cp.generated_at,
  c.name as creator_name,
  c.email as creator_email
FROM public.creator_payouts cp
JOIN public.creators c ON cp.creator_id = c.id
ORDER BY cp.month DESC, cp.generated_at DESC
LIMIT 10;

\echo '\n=== 9. PAYOUT VERIFICATION ==='
\echo 'Compare revenue log totals to payout amounts for October 2025'
WITH revenue_totals AS (
  SELECT 
    creator_id,
    SUM(amount_net_cents) as total_revenue_cents
  FROM public.referral_revenue_log
  WHERE period_start >= '2025-10-01'::date
    AND period_end < '2025-11-01'::date
  GROUP BY creator_id
),
payout_totals AS (
  SELECT 
    creator_id,
    amount_cents as payout_cents
  FROM public.creator_payouts
  WHERE month = '2025-10-01'
)
SELECT 
  c.name as creator_name,
  COALESCE(rt.total_revenue_cents, 0) as revenue_log_cents,
  COALESCE(pt.payout_cents, 0) as payout_cents,
  CASE 
    WHEN COALESCE(rt.total_revenue_cents, 0) = COALESCE(pt.payout_cents, 0) 
    THEN '✓ MATCH'
    ELSE '✗ MISMATCH'
  END as validation_status
FROM public.creators c
LEFT JOIN revenue_totals rt ON c.id = rt.creator_id
LEFT JOIN payout_totals pt ON c.id = pt.creator_id
WHERE rt.total_revenue_cents IS NOT NULL OR pt.payout_cents IS NOT NULL;

\echo '\n=== 10. KPI VIEWS CHECK ==='
\echo 'Test creator summary view (should only work with service_role)'
SELECT 
  creator_id,
  name,
  email,
  referred_users,
  revenue_net_cents,
  ROUND(revenue_net_cents / 100.0, 2) as revenue_net_dollars
FROM public.vw_creator_summary
ORDER BY revenue_net_cents DESC;

\echo '\n=== 11. CODE SUMMARY VIEW ==='
\echo 'Test code summary view'
SELECT 
  code_id,
  code,
  creator_id,
  active,
  discount_percent,
  attributed_users
FROM public.vw_code_summary
ORDER BY attributed_users DESC;

\echo '\n=== 12. FULL FLOW VERIFICATION ==='
\echo 'End-to-end check: Session → Signup → Checkout → Revenue → Payout'
SELECT 
  rs.install_id,
  rc.code,
  r.user_id,
  r.attributed_at,
  p.entitlement_status,
  p.stripe_customer_id,
  COUNT(DISTINCT rrl.id) as revenue_entries,
  SUM(rrl.amount_net_cents) as total_revenue_cents,
  ROUND(SUM(rrl.amount_net_cents) / 100.0, 2) as total_revenue_dollars,
  MAX(cp.amount_cents) as payout_cents
FROM public.referral_sessions rs
JOIN public.referral_codes rc ON rs.code_id = rc.id
LEFT JOIN public.referrals r ON r.user_id IN (
  SELECT user_id FROM public.profiles WHERE referred_code = rc.code
)
LEFT JOIN public.profiles p ON r.user_id = p.user_id
LEFT JOIN public.referral_revenue_log rrl ON rrl.user_id = r.user_id
LEFT JOIN public.creator_payouts cp ON cp.creator_id = rc.creator_id 
  AND cp.month = DATE_TRUNC('month', rrl.period_start)::date
WHERE rs.install_id = 'install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53'
GROUP BY rs.install_id, rc.code, r.user_id, r.attributed_at, p.entitlement_status, p.stripe_customer_id;

\echo '\n=== VALIDATION SUMMARY ==='
\echo ''
\echo 'Expected Results:'
\echo '  1. Creator exists: Demo Creator'
\echo '  2. Code exists: DEMO20 (active = true)'
\echo '  3. Session captured: install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53'
\echo '  4. Profile: entitlement_status = "active" (NOT "none")'
\echo '  5. Profile: stripe_customer_id populated (cus_...)'
\echo '  6. Profile: referred_code = "DEMO20"'
\echo '  7. Referral: Row exists linking user to DEMO20'
\echo '  8. Revenue log: At least 1 row with amount_net_cents > 0'
\echo '  9. Payout: Row exists for October 2025'
\echo ' 10. Payout: amount_cents matches revenue log total'
\echo ''
\echo 'If any query returns 0 rows or incorrect values:'
\echo '  → Check webhook processing (401/503 errors?)'
\echo '  → Review function logs: supabase functions logs stripe_webhook_core --last=50'
\echo '  → Verify STRIPE_WEBHOOK_SECRET is synchronized'
\echo ''

-- ============================================
-- Quick Status Check (One Query)
-- ============================================
\echo '\n=== QUICK STATUS CHECK ==='
WITH status AS (
  SELECT 
    (SELECT COUNT(*) FROM public.creators WHERE name = 'Demo Creator') as creator_exists,
    (SELECT COUNT(*) FROM public.referral_codes WHERE code = 'DEMO20' AND active = true) as code_exists,
    (SELECT COUNT(*) FROM public.referral_sessions WHERE install_id = 'install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53') as session_exists,
    (SELECT COUNT(*) FROM public.profiles WHERE referred_code = 'DEMO20' AND entitlement_status = 'active') as active_profiles,
    (SELECT COUNT(*) FROM public.profiles WHERE referred_code = 'DEMO20' AND stripe_customer_id IS NOT NULL) as profiles_with_stripe,
    (SELECT COUNT(*) FROM public.referrals WHERE code_id IN (SELECT id FROM public.referral_codes WHERE code = 'DEMO20')) as referral_links,
    (SELECT COUNT(*) FROM public.referral_revenue_log) as revenue_entries,
    (SELECT COALESCE(SUM(amount_net_cents), 0) FROM public.referral_revenue_log) as total_revenue_cents,
    (SELECT COUNT(*) FROM public.creator_payouts WHERE month = '2025-10-01') as payout_entries
)
SELECT 
  CASE WHEN creator_exists > 0 THEN '✓' ELSE '✗' END as creator,
  CASE WHEN code_exists > 0 THEN '✓' ELSE '✗' END as code,
  CASE WHEN session_exists > 0 THEN '✓' ELSE '✗' END as session,
  CASE WHEN active_profiles > 0 THEN '✓' ELSE '✗' END as active_entitlement,
  CASE WHEN profiles_with_stripe > 0 THEN '✓' ELSE '✗' END as stripe_linked,
  CASE WHEN referral_links > 0 THEN '✓' ELSE '✗' END as referral_linked,
  CASE WHEN revenue_entries > 0 THEN '✓' ELSE '✗' END as revenue_logged,
  CASE WHEN payout_entries > 0 THEN '✓' ELSE '✗' END as payout_created,
  ROUND(total_revenue_cents / 100.0, 2) as total_revenue_dollars,
  CASE 
    WHEN creator_exists > 0 
      AND code_exists > 0 
      AND session_exists > 0 
      AND active_profiles > 0 
      AND profiles_with_stripe > 0 
      AND referral_links > 0 
      AND revenue_entries > 0 
      AND payout_entries > 0 
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as overall_status
FROM status;

\echo ''
\echo 'All checkmarks (✓) = PASS'
\echo 'Any X marks (✗) = FAIL - investigate that component'
\echo ''
