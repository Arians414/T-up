# Referral + Stripe Integration

## Sync a promotion code

```bash
curl -X POST \
  http://127.0.0.1:54321/functions/v1/admin_sync_stripe_promo_for_code \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"code":"JACK20"}'
```

Response:
```json
{ "ok": true, "data": { "code": "JACK20", "stripe_promo_code_id": "promo_..." } }
```

## Testing the referral webhook locally

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe_webhook_referrals
stripe trigger invoice.payment_succeeded
```

The webhook records referred revenue into `public.referral_revenue_log`, setting:
- `user_id`, `creator_id`
- `stripe_invoice_id`
- `amount_net_cents` (amount paid minus discounts, tax, fees when available)
- `period_start`, `period_end`

Check the table with:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT * FROM public.referral_revenue_log ORDER BY created_at DESC LIMIT 5;"
```
