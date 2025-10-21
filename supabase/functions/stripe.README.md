# Stripe Subscription Functions (Core flow)

This folder contains the minimal Stripe billing endpoints for T-UP. Nothing is deployed yet; run everything locally until Supabase cloud access returns.

## Environment variables

Add the following to `supabase/functions/.env` (or your deployment secret store):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_BASE_URL=https://app.example.com
```

- `STRIPE_SECRET_KEY`: used for creating customers and checkout sessions.
- `STRIPE_WEBHOOK_SECRET`: used to verify webhooks (`stripe listen` will show one).
- `APP_BASE_URL`: base redirect URL for Stripe Checkout success/cancel pages.

If any of these are missing, the functions will respond with `503 stripe_not_configured`.

## Create Prices in Stripe

In the Stripe Dashboard or CLI, create subscription prices for your plans. Note the generated price IDs (e.g., `price_12345`); these are passed to `/create_checkout_session`.

Example (monthly plan):

```bash
stripe prices create \
  --unit-amount 4900 \
  --currency usd \
  --recurring interval=month \
  --product-data name="T-UP Monthly"
```

## `/create_checkout_session`

Auth: User JWT (Bearer)

```bash
curl -X POST \
  -H "Authorization: Bearer <user_jwt>" \
  -H "Content-Type: application/json" \
  https://localhost:54321/functions/v1/create_checkout_session \
  -d '{"price_id":"price_12345"}'
```

Response:

```json
{
  "ok": true,
  "data": {
    "url": "https://checkout.stripe.com/pay/...",
    "session_id": "cs_test_..."
  }
}
```

## `/stripe_webhook_core`

This is Stripe → Supabase (no auth). Verify locally with the Stripe CLI:

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe_webhook_core
```

Events handled:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `invoice.payment_succeeded` / `invoice.payment_failed` (logged only for now)

Profiles are updated with the Stripe customer id and entitlement status (`active`, `grace`, `canceled`). During first activation the current week is set to 1 and the next week due date is scheduled at 19:00 local time +7 days.

All handlers log to `app_logs` via `logToAppLogs` for auditing.
