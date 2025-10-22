# Stripe Webhook Setup Guide

## ✅ What We Just Fixed

1. **Created standardized HTTP helper** (`supabase/functions/_shared/http.ts`)
   - Fixed the parameter order confusion: `jsonResponse(status, body)`
   - All webhook functions now use the same helper

2. **Updated both webhook functions**:
   - `stripe_webhook_core` - handles subscription lifecycle
   - `stripe_webhook_referrals` - tracks referral revenue

3. **Deployed both functions** to Supabase

4. **Set environment secrets**:
   - `STRIPE_WEBHOOK_SECRET` = `whsec_eb7672c4ebaf1f7f27e009b42a717a4b7a6ad7aff32f3fa7faa3b13ae3f23b04`
   - `STRIPE_PRICE_ID` = `price_1SL6ctAwDToj50BNyzrfGGN3` (€10/month)

---

## 🔍 About Those Multiple Products

**Don't worry!** When you run `stripe trigger` or `stripe listen`, Stripe automatically creates test/dummy products, prices, and other objects. This is **normal behavior** for testing.

Your **real** product that customers will use:
- **Product ID**: `prod_THfy8AaVyz6wCJ`
- **Price ID**: `price_1SL6ctAwDToj50BNyzrfGGN3`
- **Amount**: €10/month with 7-day trial

The test products you see being created are just for Stripe's internal test events and won't affect your real product.

---

## 📊 Current Webhook Endpoints

### Testing (with stripe listen):
Both webhooks currently use the **same** secret from `stripe listen`:
```
whsec_eb7672c4ebaf1f7f27e009b42a717a4b7a6ad7aff32f3fa7faa3b13ae3f23b04
```

**Core webhook**: Handles subscriptions
```
https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/stripe_webhook_core
```

**Referrals webhook**: Tracks referral revenue  
```
https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/stripe_webhook_referrals
```

### Production Setup (later):
When you're ready to go live, you'll create two webhook endpoints in your Stripe Dashboard, and each will have its own `whsec_` secret. Since Supabase functions share environment variables, you'll configure them to listen to different event types in the Stripe Dashboard.

---

## 🧪 Testing the Webhooks

### Check if webhooks are working:

Look at your terminal windows running `stripe listen`. After the trigger, you should now see:

✅ **Success (200 response)**:
```
<-- [200] POST https://...stripe_webhook_core [evt_...]
```

❌ **Still getting 401?** 
- The secret might not have propagated yet. Wait 30 seconds and try again.
- Make sure both `stripe listen` terminals are still running

### Test individual events:

```bash
# Test subscription lifecycle
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated

# Test referral revenue tracking
stripe trigger invoice.payment_succeeded
```

---

## 🎯 Next Steps

1. **Verify webhooks are returning 200** (not 401)
2. **Check your Supabase Dashboard** → App Logs for webhook events
3. **Test a real checkout flow** (we'll set this up next)
4. **Add referral code UI** to your app

---

## 🐛 Troubleshooting

### Still getting 401 errors?
1. Make sure `stripe listen` is running in both terminals
2. Wait 30-60 seconds for secrets to propagate
3. Try stopping and restarting both `stripe listen` processes

### Getting 503 errors?
- Check that all Stripe secrets are set: `.\supabase.exe secrets list`
- Verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set

### Need to update secrets?
```bash
.\supabase.exe secrets set STRIPE_WEBHOOK_SECRET=whsec_your_new_secret
.\supabase.exe secrets set STRIPE_PRICE_ID=price_your_price_id
```

---

## 📝 All Configured Secrets

Run this to see all secrets:
```bash
.\supabase.exe secrets list
```

Required for Stripe webhooks:
- ✅ `STRIPE_SECRET_KEY`
- ✅ `STRIPE_WEBHOOK_SECRET`
- ✅ `STRIPE_PRICE_ID`
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `APP_BASE_URL`

