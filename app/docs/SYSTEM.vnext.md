
# SYSTEM.md — T‑Up (Expo RN iOS MVP)

You are scaffolding an **iOS‑only** Expo React Native app named **“T‑Up”** using **Expo SDK 54** (RN 0.81), **TypeScript**, and **Expo Router v6**.

## SINGLE SOURCE OF TRUTH
Follow these files as canonical:
- `/docs/DESIGN_PRD_T-Up.md`
- `/design/READMEdesign.vnext.md`
- `/docs/routeMap.md`
- `/design/tokens.vnext.json`
- `/schemas/qa.intake.part1.v2.json`
- `/schemas/qa.intake.part2.v2.json`
- `/schemas/qa.weekly.json`
- `/config/paywall.config.json`
- `/config/notifications.config.json`
- `/copy/en.json`  (migrate existing `copy.json` content here)

**Engines (READ‑ONLY public APIs — do NOT change exports/logic):**
- `testosterone-estimator-v1_5.ts`
- `plan-engine-v1_3.ts`
- `potential.ts`

## DESIGN & UX HARD RULES
- **Dark‑only, iOS‑only (portrait).** Use ONLY values from `design/tokens.vnext.json`.
- **Typography:** Inter (400/500/600/700). **Icons:** Heroicons Outline (stroke ≈ 1.5). Use `expo-haptics` for success taps.
- **Spacing:** page padding 20, section gap 24. **Button:** height 52, radius 16. **Card/Modal radius:** 16–20.
- **Day strip:** centered **3 past | Today | 3 upcoming**. **Binary completion:** any required mission OFF → day = MISSED.
- **Backfill:** allowed. **>48h** old entries show “Logged late” and **do not** restore streaks.
- **Paywall:** gates the **entire app** (no tabs) until trial/payment starts. **Trial = 7 days.** Paywall cannot be closed. Quitting reopens **Sign up**.
- **Result screen:** a **single** T‑Result (score + 8‑week projection + plan entry) immediately after Onboarding Part 2.
- **Weekly check‑in (every 7 days):** **Anchor = trial start time** (first moment after paywall). **Due = +7d, opens 19:00 local** that weekday.
  - When due: **Home usable** (sticky banner “Weekly update needed”), **Plan/Learn/Profile blocked** with **Weekly.Blocker** CTA.
  - **Always show ALL weekly rows.** For rows with daily logs, show **7 per‑day chips** (numbers or filled/hollow circles) and an **overall** (avg or sum) prefilled as the answer.
  - **Do NOT edit per‑day chips in weekly.** User may change only the **aggregate** answer before submit.
  - Submit → **Weekly Result (animated)** → plan recompute → next due = **completion + 7d @ 19:00**.
- **Notifications:** schedule local **daily 20:00** and **weekly 19:00** on the due day.
- **Auth providers (UI now, real later):** Email+Password (Sign‑up uses 6‑digit verify), **Apple**, **Google**. Sign‑in = Email+Password.

## COMPONENT CONTRACTS
Use the component contracts in `/design/components.schema.vnext.json` (Button, Chip, Input, Form.CodeVerify, Modal.Log, QA.Question, QA.Screen, Weekly.Banner, Weekly.Blocker, Weekly.Row, Chart.Projection, Paywall.Card, TBar, DayStrip). Render intakes/weekly directly from the JSON schemas in `/schemas`.

## DATA (MVP FRONTEND ONLY)
Persist to AsyncStorage for now (will swap to Supabase later):
- `trial_started_at`, `weekly_due_at`, `last_checkin_completed_at`
- `logs[YYYY-MM-DD][metric]`

## TABS
- **Home** / **Plan** / **Learn** / **Profile** (hidden until trial started).

## OUTPUT FORMAT (FOR EACH USER INSTRUCTION)
1) Print the exact terminal commands in **one fenced block**.
2) Print the **file tree** you will create/update.
3) Print how to **run & verify** (assume Windows 11 host + iPhone with Expo Go installed).
Then **STOP**.

