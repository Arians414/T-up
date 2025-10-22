# ✅ Stripe + Referral Flow Validation - START HERE

## 🎉 Complete Validation Package Ready!

I've analyzed your entire T-Up app repository and created a comprehensive validation package for the Stripe + referral flow in Supabase project **sxgqbxgeoqsbssiwbbpi**.

---

## 📦 What Was Created

8 files totaling **66+ KB** of documentation and tools:

| File | Size | Purpose |
|------|------|---------|
| ✨ **VALIDATION_README.md** | 7.6K | **START HERE** - Quick start guide |
| 📋 **VALIDATION_CHECKLIST.md** | 4.5K | Printable tracking checklist |
| 🔍 **QUICK_REFERENCE.md** | 3.9K | One-page command cheat sheet |
| 📖 **STRIPE_REFERRAL_VALIDATION_GUIDE.md** | 16K | Complete detailed guide (600+ lines) |
| 📊 **VALIDATION_SUMMARY.md** | 11K | App architecture & package overview |
| 🗺️ **VALIDATION_INDEX.md** | 8.7K | Navigation guide for all resources |
| 🤖 **validate_stripe_flow.sh** | 6.0K | Automated validation script |
| 🗄️ **validation_queries.sql** | 9.4K | 12 comprehensive SQL queries |

**Total: 66.1 KB of documentation, automation, and validation tools**

---

## 🚀 Quick Start (30 Minutes)

### Step 1: Read the README
```bash
cat VALIDATION_README.md
```

### Step 2: Print the Checklist
```bash
cat VALIDATION_CHECKLIST.md  # or open in browser and print
```

### Step 3: Keep Quick Reference Visible
```bash
cat QUICK_REFERENCE.md  # keep this visible during validation
```

### Step 4: Run Validation
```bash
# Terminal 1: Start Stripe listener for core
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_core

# Terminal 2: Start Stripe listener for referrals
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_referrals

# Terminal 3: Sync webhook secret and deploy
# Copy the whsec_... from either terminal above, then:
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET --project-ref sxgqbxgeoqsbssiwbbpi
supabase functions deploy stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt
supabase functions deploy stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt

# Trigger events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded

# Verify database (replace with your service key)
./validate_stripe_flow.sh "eyJhbGc..."

# Run payout rollup
curl -X POST https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/admin_run_payout_rollup \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"month":"2025-10"}'
```

---

## 📚 What I Learned About Your App

### Architecture
- **React Native + Expo** iOS health/wellness app
- **Supabase** backend with Edge Functions
- **Stripe** subscription billing with referral tracking
- **Multi-table referral system** with first-touch attribution

### The Flow
```
Anonymous Visit → Referral Session Capture (install_id + code)
              ↓
         User Signup → Link Referral (creates referrals row)
              ↓
    Create Checkout → Stripe Session (with user metadata)
              ↓
  Complete Payment → Webhook: checkout.session.completed
                     (entitlement → "active", links customer_id)
              ↓
Subscription Created → Webhook: customer.subscription.created
                       (updates entitlement based on status)
              ↓
    Invoice Paid → Webhook: invoice.payment_succeeded
                   (logs revenue = amount - discounts - tax - fees)
              ↓
  Monthly Rollup → admin_run_payout_rollup
                   (aggregates by creator, creates payout records)
```

### Key Tables
- `creators` - Partners who refer users
- `referral_codes` - Codes like "DEMO20"
- `referral_sessions` - Pre-signup capture
- `referrals` - User attribution (first code wins)
- `referral_revenue_log` - Net revenue per invoice
- `creator_payouts` - Monthly rollup
- `profiles` - Extended with referral fields

### Current Issue
**Webhooks failing (401/503)** because:
- `stripe listen` generates new webhook secret each time
- Secret must be synchronized to Supabase
- Functions must be redeployed with `--no-verify-jwt`

### Solution
Follow the 5-step validation process in `VALIDATION_README.md`

---

## ✅ Success Criteria

**PASS** if all true:
- ✅ All webhooks return 200 OK
- ✅ `profiles.entitlement_status = "active"`
- ✅ `profiles.stripe_customer_id` populated
- ✅ Referral row exists in `referrals` table
- ✅ Revenue log has ≥1 row with amount > 0
- ✅ Payout rollup creates `creator_payouts` row
- ✅ No errors in function logs

**FAIL** if any:
- ❌ Webhooks return 401/503 after sync
- ❌ entitlement_status still "none"
- ❌ No revenue log entries
- ❌ Payout rollup fails

---

## 🗺️ File Navigation

| If you need to... | Open this file... |
|-------------------|-------------------|
| **Start validation** | VALIDATION_README.md |
| **Track progress** | VALIDATION_CHECKLIST.md |
| **Quick commands** | QUICK_REFERENCE.md |
| **Troubleshoot** | STRIPE_REFERRAL_VALIDATION_GUIDE.md |
| **Understand app** | VALIDATION_SUMMARY.md |
| **Find resources** | VALIDATION_INDEX.md |
| **Run automation** | ./validate_stripe_flow.sh |
| **SQL queries** | validation_queries.sql |

---

## 🎯 Test Session Data

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
- ✅ User has referred_code = DEMO20
- ❌ entitlement_status = "none" (should be "active")
- ❌ No revenue log rows
- ❌ Webhooks failing (401/503)

**Root Cause:** Webhook secret needs sync + redeploy

---

## 🔧 Required Tools

- ✅ Stripe CLI (for `stripe listen` and `stripe trigger`)
- ✅ Supabase CLI (for secrets, deployment, logs)
- ✅ Service role key from Supabase dashboard
- ✅ Stripe secret key (test mode)
- ✅ Two terminal windows

---

## 💡 Pro Tips

1. **Keep QUICK_REFERENCE.md visible** during validation
2. **Print VALIDATION_CHECKLIST.md** and check boxes as you go
3. **Run validate_stripe_flow.sh first** to see current state
4. **Check function logs immediately** if webhooks fail
5. **Document everything** in the checklist

---

## 📞 If You Get Stuck

1. Check **QUICK_REFERENCE.md** → Quick fixes section
2. Check **STRIPE_REFERRAL_VALIDATION_GUIDE.md** → Troubleshooting
3. Run function logs:
   ```bash
   supabase functions logs stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --last=50
   supabase functions logs stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --last=50
   ```
4. Review SQL state: `psql ... -f validation_queries.sql`

---

## ✨ Next Steps

1. 📖 Read `VALIDATION_README.md` (10 min)
2. 🖨️ Print `VALIDATION_CHECKLIST.md`
3. 👀 Open `QUICK_REFERENCE.md` (keep visible)
4. ▶️ Follow 5-step validation process
5. 📝 Document results in checklist
6. ✅ Report PASS/FAIL

---

## 🎉 You're Ready!

Everything you need is in this package. Start with **VALIDATION_README.md** and follow the process. Good luck! 🚀

---

**Package Created:** 2025-10-22  
**For Project:** T-Up (sxgqbxgeoqsbssiwbbpi)  
**Total Files:** 8  
**Total Size:** 66.1 KB  
**Ready for:** Validation handoff ✅
