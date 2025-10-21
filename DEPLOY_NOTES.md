# Deploy Notes

## Referral schema rollout (2025-10-21)

- Baseline SQL applied manually in Studio (see consolidated script in repo history).
- Remote migration history repaired to mark legacy files (`20250123180000`, `20250123`, `20250124`, `20250126`, `20250127`, `20250128`) as applied after direct SQL execution.
- Verification checklist:
  - `\dt public.creators public.referral_codes public.referral_sessions public.referrals public.referral_revenue_log public.creator_payouts`
  - `\dv public.vw_creator_summary public.vw_code_summary`
  - Confirm `profiles` has `referred_code`, `referred_creator_id`, `referred_at`.
  - REST access: anon key should receive 401 for `vw_code_summary`, service role should succeed.

## 2025-01-29

- Ran consolidated referral/KPI SQL in Supabase Studio to establish the live schema.
- Added baseline marker `supabase/migrations/20250129_remote_baseline.sql` (NOOP) so local history matches the remote state.
- Added `supabase/migrations/20250129_referral_view_grants.sql` to document the locked-down KPI view grants.
- Views `vw_code_summary` and `vw_creator_summary` now only grant `SELECT` to `service_role` and `dashboard_user`; `anon`, `authenticated`, and `public` have no privileges.
- Future `supabase db pull` runs should be clean; new migrations can build on top of this baseline.

## Historical plan (pre-cloud access)

AWS/Supabase was previously in read-only mode; original plan is retained for reference:

1. Link the CLI to the project (replace `<PROJECT_REF>` with the actual ref from your dashboard):
   ```bash
   supabase link --project-ref <PROJECT_REF>
   ```
2. Pull any remote changes to keep local schema in sync:
   ```bash
   supabase db pull
   ```
3. Apply the pending migrations (including `20250126_referrals_schema.sql`):
   ```bash
   supabase db push
   ```

## Post-deploy checks (reference)

Run these SQL commands (psql or dashboard SQL editor) to verify the new objects and policies:

```sql
\dt public.creators public.referral_codes public.referral_sessions public.referrals public.referral_revenue_log public.creator_payouts;

SELECT * FROM pg_policies
WHERE tablename IN (
  'creators',
  'referral_codes',
  'referral_sessions',
  'referrals',
  'referral_revenue_log',
  'creator_payouts'
);

SELECT * FROM public.vw_creator_summary LIMIT 5;
SELECT * FROM public.vw_code_summary LIMIT 5;
```
