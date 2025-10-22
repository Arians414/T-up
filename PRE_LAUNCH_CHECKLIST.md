# 🚀 Pre-Launch Checklist

## ⚠️ CRITICAL - Do These Before Launch

### 🔑 **1. Switch to Production Keys**

#### **Stripe Keys** (`supabase/functions/.env`)
```env
# REPLACE test keys with live keys
STRIPE_SECRET_KEY=sk_live_...  # Change from sk_test_
STRIPE_PUBLISHABLE_KEY=pk_live_...  # Change from pk_test_
```

#### **App Stripe Key** (`app/.env`)
```env
# REPLACE test key with live key
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...  # Change from pk_test_
```

#### **Stripe Dashboard Webhooks**
- Go to: https://dashboard.stripe.com/webhooks
- Create TWO webhook endpoints:
  - `https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/stripe_webhook_core`
    - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`
  - `https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/stripe_webhook_referrals`
    - Events: `invoice.payment_succeeded`
- Copy EACH webhook's secret and set them:
  ```bash
  # You'll need TWO different secrets for production webhooks
  supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_PRODUCTION_SECRET
  ```
  - ⚠️ **Note**: For production, you may need separate secrets per webhook OR configure them to use the same secret

---

### 🐛 **2. Remove Development/Debug Code**

#### **Remove Access Token Logging** (`app/app/paywall.tsx` lines 42-58)
Delete this entire block:
```typescript
useEffect(() => {
  if (!__DEV__) {
    return;
  }
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.log("[paywall] failed to read session", error.message);
      return;
    }
    if (data.session?.access_token) {
      console.log("[paywall] ACCESS TOKEN", data.session.access_token);
    } else {
      console.log("[paywall] session is null");
    }
  });
}, []);
```

#### **Search for Debug Logs**
Search entire codebase for:
- `console.log("[fn]"` - function call logs
- `console.log("[paywall]"` - paywall logs
- `console.log("[DEBUG]"` - any debug logs
- `__DEV__` checks that might expose sensitive info

**Keep these** (they're useful):
- `console.error` - error logging
- `console.warn` - warnings
- Edge function logs (server-side)

---

### 🔒 **3. Security Review**

#### **Environment Variables**
- [ ] Verify NO `SERVICE_ROLE_KEY` in `app/.env`
- [ ] Verify NO `STRIPE_SECRET_KEY` in `app/.env`
- [ ] Verify `.env` files are in `.gitignore`

#### **Supabase RLS Policies**
- [ ] Test all database tables have proper RLS policies
- [ ] Verify users can only access their own data
- [ ] Test referral tables are service_role only

#### **API Keys Exposed?**
- [ ] Search codebase for hardcoded API keys
- [ ] Search for `sk_test_`, `sk_live_`, `whsec_`
- [ ] Verify no secrets in git history

---

### 📱 **4. App Configuration**

#### **Update App Metadata** (`app/app.json`)
- [ ] Update `version` number
- [ ] Update `expo.version` for app store
- [ ] Update `expo.ios.buildNumber`
- [ ] Update `expo.android.versionCode`
- [ ] Set proper `expo.scheme` for deep linking

#### **URLs & Redirects**
- [ ] Update `APP_BASE_URL` to production URL
- [ ] Update `DEFAULT_CHECKOUT_RETURN_URL` to production
- [ ] Update `BILLING_PORTAL_RETURN_URL` to production
- [ ] Configure proper OAuth redirect URLs in Supabase dashboard

---

### 💰 **5. Stripe Product & Pricing**

#### **Verify Production Product**
- [ ] Create production product in Stripe (or verify existing)
- [ ] Set correct pricing (€10/month, 7-day trial)
- [ ] Update `STRIPE_PRICE_ID` in `supabase/functions/.env`
- [ ] Test checkout flow in production mode

#### **Referral Promo Codes**
- [ ] Create referral codes in Stripe Dashboard
- [ ] Sync them to database using `admin_sync_stripe_promo_for_code`
- [ ] Test referral code applies discount

---

### 📧 **6. Email Configuration**

#### **Supabase Auth Emails**
- [ ] Customize email templates in Supabase Dashboard
- [ ] Update "From" email address
- [ ] Test email verification
- [ ] Test password reset
- [ ] Update email links to production URLs

---

### 🧪 **7. Final Testing**

#### **Complete User Flow**
- [ ] Onboarding → Intake questions → Referral code
- [ ] Sign up → Email verification
- [ ] Paywall → Stripe checkout → Payment success
- [ ] Verify webhook updates `entitlement_status` to "active"
- [ ] Verify referral revenue tracking works
- [ ] Test subscription cancellation
- [ ] Test subscription renewal

#### **Edge Cases**
- [ ] Test with invalid referral code
- [ ] Test payment failure scenarios
- [ ] Test expired trials
- [ ] Test network errors

---

### 📊 **8. Monitoring & Analytics**

- [ ] Set up error tracking (Sentry, LogRocket, etc.)
- [ ] Set up analytics (PostHog, Mixpanel, etc.)
- [ ] Monitor Supabase logs regularly
- [ ] Set up Stripe webhook monitoring
- [ ] Set up alerts for failed payments

---

### 🎯 **9. Performance**

- [ ] Remove unnecessary `console.log` statements
- [ ] Minimize bundle size
- [ ] Test on low-end devices
- [ ] Test with slow network
- [ ] Optimize images

---

### ⚖️ **10. Legal & Compliance**

- [ ] Privacy Policy live and linked
- [ ] Terms of Service live and linked
- [ ] Cookie policy (if using web)
- [ ] GDPR compliance (if EU users)
- [ ] Refund policy clear
- [ ] Subscription terms clear

---

## 📝 **Quick Command Reference**

### **Switch to Production Environment**
```bash
# Update Supabase secrets
cd c:\Users\arian\Desktop\T-up
.\supabase.exe secrets set STRIPE_SECRET_KEY=sk_live_...
.\supabase.exe secrets set STRIPE_PUBLISHABLE_KEY=pk_live_...
.\supabase.exe secrets set STRIPE_WEBHOOK_SECRET=whsec_...
.\supabase.exe secrets set STRIPE_PRICE_ID=price_...

# Redeploy all functions with new secrets
.\supabase.exe functions deploy stripe_webhook_core
.\supabase.exe functions deploy stripe_webhook_referrals
.\supabase.exe functions deploy create_checkout_session
```

### **Verify Secrets**
```bash
.\supabase.exe secrets list
```

---

## ✅ **Final Pre-Launch Checklist**

Print this and check off each item:

- [ ] All test keys replaced with live keys
- [ ] Debug logs removed or disabled
- [ ] Webhook endpoints created in Stripe Dashboard
- [ ] RLS policies tested and verified
- [ ] Complete user flow tested end-to-end
- [ ] Email templates customized
- [ ] Error tracking set up
- [ ] Privacy policy & terms linked
- [ ] App store metadata ready
- [ ] Beta testing completed
- [ ] Backup plan for rollback ready

---

## 🆘 **Emergency Rollback**

If something goes wrong after launch:

1. **Disable new signups temporarily**
   ```sql
   -- In Supabase SQL Editor
   UPDATE auth.config SET allow_signups = false;
   ```

2. **Revert to test mode**
   ```bash
   .\supabase.exe secrets set STRIPE_SECRET_KEY=sk_test_...
   .\supabase.exe functions deploy stripe_webhook_core
   ```

3. **Check logs**
   - Supabase Dashboard → Logs
   - Stripe Dashboard → Webhooks → Events
   - Check `app_logs` table in database

---

**Last Updated**: {DATE}  
**Project**: T-Up Testosterone App  
**Environment**: Production Ready Checklist

