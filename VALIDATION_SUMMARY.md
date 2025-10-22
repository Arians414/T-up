# Stripe + Referral Flow Validation - Summary

## 📦 Complete Validation Package Created

I've analyzed the entire T-Up app repository and created a comprehensive validation package to help validate the Stripe subscription and referral flow in Supabase project `sxgqbxgeoqsbssiwbbpi`.

---

## 📚 Understanding the App

### Architecture Overview

The T-Up app is an iOS health/wellness app (React Native + Expo) with:

1. **Referral System** - Multi-table attribution tracking:
   - `creators` - Partners who refer users
   - `referral_codes` - Human-friendly codes (e.g., DEMO20)
   - `referral_sessions` - Pre-signup capture via install_id
   - `referrals` - Sticky user attribution (first code wins)
   - `referral_revenue_log` - Net revenue per invoice
   - `creator_payouts` - Monthly rollup

2. **Stripe Integration** - Two webhook handlers:
   - `stripe_webhook_core` - Subscription lifecycle (entitlement management)
   - `stripe_webhook_referrals` - Revenue tracking for referrals

3. **User Flow**:
   ```
   Visit with code → Capture session → Sign up → Link referral →
   → Create checkout → Complete payment → Webhooks fire →
   → Profile updated + Revenue logged → Monthly payout
   ```

### Key Insight: The Problem

