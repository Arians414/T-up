# Stripe + Referral Flow Validation Guide

## Overview

This guide walks through validating the complete Stripe subscription + referral flow in the Supabase cloud project `sxgqbxgeoqsbssiwbbpi`. The goal is to verify that webhooks properly update profiles, link referrals, log revenue, and enable payout rollups.

---

## App Architecture Summary

### Core Components

1. **Referral System**
   - `creators` - Influencers/partners who refer users
   - `referral_codes` - Human-friendly codes (e.g., "DEMO20") linked to creators
   - `referral_sessions` - Pre-signup capture using install_id (first-touch attribution)
   - `referrals` - Sticky attribution at signup (first code wins)
   - `referral_revenue_log` - Net revenue tracking per invoice
   - `creator_payouts` - Monthly rollup for payouts

2. **Stripe Integration**
   - `stripe_webhook_core` - Handles subscription lifecycle (checkout.session.completed, customer.subscription.*)
   - `stripe_webhook_referrals` - Tracks referral revenue (invoice.payment_succeeded)
   - `create_checkout_session` - Creates Stripe checkout with optional promo codes

3. **Profile Fields**
   - `entitlement_status` - "none", "active", "grace", "canceled"
   - `stripe_customer_id` - Links to Stripe customer
   - `referred_code` - Denormalized code (e.g., "DEMO20")
   - `referred_creator_id` - Denormalized creator reference
   - `referred_at` - Attribution timestamp

### Flow Sequence

```
1. Anonymous user visits with referral link → capture_referral_session
   - Creates referral_sessions row with install_id + code

2. User signs up → link_referral_on_signup
   - Looks up referral_session by install_id
   - Creates referrals row (first code wins)
   - Updates profile: referred_code, referred_creator_id, referred_at
   - entitlement_status remains "none"

3. User initiates payment → create_checkout_session
   - Creates/retrieves Stripe customer
   - Creates checkout session with metadata.user_id

4. User completes checkout → stripe_webhook_core receives checkout.session.completed
   - Updates profile: entitlement_status = "active", stripe_customer_id
   - Sets current_week_number = 1, next_week_due_at

5. Stripe creates subscription → stripe_webhook_core receives customer.subscription.created
   - Updates entitlement_status based on subscription status

6. First invoice paid → stripe_webhook_referrals receives invoice.payment_succeeded
   - Looks up user by stripe_customer_id
   - If referred_creator_id exists, creates referral_revenue_log row
   - Calculates net amount (amount_paid - discounts - tax - fees)

7. Monthly rollup → admin_run_payout_rollup
   - Aggregates referral_revenue_log by creator + month
   - Creates/updates creator_payouts rows
```

---

## Current Status (Pre-Validation)

✅ **Already Created:**
- Creator: Demo Creator
- Referral Code: DEMO20
- Stripe Promo: promo_1SKkeLAwDToj50BNG7YKtYw6
- Referral Session: install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53
- Supabase User: profile with `referred_code = DEMO20`
- Checkout Session: cs_test_a1TWqMtcTbSD

❌ **Issues:**
- `entitlement_status` is still "none" (should be "active" after checkout)
- No rows in `referral_revenue_log`
- Webhooks returning 401/503 errors

**Root Cause:** Stripe webhook secret mismatch. When `stripe listen` starts, it generates a new `whsec_...` secret that must be set in Supabase environment variables and redeployed.

---

## Validation Steps

### Prerequisites

1. **Supabase CLI** installed and linked to project
2. **Stripe CLI** installed
3. **Service role key** from Supabase dashboard
4. **Stripe secret key** (test mode)

### Step 1: Synchronize Stripe Webhook Secret

**Problem:** Each time `stripe listen` starts, it prints a new webhook secret (whsec_...). The Supabase functions need this secret to verify webhook signatures.

**Solution:**

1. Start Stripe listeners in two terminals:

```bash
# Terminal 1: Core webhook listener
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_core
```

```bash
# Terminal 2: Referrals webhook listener
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_referrals
```

2. Copy the webhook secret from BOTH terminal outputs (they should be the same):
   - Look for: `whsec_...`

