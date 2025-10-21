# Backend & Navigation Updates

- **Profile preference persistence**
  - `link_anonymous_p1_to_user` now stores measurement unit choices immediately after linking the anonymous intake (reused installs pull the latest linked payload to avoid empty prefs).
  - `complete_intake2` normalises smoking answers and backfills measurement prefs whenever the user completes Intake 2.
  - `get_entitlement` performs a lightweight backfill on every fetch, pulling the latest intake payloads when profile prefs are still empty.

- **Weekly advancement guarantees**
  - The `/estimate` Edge Function increments `profiles.current_week_number` exactly once per new weekly check-in and reuses the previous value when requests are replayed.
  - Both reuse and fresh paths return a `profile` summary with the updated `current_week_number` and `next_week_due_at` so clients can refresh immediately.

- **Routing decision order**
  - Guard sequence: refresh session → fetch entitlement (service truth) → read profile + baseline (`estimate_history`) → choose destination (`/onboarding`, `/paywall`, `/onboarding2/q/0`, or `/(tabs)/home`) based on auth + baseline state.
  - Decisions are deduped per-user by caching the last `(userId, destination)` pair, so sign-out re-runs the guard and lands on Welcome.

- **Entitlement fetch throttling**
  - `AppState` keeps a single in-flight `refreshEntitlement` promise; concurrent callers reuse it until the request settles.
  - Paywall no longer triggers an extra `/get_entitlement` fetch — we rely on the throttled refresh after `/dev_start_trial`, eliminating the triple call burst.