**Current Issue:** Webhooks returning 401/503 because:
- `stripe listen` generates a new webhook secret (whsec_...) each time it starts
- This secret must be synchronized to Supabase environment variables
- Functions must be redeployed with `--no-verify-jwt` flag (Stripe webhooks don't send user tokens)

---

## 🎁 Validation Resources Created

### 1. **VALIDATION_README.md** 
   - **Purpose:** Entry point with quick start guide
   - **Use:** First file to read, provides 5-step validation process
   - **Audience:** Anyone new to the validation process

### 2. **STRIPE_REFERRAL_VALIDATION_GUIDE.md**
   - **Purpose:** Complete 6000+ word validation guide
   - **Use:** Detailed reference with troubleshooting
   - **Contains:**
     - Architecture explanation
     - Step-by-step validation instructions
     - Database verification queries
     - Troubleshooting guide
     - Complete PASS/FAIL checklist
     - Common failure modes and fixes

### 3. **VALIDATION_CHECKLIST.md**
   - **Purpose:** Printable quick checklist
   - **Use:** During validation session for tracking progress
   - **Contains:**
     - Command snippets for each step
     - Checkbox items
     - Quick troubleshooting table
     - Test session data fields to fill in

### 4. **validate_stripe_flow.sh**
   - **Purpose:** Automated database validation via REST API
   - **Use:** Quick validation of database state
   - **Features:**
     - Tests all 7 critical database checks
     - Color-coded output (green/red)
     - Optional webhook testing
     - Requires only service role key

### 5. **validation_queries.sql**
   - **Purpose:** Comprehensive SQL validation queries
   - **Use:** Direct database access validation
   - **Contains:**
     - 12 detailed queries checking every table
     - Revenue vs payout comparison
     - One-line status check
     - Expected result documentation

### 6. **QUICK_REFERENCE.md**
   - **Purpose:** One-page command cheat sheet
   - **Use:** Quick lookup during validation
   - **Contains:**
     - All critical commands
     - Essential SQL checks
     - PASS criteria
     - Troubleshooting quick fixes

---

## 🚀 How to Use This Package

### For First-Time Validation:

1. **Start here:** `VALIDATION_README.md`
2. **Print this:** `VALIDATION_CHECKLIST.md`
3. **Reference:** `QUICK_REFERENCE.md` (keep visible)
4. **Run script:** `./validate_stripe_flow.sh "SERVICE_KEY"`
5. **If issues:** `STRIPE_REFERRAL_VALIDATION_GUIDE.md`

### For Quick Re-validation:

1. Run: `./validate_stripe_flow.sh "SERVICE_KEY"`
2. Check: PASS/FAIL in output
3. If FAIL: Check specific component in guide

### For Database-Only Checks:

```bash
# Option 1: Script
./validate_stripe_flow.sh "SERVICE_KEY"

# Option 2: SQL
psql "CONNECTION_STRING" -f validation_queries.sql

# Option 3: Supabase SQL Editor
# Copy/paste from validation_queries.sql
```

---

## ✅ Validation Workflow

```
┌─────────────────────────────────────────┐
│ 1. Sync Webhook Secret                  │
│    - Start stripe listeners             │
│    - Copy whsec_... secret              │
│    - Update Supabase secrets            │
│    - Redeploy both functions            │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 2. Trigger Stripe Events                │
│    - checkout.session.completed         │
│    - customer.subscription.created      │
│    - invoice.payment_succeeded          │
│    Expected: All return 200 OK          │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 3. Verify Database Updates              │
│    Run: ./validate_stripe_flow.sh       │
│    OR: validation_queries.sql           │
│    Check:                               │
│      ✓ entitlement_status = active      │
│      ✓ stripe_customer_id populated     │
│      ✓ referral linked                  │
│      ✓ revenue log entries              │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 4. Run Payout Rollup                    │
│    POST /admin_run_payout_rollup        │
│    Verify: creator_payouts row created  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│ 5. Document Results                     │
│    - Fill in VALIDATION_CHECKLIST.md    │
│    - Mark PASS or FAIL                  │
│    - Sign off                           │
└─────────────────────────────────────────┘
```

---

## 🎯 Success Criteria

**✅ PASS if ALL true:**
- Webhooks return 200 for all events
- `profiles.entitlement_status = "active"`
- `profiles.stripe_customer_id = "cus_..."`
- `referrals` row exists
- `referral_revenue_log` has ≥1 row with amount > 0
- `creator_payouts` row created for month
- No errors in function logs

**❌ FAIL if ANY:**
- Webhooks return 401/503 after sync
- entitlement_status still "none"
- No revenue log entries
- Payout rollup fails
- Function logs show errors

---

## 🔧 Test Session Data

| Field | Value |
|-------|-------|
| Project | sxgqbxgeoqsbssiwbbpi |
| Creator | Demo Creator |
| Code | DEMO20 |
| Stripe Promo | promo_1SKkeLAwDToj50BNG7YKtYw6 |
| Install ID | install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53 |
| Checkout Session | cs_test_a1TWqMtcTbSD |

**Current Status:**
- ✅ Creator, code, promo exist
- ✅ Referral session captured
- ✅ User created with referred_code = DEMO20
- ❌ entitlement_status = "none" (should be "active")
- ❌ No revenue log rows
- ❌ Webhooks failing with 401/503

**Root Cause:** Webhook secret needs synchronization + function redeployment

---

## 📊 Key Files in Repository

### Supabase Functions
- `/supabase/functions/stripe_webhook_core/index.ts` - Subscription lifecycle
- `/supabase/functions/stripe_webhook_referrals/index.ts` - Revenue tracking
- `/supabase/functions/create_checkout_session/index.ts` - Checkout creation
- `/supabase/functions/link_referral_on_signup/index.ts` - Referral attribution
- `/supabase/functions/capture_referral_session/index.ts` - Pre-signup capture
- `/supabase/functions/admin_run_payout_rollup/index.ts` - Monthly rollup

### Database Schema
- `/supabase/migrations/20250126_referrals_schema.sql` - Complete referral schema

### Documentation
- `/supabase/functions/stripe.README.md` - Stripe integration docs
- `/supabase/functions/referrals.README.md` - Referral flow docs
- `/supabase/functions/referrals_admin.README.md` - Admin endpoints
- `/DEPLOY_NOTES.md` - Deployment history
- `/NOTES.md` - Backend updates

---

## 🎓 What I Learned About the App

1. **Referral Attribution is "First Touch"**
   - `referral_sessions` captures install_id + code before signup
   - `link_referral_on_signup` creates permanent link
   - Profile gets denormalized fields for quick reads

2. **Revenue Calculation is Sophisticated**
   - Fetches charge → balance_transaction → fee
   - Net = amount_paid - discounts - tax - Stripe fees
   - Only tracks revenue for referred users

3. **Entitlement Management is Webhook-Driven**
   - `checkout.session.completed` → entitlement = "active"
   - `customer.subscription.updated` → maps status to entitlement
   - Profile gets current_week_number = 1, next_week_due_at set

4. **Payout Rollup is Monthly**
   - Aggregates by creator_id + month
   - Status starts as "pending"
   - Idempotent (upsert on conflict)

5. **Security Model**
   - Referral tables: RLS enabled, service_role only
   - Webhook functions: No JWT (Stripe signature verification)
   - Admin functions: Service role required
   - KPI views: service_role + dashboard_user only

---

## 🚨 Critical Dependencies

**Environment Variables Required:**
- `STRIPE_SECRET_KEY` - Stripe API key (sk_test_...)
- `STRIPE_WEBHOOK_SECRET` - Webhook signature secret (whsec_...)
- `APP_BASE_URL` - App base URL for redirects

**External Services:**
- Stripe (test mode)
- Supabase (cloud project sxgqbxgeoqsbssiwbbpi)

**CLI Tools:**
- Stripe CLI (for stripe listen, stripe trigger)
- Supabase CLI (for secrets, deployment, logs)

---

## 📝 Next Steps

1. **Teammate receives this package**
2. **Reads VALIDATION_README.md**
3. **Follows 5-step quick start**
4. **Runs validation script**
5. **Documents results in checklist**
6. **Reports PASS/FAIL**

If **PASS**:
- Archive validation artifacts
- Update team on success
- Consider moving to production keys

If **FAIL**:
- Capture function logs
- Export database state
- Document errors
- Open issue with repro steps

---

## 🎉 Package Complete!

**Total Files Created:** 6  
**Total Lines of Documentation:** ~2000+  
**SQL Queries:** 12 comprehensive checks  
**Bash Scripts:** 1 automated validation tool  

**Ready for handoff:** ✅

---

**Created:** 2025-10-22  
**For Project:** T-Up (sxgqbxgeoqsbssiwbbpi)  
**Purpose:** Validate Stripe + Referral Flow  
**Status:** Ready for validation
