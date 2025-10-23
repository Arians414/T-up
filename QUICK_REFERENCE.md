# Stripe + Referral Flow - Quick Reference Card

**Project:** `sxgqbxgeoqsbssiwbbpi`

---

## 🔑 Critical Commands

### Start Stripe Listeners
```bash
# Terminal 1
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_core

# Terminal 2
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_referrals
```

### Update Webhook Secret
```bash
# Copy whsec_... from stripe listen output, then:
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET --project-ref sxgqbxgeoqsbssiwbbpi
```

### Redeploy Functions
```bash
supabase functions deploy stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt
supabase functions deploy stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt
```

### Trigger Events
```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

### Run Payout Rollup
```bash
curl -X POST https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/admin_run_payout_rollup \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"month":"2025-10"}'
```

### Check Function Logs
```bash
supabase functions logs stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --last=50
supabase functions logs stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --last=50
```

---

## 🔍 Critical SQL Checks

### 1. Check Profile Entitlement
```sql
SELECT entitlement_status, stripe_customer_id, referred_code 
FROM profiles WHERE referred_code = 'DEMO20';
```
**Expected:** `entitlement_status = 'active'`, `stripe_customer_id` populated

### 2. Check Revenue Log
```sql
SELECT COUNT(*), SUM(amount_net_cents) FROM referral_revenue_log;
```
**Expected:** Count ≥ 1, Sum > 0

### 3. Check Payout
```sql
SELECT * FROM creator_payouts WHERE month = '2025-10-01';
```
**Expected:** 1 row, `status = 'pending'`

### 4. Quick Status
```sql
SELECT 
  (SELECT COUNT(*) FROM profiles WHERE referred_code = 'DEMO20' AND entitlement_status = 'active') as active_profiles,
  (SELECT COUNT(*) FROM referral_revenue_log) as revenue_entries,
  (SELECT COUNT(*) FROM creator_payouts WHERE month = '2025-10-01') as payouts;
```
**Expected:** All > 0

---

## ✅ PASS Criteria

- [ ] Webhook listeners show **200 OK** for all events
- [ ] `profiles.entitlement_status = 'active'`
- [ ] `profiles.stripe_customer_id` populated
- [ ] `referrals` table has row for user
- [ ] `referral_revenue_log` has ≥1 row
- [ ] `creator_payouts` has row for month
- [ ] No errors in function logs

---

## 🚨 If Webhooks Return 401

**Problem:** Webhook secret mismatch

**Fix (in order):**
1. Copy fresh `whsec_...` from `stripe listen` output
2. Set secret: `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
3. Redeploy BOTH functions with `--no-verify-jwt`
4. Trigger events again

---

## 📊 Expected Values

| Field | Expected Value |
|-------|----------------|
| Code | DEMO20 |
| Creator | Demo Creator |
| Install ID | install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53 |
| Entitlement | active |
| Revenue > | 0 cents |
| Payout Status | pending |

---

## 🛠️ Automated Validation

```bash
./validate_stripe_flow.sh "YOUR_SERVICE_ROLE_KEY"
```

Or run SQL:
```bash
psql "CONNECTION_STRING" -f validation_queries.sql
```

---

## 📞 Function Endpoints

| Function | Auth | Purpose |
|----------|------|---------|
| capture_referral_session | None | Capture install_id + code |
| link_referral_on_signup | User JWT | Link referral at signup |
| create_checkout_session | User JWT | Create Stripe checkout |
| stripe_webhook_core | Stripe sig | Handle subscription events |
| stripe_webhook_referrals | Stripe sig | Track invoice revenue |
| admin_run_payout_rollup | Service role | Generate payouts |

---

**Print this card for quick reference during validation!**
