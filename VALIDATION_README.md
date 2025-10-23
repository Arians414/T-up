# Stripe + Referral Flow Validation - Quick Start

This folder contains all resources needed to validate the complete Stripe subscription and referral flow for the T-Up app.

## 📁 Validation Resources

| File | Purpose | Use When |
|------|---------|----------|
| **STRIPE_REFERRAL_VALIDATION_GUIDE.md** | Complete validation guide with detailed explanations | First-time validation or troubleshooting |
| **VALIDATION_CHECKLIST.md** | Quick printable checklist | During validation session |
| **validate_stripe_flow.sh** | Automated database checks | Quick validation via REST API |
| **validation_queries.sql** | SQL queries for database verification | Direct database access available |

---

## 🚀 Quick Start (5 Steps)

### 1. Sync Webhook Secret

Start two terminals with Stripe listeners:

```bash
# Terminal 1
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_core

# Terminal 2
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_referrals
```

Copy the webhook secret (whsec_...) and update Supabase:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET --project-ref sxgqbxgeoqsbssiwbbpi
supabase functions deploy stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt
supabase functions deploy stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt
```

### 2. Trigger Events

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

**Check:** All should return `200 OK` in listener terminals.

### 3. Verify Database

**Option A: Use validation script (fastest)**
```bash
chmod +x validate_stripe_flow.sh
./validate_stripe_flow.sh "YOUR_SERVICE_ROLE_KEY"
```

**Option B: Run SQL queries**
```bash
psql "postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres" -f validation_queries.sql
```

**Option C: SQL Editor in Supabase Dashboard**
- Copy queries from `validation_queries.sql`
- Paste into SQL Editor
- Run and review results

### 4. Run Payout Rollup

```bash
curl -X POST \
  https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/admin_run_payout_rollup \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"month":"2025-10"}'
```

### 5. Confirm Results

**✅ PASS if:**
- All webhooks return 200
- `profiles.entitlement_status` = "active"
- `profiles.stripe_customer_id` populated
- `referrals` row exists
- `referral_revenue_log` has entries
- `creator_payouts` row created

**❌ FAIL if:**
- Webhooks return 401/503
- `entitlement_status` still "none"
- Missing revenue log entries
- No payout row

---

## 🎯 Test Session Details

| Field | Value |
|-------|-------|
| **Project** | sxgqbxgeoqsbssiwbbpi |
| **Creator** | Demo Creator |
| **Code** | DEMO20 |
| **Stripe Promo** | promo_1SKkeLAwDToj50BNG7YKtYw6 |
| **Install ID** | install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53 |
| **Checkout Session** | cs_test_a1TWqMtcTbSD |

---

## 🔍 Key Database Tables

- `public.creators` - Influencers/partners
- `public.referral_codes` - Codes like "DEMO20"
- `public.referral_sessions` - Pre-signup capture (install_id)
- `public.referrals` - Signup attribution (user_id → code)
- `public.referral_revenue_log` - Invoice revenue tracking
- `public.creator_payouts` - Monthly rollup
- `public.profiles` - User entitlements + referral denormalization

---

## 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| **401 invalid_signature** | Webhook secret mismatch → resync and redeploy |
| **503 stripe_not_configured** | Missing env vars → set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, APP_BASE_URL |
| **entitlement_status = "none"** | Webhook not processed → check function logs |
| **No revenue log** | Profile missing `referred_creator_id` → verify referral linked before payment |
| **Empty payout** | No revenue for month → check revenue log date range |

Check function logs:
```bash
supabase functions logs stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --last=50
supabase functions logs stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --last=50
```

---

## 📊 Flow Overview

```
Anonymous Visit → Referral Session Capture
                  (install_id + code stored)
                           ↓
User Signup → Link Referral
              (creates referrals row, updates profile)
              entitlement_status = "none"
                           ↓
Create Checkout → Stripe Checkout Session
                  (metadata.user_id attached)
                           ↓
Complete Checkout → Webhook: checkout.session.completed
                    entitlement_status = "active"
                    stripe_customer_id = cus_...
                           ↓
Subscription Created → Webhook: customer.subscription.created
                       (updates entitlement based on status)
                           ↓
Invoice Paid → Webhook: invoice.payment_succeeded
               (creates referral_revenue_log row)
               amount_net_cents = amount - discounts - tax - fees
                           ↓
Monthly Rollup → admin_run_payout_rollup
                 (aggregates revenue, creates creator_payouts)
```

---

## 🎓 Learning Resources

- **Stripe Webhooks:** https://stripe.com/docs/webhooks
- **Stripe CLI:** https://stripe.com/docs/cli
- **Supabase Functions:** https://supabase.com/docs/guides/functions
- **Supabase Edge Functions Deployment:** https://supabase.com/docs/guides/functions/deploy

---

## ✅ Validation Workflow

1. **Print** `VALIDATION_CHECKLIST.md` for manual tracking
2. **Run** `validate_stripe_flow.sh` for automated checks
3. **Review** results against checklist
4. **If issues:** Consult `STRIPE_REFERRAL_VALIDATION_GUIDE.md`
5. **Document** findings in checklist
6. **Sign off** when all tests pass

---

## 📝 Expected Outcomes

### Successful Validation Shows:

**Database State:**
```
profiles.entitlement_status: "active"
profiles.stripe_customer_id: "cus_..."
profiles.referred_code: "DEMO20"
profiles.referred_creator_id: <uuid>

referrals: 1+ rows
referral_revenue_log: 1+ rows with amount_net_cents > 0
creator_payouts: 1 row for October 2025
```

**Webhook Responses:**
```
checkout.session.completed → 200 OK
customer.subscription.created → 200 OK
invoice.payment_succeeded → 200 OK
```

**Payout Response:**
```json
{
  "ok": true,
  "data": {
    "month": "2025-10-01",
    "payouts": [{
      "creator_id": "...",
      "amount_cents": 4900,
      "status": "pending"
    }]
  }
}
```

---

## 🚨 Common Failure Modes

1. **Webhook Secret Stale**
   - Symptom: 401 errors on webhook calls
   - Fix: Copy fresh secret from `stripe listen`, update Supabase, redeploy

2. **Functions Not Redeployed**
   - Symptom: Old secret still in use, 401 errors persist
   - Fix: Explicitly redeploy both functions after secret update

3. **Referral Not Linked Before Payment**
   - Symptom: Payment succeeds but no revenue log entry
   - Fix: Ensure `link_referral_on_signup` called before checkout

4. **Wrong Month in Rollup**
   - Symptom: Payout rollup returns empty array
   - Fix: Use correct month where revenue entries exist

---

## 📞 Support

If validation fails after following all steps:

1. Capture function logs (`--last=100`)
2. Export database state (SQL dump of referral tables)
3. Document exact error messages and HTTP status codes
4. Review `STRIPE_REFERRAL_VALIDATION_GUIDE.md` troubleshooting section
5. Open issue with logs + reproduction steps

---

**Last Updated:** 2025-10-22  
**Project:** sxgqbxgeoqsbssiwbbpi  
**Validation Status:** Pending
