# Stripe + Referral Flow - Quick Validation Checklist

**Project:** `sxgqbxgeoqsbssiwbbpi`  
**Date:** _________  
**Validator:** _________

---

## ☑️ Step 1: Webhook Secret Sync

```bash
# Terminal 1
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_core

# Terminal 2
stripe listen --forward-to https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/stripe_webhook_referrals
```

- [ ] Both terminals running
- [ ] Webhook secret copied: `whsec_________________`
- [ ] Secret updated in Supabase:
  ```bash
  supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref sxgqbxgeoqsbssiwbbpi
  ```
- [ ] Functions redeployed:
  ```bash
  supabase functions deploy stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt
  supabase functions deploy stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --no-verify-jwt
  ```

---

## ☑️ Step 2: Trigger Events

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

**Check listener outputs:**
- [ ] `checkout.session.completed` → **200 OK**
- [ ] `customer.subscription.created` → **200 OK**
- [ ] `invoice.payment_succeeded` → **200 OK**

❌ If 401/503: Return to Step 1

---

## ☑️ Step 3: Verify Database

### 3.1 Profile
```sql
SELECT user_id, entitlement_status, stripe_customer_id, referred_code, referred_creator_id
FROM profiles WHERE referred_code = 'DEMO20';
```

- [ ] `entitlement_status` = **"active"** (not "none")
- [ ] `stripe_customer_id` = **cus_...**
- [ ] `referred_code` = **"DEMO20"**
- [ ] `referred_creator_id` = **<UUID>**

### 3.2 Referrals
```sql
SELECT * FROM referrals 
JOIN referral_codes ON referrals.code_id = referral_codes.id
WHERE referral_codes.code = 'DEMO20';
```

- [ ] At least **1 row** exists

### 3.3 Revenue Log
```sql
SELECT * FROM referral_revenue_log ORDER BY created_at DESC LIMIT 5;
```

- [ ] At least **1 row** exists
- [ ] `amount_net_cents` > **0**
- [ ] `stripe_invoice_id` = **in_...**

---

## ☑️ Step 4: Payout Rollup

```bash
curl -X POST \
  https://sxgqbxgeoqsbssiwbbpi.supabase.co/functions/v1/admin_run_payout_rollup \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"month":"2025-10"}'
```

- [ ] Response: `{"ok": true, "data": {...}}`
- [ ] Payout record created:
  ```sql
  SELECT * FROM creator_payouts WHERE month = '2025-10-01';
  ```
- [ ] `amount_cents` > **0**
- [ ] `status` = **"pending"**

---

## ☑️ Step 5: Function Logs (If Issues)

```bash
supabase functions logs stripe_webhook_core --project-ref sxgqbxgeoqsbssiwbbpi --last=50
supabase functions logs stripe_webhook_referrals --project-ref sxgqbxgeoqsbssiwbbpi --last=50
```

- [ ] No `invalid_signature` errors
- [ ] No `stripe_not_configured` errors
- [ ] No `upsert_failed` errors

---

## 📊 Final Result

### ✅ PASS Criteria
All of the following must be true:
- ✅ All webhooks return **200 OK**
- ✅ Profile has `entitlement_status = "active"`
- ✅ Profile has `stripe_customer_id` populated
- ✅ Referral row exists in `referrals` table
- ✅ Revenue log has at least 1 row with net amount > 0
- ✅ Payout rollup creates `creator_payouts` row
- ✅ No errors in function logs

**Result:** [ ] PASS  /  [ ] FAIL

---

## 🔧 Quick Troubleshooting

| Error | Fix |
|-------|-----|
| **401 invalid_signature** | Update webhook secret, redeploy functions |
| **503 stripe_not_configured** | Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_BASE_URL` |
| **entitlement_status = "none"** | Check `checkout.session.completed` webhook processed |
| **No revenue log** | Verify profile has `referred_creator_id` before invoice event |
| **Empty payout** | Check revenue log has entries for specified month |

---

## 📝 Test Session Data

| Field | Value |
|-------|-------|
| Creator | Demo Creator |
| Code | DEMO20 |
| Stripe Promo | promo_1SKkeLAwDToj50BNG7YKtYw6 |
| Install ID | install_a4e4b688-56e0-4f46-9aee-0074b1d9ea53 |
| Checkout Session | cs_test_a1TWqMtcTbSD |
| Creator ID | _________________ |
| User ID | _________________ |
| Invoice ID | _________________ |

---

**Notes:**

_____________________________________________________________

_____________________________________________________________

_____________________________________________________________

---

**Validation completed:** [ ] Yes  /  [ ] No  
**Approved by:** _________  
**Date:** _________
