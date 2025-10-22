# 🎯 Referral System Implementation

## ✅ What Was Built Today

### **1. Referral Code UI (Intake Part 1)**
- ✅ Added referral code input as the **last question** in intake
- ✅ Shows: "Enter referral code (optional)" with subtitle "You can skip this step"
- ✅ User can type any code (uppercase, max 20 characters)
- ✅ **Smart validation**: Waits 2 seconds after typing stops, then checks if code is valid
- ✅ **Visual feedback**:
  - 🟡 Gold spinner while checking
  - ✅ Gold checkmark if valid (#FFD54D)
  - ❌ Red X if invalid (#FF6767)
- ✅ User can proceed even if code is invalid (it's optional!)
- ✅ Button changes to "FINISH" on this last question
- ✅ Progress bar now reaches **100%** (was 90%)

### **2. Backend Validation**
Created `validate_referral_code` function that:
- ✅ Takes a code (e.g., "DEMO20")
- ✅ Checks `referral_codes` table
- ✅ Returns `{ valid: true/false, code_id, creator_id }`
- ✅ Can be called without authentication (uses anon key)

**Endpoint**: `https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/validate_referral_code`

### **3. Referral Linking After Signup**
Updated `link_referral_on_signup` function to:
- ✅ Check `referral_sessions` table (URL-based referrals)
- ✅ **NEW**: Also check `anonymous_intake_p1_submissions` for manually entered codes
- ✅ Look up code in `referral_codes` table
- ✅ Create record in `referrals` table (user → code → creator)
- ✅ Update profile with:
  - `referred_code` (e.g., "DEMO20")
  - `referred_creator_id` (UUID of creator)
  - `referred_at` (timestamp)

### **4. Fixed Sign-Up Navigation**
- ✅ Back button now goes to **last intake question** (referral code)
- ✅ Prevents "analyzing → sign-up → analyzing" loop

### **5. Dynamic Progress Bar**
- ✅ Progress is now based on actual question count
- ✅ Reaches 100% on the last question
- ✅ Adapts if you add/remove questions

---

## 🔄 Complete Referral Flow

### **Scenario A: User Enters Code Manually**
1. User goes through intake questions
2. Last question: "Enter referral code (optional)"
3. User types "DEMO20" → waits 2 seconds → ✅ shows gold checkmark
4. Taps "FINISH" → code saved to `anonymous_intake_p1_submissions.payload.referral_code`
5. Goes to analyzing → profile ready → sign-up
6. Signs up with email
7. **Backend automatically**:
   - Calls `link_anonymous_p1_to_user` (links intake data)
   - Calls `link_referral_on_signup` (finds "DEMO20" in intake, links to profile)
   - Updates `profiles` table with `referred_code`, `referred_creator_id`, `referred_at`

### **Scenario B: User Opens App With URL** (Future)
1. User clicks link: `myapp://?ref=DEMO20`
2. App calls `capture_referral_session` → creates `referral_sessions` record
3. User goes through intake (can skip referral code question)
4. Signs up
5. **Backend automatically**:
   - Finds `referral_sessions` record
   - Links to profile

---

## 📊 Database Tables Used

### **`referral_codes`** (admin-created)
- `id`, `code`, `creator_id`, `discount_percent`, `active`, `stripe_promo_code_id`
- Example: `{ code: "DEMO20", creator_id: "uuid...", discount_percent: 20, active: true }`

### **`referral_sessions`** (URL-based captures)
- `id`, `install_id`, `code_id`, `creator_id`, `captured_at`
- Created when user opens app with `?ref=CODE` parameter

### **`referrals`** (final attribution)
- `id`, `user_id`, `code_id`, `creator_id`, `attributed_at`
- **One per user** (first code wins)

### **`profiles`** (denormalized hints)
- `referred_code`, `referred_creator_id`, `referred_at`
- Quick lookup without joining tables

### **`referral_revenue_log`** (Stripe webhook)
- Tracks revenue from referred users
- Created when `invoice.payment_succeeded` webhook fires

---

## 🧪 Testing the Referral System

### **Step 1: Create a Test Referral Code**

```bash
curl -X POST https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/admin_create_creator \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Creator","email":"demo@example.com"}'

# Response: { "ok": true, "data": { "id": "creator-uuid", ... } }

curl -X POST https://sxgqbxgeoqsbssiwbbpi.functions.supabase.co/admin_create_referral_code \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"creator_id":"creator-uuid","code":"DEMO20","discount_percent":20}'

# Response: { "ok": true, "data": { "code": "DEMO20", ... } }
```

### **Step 2: Test in App**
1. Open app → Start onboarding
2. Answer all intake questions
3. Last question: Type "DEMO20"
4. Wait 2 seconds → should show ✅ gold checkmark
5. Tap "FINISH"
6. Sign up with email
7. **Check database**:
   ```sql
   SELECT user_id, referred_code, referred_creator_id, referred_at
   FROM profiles
   WHERE referred_code = 'DEMO20';
   ```

### **Step 3: Verify Revenue Tracking** (Later with real checkout)
1. User with referral code subscribes
2. Stripe sends `invoice.payment_succeeded` webhook
3. Check `referral_revenue_log`:
   ```sql
   SELECT * FROM referral_revenue_log 
   WHERE creator_id = 'creator-uuid'
   ORDER BY created_at DESC;
   ```

---

## 🔧 Environment Variables Needed

### **App (`app/.env`)**
```env
EXPO_PUBLIC_SUPABASE_URL=https://sxgqbxgeoqsbssiwbbpi.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_ for production)
```

### **Backend (Supabase Secrets)**
Already set via:
```bash
.\supabase.exe secrets list
```

---

## 🐛 Known Issues & Next Steps

### **Need to Fix:**
- [ ] Stripe webhooks still returning 401 (separate issue - will rebuild from scratch)
- [ ] Need to integrate Stripe Checkout in paywall (coming next)
- [ ] Need to pass referral code to Stripe Checkout for discount

### **Future Enhancements:**
- [ ] URL-based referral capture (`myapp://?ref=CODE`)
- [ ] Show referral stats to creators
- [ ] Payout dashboard for creators
- [ ] Multiple referral codes per creator
- [ ] Referral link sharing in-app

---

## 📝 Files Modified Today

### **Created:**
- `supabase/functions/_shared/http.ts` - Standardized HTTP helpers
- `supabase/functions/validate_referral_code/index.ts` - Code validation
- `PRE_LAUNCH_CHECKLIST.md` - Production readiness guide
- `REFERRAL_IMPLEMENTATION.md` - This file

### **Modified:**
- `app/schemas/qa.intake.part1.v2.json` - Added referral_code question
- `app/app/onboarding/q/[step].tsx` - Added text input type, validation, progress fix
- `app/app/auth/sign-up/index.tsx` - Fixed back button navigation
- `app/app/auth/sign-up/verify.tsx` - Added referral linking call
- `supabase/functions/link_referral_on_signup/index.ts` - Now checks intake for codes
- `supabase/functions/stripe_webhook_core/index.ts` - Standardized imports
- `supabase/functions/stripe_webhook_referrals/index.ts` - Fixed parameter order
- `app/app/paywall.tsx` - Documented access token logging

### **Deployed:**
- `validate_referral_code`
- `link_referral_on_signup`
- `stripe_webhook_core`
- `stripe_webhook_referrals`

---

**Last Updated**: October 22, 2025  
**Status**: ✅ Referral UI Complete, Ready for Testing