3. Update Supabase secrets:

```bash
# Set the webhook secret
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE --project-ref sxgqbxgeoqsbssiwbbpi

# Verify other required secrets exist
supabase secrets list --project-ref sxgqbxgeoqsbssiwbbpi
```

Expected secrets:
- `STRIPE_SECRET_KEY` = sk_test_...
- `STRIPE_WEBHOOK_SECRET` = whsec_... (just set)
- `APP_BASE_URL` = your app URL

4. Redeploy both webhook functions with `--no-verify-jwt` flag:

```bash
supabase functions deploy stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt

supabase functions deploy stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt
```

**Note:** `--no-verify-jwt` is required because Stripe webhooks don't include user JWT tokens.

---

### Step 2: Trigger Stripe Events

With both listeners running and secrets synchronized, trigger the Stripe events:

```bash
# Trigger checkout session completion
stripe trigger checkout.session.completed

# Trigger subscription creation
stripe trigger customer.subscription.created

# Trigger invoice payment
stripe trigger invoice.payment_succeeded
```

**Expected Output:**
- Each terminal should show: `200 POST /stripe_webhook_core` or `/stripe_webhook_referrals`
- If you see 401/503, the webhook secret is still mismatched

---

### Step 3: Verify Database Updates

Use the Supabase SQL Editor or REST API with service role key to check:

#### 3.1 Check Profile Updates

```sql
SELECT 
  user_id,
  entitlement_status,
  stripe_customer_id,
  referred_code,
  referred_creator_id,
  referred_at,
  current_week_number,
  next_week_due_at
FROM public.profiles
WHERE referred_code = 'DEMO20'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- `entitlement_status` = "active"
- `stripe_customer_id` = cus_... (Stripe customer ID)
- `referred_code` = "DEMO20"
- `referred_creator_id` = <creator UUID>
- `referred_at` = <timestamp>
- `current_week_number` = 1
- `next_week_due_at` = <19:00 local time + 7 days>

#### 3.2 Check Referrals Table

```sql
SELECT 
  r.id,
  r.user_id,
  r.code_id,
  r.creator_id,
  r.attributed_at,
  rc.code,
  c.name as creator_name
FROM public.referrals r
JOIN public.referral_codes rc ON r.code_id = rc.id
JOIN public.creators c ON r.creator_id = c.id
WHERE rc.code = 'DEMO20'
ORDER BY r.attributed_at DESC
LIMIT 5;
```

**Expected:**
- At least one row for the test user
- `code` = "DEMO20"
- `creator_name` = "Demo Creator"

#### 3.3 Check Revenue Log

```sql
SELECT 
  rrl.id,
  rrl.user_id,
  rrl.creator_id,
  rrl.stripe_invoice_id,
  rrl.amount_net_cents,
  rrl.period_start,
  rrl.period_end,
  rrl.created_at,
  c.name as creator_name
FROM public.referral_revenue_log rrl
JOIN public.creators c ON rrl.creator_id = c.id
ORDER BY rrl.created_at DESC
LIMIT 5;
```

**Expected:**
- At least one row for the test invoice
- `stripe_invoice_id` = in_... (from triggered event)
- `amount_net_cents` > 0 (calculated: amount_paid - discounts - tax - fees)
- `creator_name` = "Demo Creator"

#### 3.4 Using REST API (Alternative)

```bash
# Replace with your service role key
SERVICE_KEY="eyJhbGc..."

# Check profile
curl -X GET \
  "https://sxgqbxgeoqsbssiwbbpi.supabase.co/rest/v1/profiles?referred_code=eq.DEMO20&select=*" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"

# Check referrals
curl -X GET \
  "https://sxgqbxgeoqsbssiwbbpi.supabase.co/rest/v1/referrals?select=*,referral_codes(code),creators(name)" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"

# Check revenue log
curl -X GET \
  "https://sxgqbxgeoqsbssiwbbpi.supabase.co/rest/v1/referral_revenue_log?select=*,creators(name)&order=created_at.desc" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"
