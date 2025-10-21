# Referral Admin Endpoints

All endpoints require the service role key.

## List creators
```bash
curl -X GET \
  http://127.0.0.1:54321/functions/v1/admin_list_creators \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## List referral codes for a creator
```bash
curl -X GET \
  "http://127.0.0.1:54321/functions/v1/admin_list_referral_codes?creator_id=<CREATOR_UUID>&active=true" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## List referrals filtered by code
```bash
curl -X GET \
  "http://127.0.0.1:54321/functions/v1/admin_list_referrals?code=JACK20" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## Run monthly payout rollup
```bash
curl -X POST \
  http://127.0.0.1:54321/functions/v1/admin_run_payout_rollup \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"month":"2025-10"}'
```

Responses are JSON `{ ok, data|error }` and are suitable for Zapier/Make exports. Limit and offset query parameters default to 100/0 (max 200).
