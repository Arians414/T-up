# 🔑 Environment Variables Setup Guide

## 📱 App Environment (`app/.env`)

Create this file with your keys from Supabase Dashboard:

```env
# ====================
# SUPABASE (Required)
# ====================
# Get from: https://supabase.com/dashboard/project/sxgqbxgeoqsbssiwbbpi/settings/api

EXPO_PUBLIC_SUPABASE_URL=https://sxgqbxgeoqsbssiwbbpi.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<YOUR_ANON_KEY_HERE>

# ====================
# STRIPE (Required for Payments)
# ====================
# Test: https://dashboard.stripe.com/test/apikeys
# Live: https://dashboard.stripe.com/apikeys

EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_<YOUR_KEY_HERE>

# ====================
# NEVER ADD THESE TO APP .ENV
# ====================
# ❌ SUPABASE_SERVICE_ROLE_KEY (backend only!)
# ❌ STRIPE_SECRET_KEY (backend only!)
# ❌ STRIPE_WEBHOOK_SECRET (backend only!)
```

---

## 🖥️ Backend Environment (Supabase Secrets)

Already configured via `.\supabase.exe secrets set`:

```bash
# View current secrets
.\supabase.exe secrets list

# Set/update a secret
.\supabase.exe secrets set SECRET_NAME=value
```

### **Required Secrets:**
```
✅ SUPABASE_URL (auto-set by Supabase)
✅ SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
✅ SUPABASE_ANON_KEY (auto-set by Supabase)
✅ STRIPE_SECRET_KEY
✅ STRIPE_PUBLISHABLE_KEY
✅ STRIPE_WEBHOOK_SECRET
✅ STRIPE_PRICE_ID
✅ APP_BASE_URL
✅ DEFAULT_CHECKOUT_RETURN_URL
✅ BILLING_PORTAL_RETURN_URL
✅ DEV_TRIAL_ENABLED
```

---

## 🔄 After Changing Secrets

**IMPORTANT**: Secrets are "baked in" at deploy time!

After changing any secret, you MUST redeploy affected functions:

```bash
# Example: After updating STRIPE_WEBHOOK_SECRET
.\supabase.exe secrets set STRIPE_WEBHOOK_SECRET=whsec_new_value

# MUST redeploy functions that use it:
.\supabase.exe functions deploy stripe_webhook_core
.\supabase.exe functions deploy stripe_webhook_referrals
```

---

## 📋 Function Dependencies

Which functions need which secrets:

### **Stripe Functions:**
- `create_checkout_session`: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, DEFAULT_CHECKOUT_RETURN_URL
- `create_billing_portal_session`: STRIPE_SECRET_KEY, BILLING_PORTAL_RETURN_URL
- `stripe_webhook_core`: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- `stripe_webhook_referrals`: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

### **Referral Functions:**
- `validate_referral_code`: None (uses anon access)
- `link_referral_on_signup`: None (uses user auth)
- `admin_*` functions: None (use service role auth)

---

## 🧪 Testing Your Setup

### **Test App Connection:**
```bash
# In app directory
npm start
# Should NOT show "Missing EXPO_PUBLIC_SUPABASE_URL" error
```

### **Test Backend Secrets:**
```bash
# List all secrets
.\supabase.exe secrets list

# Should show all required secrets (as hashed values)
```

### **Test Referral Validation:**
```bash
# Test with valid code
$body = @{code="DEMO20"} | ConvertTo-Json
Invoke-WebRequest -Uri "https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/validate_referral_code" -Method POST -Body $body -ContentType "application/json"

# Should return: {"ok":true,"valid":true,"code":"DEMO20",...}
```

---

## 🔐 Security Notes

### **Safe to Expose (Public):**
- ✅ `EXPO_PUBLIC_SUPABASE_URL`
- ✅ `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`

These are protected by:
- Supabase RLS policies (database security)
- Stripe checkout configuration

### **NEVER Expose (Server-Only):**
- ❌ `SUPABASE_SERVICE_ROLE_KEY` (full database access)
- ❌ `STRIPE_SECRET_KEY` (can charge cards, refund, etc.)
- ❌ `STRIPE_WEBHOOK_SECRET` (can fake webhook events)

---

## 📁 .gitignore

Make sure these are in your `.gitignore`:

```gitignore
# Environment files
.env
.env.local
.env.*.local

# Never commit:
*.key
*.pem
```

---

## 🆘 Troubleshooting

### **App can't connect to Supabase:**
1. Check `app/.env` exists
2. Check values are correct (no quotes, no extra spaces)
3. Restart app (stop with Ctrl+C, run `npm start` again)
4. Clear cache: `npm start -- --clear`

### **Validation not working:**
1. Verify RLS policy exists: `SELECT * FROM pg_policies WHERE tablename = 'referral_codes';`
2. Test validation endpoint directly (see test command above)
3. Check Supabase logs for errors

### **Webhooks failing:**
1. Verify `STRIPE_WEBHOOK_SECRET` is set
2. Redeploy webhook functions
3. Check webhook secret matches `stripe listen` output
4. For production: Use webhook secret from Stripe Dashboard

---

**Need Help?** Check `FIXES_SUMMARY.md` and `PRE_LAUNCH_CHECKLIST.md`