```

---

### Step 4: Run Payout Rollup

```bash
curl -X POST \
  https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/admin_run_payout_rollup \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"month":"2025-10"}'
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "month": "2025-10-01",
    "payouts": [
      {
        "creator_id": "<creator_uuid>",
        "month": "2025-10-01",
        "amount_cents": 4900,
        "status": "pending",
        "generated_at": "2025-10-22T..."
      }
    ]
  }
}
```

#### 4.1 Verify Payout Record

```sql
SELECT 
  cp.id,
  cp.creator_id,
  cp.month,
  cp.amount_cents,
  cp.status,
  cp.generated_at,
  c.name as creator_name,
  c.email
FROM public.creator_payouts cp
JOIN public.creators c ON cp.creator_id = c.id
WHERE cp.month = '2025-10-01'
ORDER BY cp.generated_at DESC;
```

**Expected:**
- One row for Demo Creator
- `amount_cents` = sum of all net revenue for that creator in October
- `status` = "pending"

---

### Step 5: Check Function Logs (If Issues Persist)

If webhooks still fail or database updates are missing, check function logs:

```bash
# Core webhook logs
supabase functions logs stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --last=50

# Referral webhook logs
supabase functions logs stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --last=50
```

**Common Issues:**
- `invalid_signature` - Webhook secret mismatch (return to Step 1)
- `stripe_not_configured` - Missing environment variables
- `profile_lookup_failed` - User not found or stripe_customer_id mismatch
- `upsert_failed` - Database permission or constraint issues

---

### Step 6: Clean Up Temporary Logging

If you added temporary `console.log` statements in `paywall.tsx` or other client files during debugging, remove them now:

```bash
# Search for temporary logs
rg "console\.(log|debug|warn)" app/app/paywall.tsx

# Remove any debug logging added during validation
```

---

## PASS/FAIL Checklist

### Pre-Validation Setup
- [ ] Creator exists: Demo Creator
- [ ] Referral code exists: DEMO20
- [ ] Stripe promo linked: promo_1SKkeLAwDToj50BNG7YKtYw6
- [ ] Referral session captured: install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53
- [ ] User profile created with referred_code = DEMO20

### Step 1: Webhook Secret Sync
- [ ] Stripe CLI installed
- [ ] Both listeners started (core + referrals)
- [ ] Webhook secret copied: whsec_...
- [ ] Supabase secret updated: `STRIPE_WEBHOOK_SECRET`
- [ ] Both functions redeployed with `--no-verify-jwt`

### Step 2: Stripe Event Triggers
- [ ] `stripe trigger checkout.session.completed` → HTTP 200
- [ ] `stripe trigger customer.subscription.created` → HTTP 200
- [ ] `stripe trigger invoice.payment_succeeded` → HTTP 200
- [ ] No 401/503 errors in listener outputs

### Step 3: Database Verification

#### Profiles Table
- [ ] `entitlement_status` = "active" (not "none")
- [ ] `stripe_customer_id` populated (cus_...)
- [ ] `referred_code` = "DEMO20"
- [ ] `referred_creator_id` matches Demo Creator UUID
- [ ] `referred_at` timestamp present
- [ ] `current_week_number` = 1
- [ ] `next_week_due_at` set (+7 days @ 19:00)

#### Referrals Table
- [ ] Row exists for user_id
- [ ] `code_id` matches DEMO20 code
- [ ] `creator_id` matches Demo Creator
- [ ] `attributed_at` timestamp present

#### Referral Revenue Log
- [ ] At least one row exists
- [ ] `stripe_invoice_id` matches triggered invoice
- [ ] `amount_net_cents` > 0 (properly calculated)
- [ ] `creator_id` matches Demo Creator
- [ ] `period_start` and `period_end` populated

### Step 4: Payout Rollup
- [ ] POST `/admin_run_payout_rollup` returns 200
- [ ] Response includes payouts array
- [ ] Creator payout row created in `creator_payouts`
- [ ] `amount_cents` = sum of revenue log for month
- [ ] `status` = "pending"

### Step 5: Function Logs
- [ ] No errors in `stripe_webhook_core` logs
- [ ] No errors in `stripe_webhook_referrals` logs
- [ ] All events show successful processing

### Step 6: Cleanup
- [ ] Temporary debug logs removed from client code
- [ ] Test data documented for future reference

---

## Reference Data

**Test Session Details:**

| Field | Value |
|-------|-------|
| Project | sxgqbxgeoqsbssiwbbpi |
| Creator | Demo Creator |
| Referral Code | DEMO20 |
| Stripe Promo | promo_1SKkeLAwDToj50BNG7YKtYw6 |
| Install ID | install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53 |
| Checkout Session | cs_test_a1TWqMtcTbSD |

**Supabase Functions:**
- `capture_referral_session` - Public, no auth
- `link_referral_on_signup` - User JWT required
- `create_checkout_session` - User JWT required
- `stripe_webhook_core` - No auth (Stripe signature)
- `stripe_webhook_referrals` - No auth (Stripe signature)
- `admin_run_payout_rollup` - Service role required
- `admin_sync_stripe_promo_for_code` - Service role required

**Database Tables:**
- `public.creators`
- `public.referral_codes`
- `public.referral_sessions`
- `public.referrals`
- `public.referral_revenue_log`
- `public.creator_payouts`
- `public.profiles` (extended with referral fields)

**Environment Variables:**
- `STRIPE_SECRET_KEY` - Stripe API key (sk_test_...)
- `STRIPE_WEBHOOK_SECRET` - Webhook signature secret (whsec_...)
- `APP_BASE_URL` - App base URL for redirects

---

## Troubleshooting

### Webhooks Return 401 "invalid_signature"
**Cause:** Webhook secret mismatch  
**Fix:** Copy fresh secret from `stripe listen` output, update Supabase secrets, redeploy functions

### Webhooks Return 503 "stripe_not_configured"
**Cause:** Missing environment variables  
**Fix:** Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_BASE_URL` in Supabase

### Profile Not Updated After Checkout
**Cause:** Webhook not processed or metadata.user_id missing  
**Fix:** Check function logs, ensure checkout session includes metadata: `{ user_id: "..." }`

### No Revenue Log Row Created
**Cause:** Profile missing `referred_creator_id` OR `stripe_customer_id` mismatch  
**Fix:** 
1. Verify referral linked before checkout: `SELECT * FROM referrals WHERE user_id = '...'`
2. Verify profile has `referred_creator_id`: `SELECT referred_creator_id FROM profiles WHERE user_id = '...'`
3. Check invoice.customer matches profile.stripe_customer_id

### Payout Rollup Returns Empty Array
**Cause:** No revenue log entries for specified month  
**Fix:** Check `referral_revenue_log` date range, ensure invoice events triggered and processed

---

## Success Criteria

✅ **PASS if ALL of the following are true:**

1. Webhooks return HTTP 200 for all triggered events
2. Profile shows `entitlement_status = "active"` with `stripe_customer_id`
3. Referral attribution persists in `referrals` table
4. Revenue log contains at least one row with correct net amount
5. Payout rollup creates `creator_payouts` row with correct total
6. Function logs show no errors

❌ **FAIL if ANY of the following occur:**

1. Webhooks return 401/503 after secret sync and redeploy
2. Profile `entitlement_status` remains "none" after checkout
3. No referral row exists despite session capture + signup
4. Revenue log is empty after invoice.payment_succeeded
5. Payout rollup fails or returns incorrect amounts
6. Function logs show repeated errors or crashes

---

## Post-Validation Actions

### If PASS:
1. Document test session IDs for future reference
2. Archive validation artifacts (logs, screenshots)
3. Update team on successful validation
4. Consider moving to production Stripe keys

### If FAIL:
1. Capture function logs with `--last=100`
2. Export database state for affected tables
3. Document exact error messages and HTTP status codes
4. Open issue with logs + repro steps
5. Roll back recent deployments if necessary

---

## Additional Resources

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Stripe CLI Reference](https://stripe.com/docs/cli)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli/introduction)

---

**Last Updated:** 2025-10-22  
**Validation Status:** Pending  
**Tested By:** _________  
**Date:** _________
