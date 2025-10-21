
# T‑Up — Design PRD (Frontend‑only MVP)

## Brand & Aesthetic
- Dark, minimal, Apple‑clean. Background **#0A0A0B**, Accent **#FFD54D**.
- Font: **Inter** (400/500/600/700). Icons: **Heroicons Outline**.
- Spacing grid: 4/8/12/16/20/24/28/32. Page padding **20**, section gap **24**.
- Buttons: height **52**, radius **16**. Cards radius **16**. Modals radius **20**.

## Core Flow
1. Welcome → Onboarding Part 1 → Analyzing → Profile 70% → Sign up/in → Paywall.
2. Trial starts → Onboarding Part 2 → **Single T‑Result** (score + projection + plan entry) → Tabs.
3. Weekly check‑in repeats every 7 days from **trial start**, opens **19:00** local on that weekday.

## Paywall
- Trial: **7 days** (Apple requirement).
- Cannot be closed. If app quit → return to **Sign up**. Must start trial to continue.
- Shows title, bullets, price, trial badge, and legal links.

## Navigation (tabs)
- **Home** / **Plan** / **Learn** / **Profile**.
- Tabs are **hidden until trial started**.

## Weekly Check‑in (UI rules)
- Always show **ALL** weekly items.
- Items with daily logs display a **7‑day strip**:
  - **Numbers** (sleep hours, cardio minutes, sugary drinks, alcohol, fast‑food): per‑day numeric chips + an overall (avg or sum).
  - **Circles** (erection, strength, protein days, sunlight, vape/weed/cigs days): filled = yes, hollow = no.
- Items without daily logs display empty control.
- **No editing of per‑day chips** in weekly; they reflect actual logs.
- Weekly answer is **prefilled** from the 7‑day summary; user **can change** the aggregate answer.
- Submit → **Weekly Result (animated)** → Plan updates → next due = completion + 7d at 19:00.

## Gating
- **Paywall gate**: blocks entire app until trial started.
- **Weekly due gate**: Home usable (shows sticky banner). Plan/Learn/Profile blocked with a **Weekly.Blocker** + CTA.

## Notifications
- Local daily reminder: **20:00**.
- Local weekly reminder: due day **19:00**.

## Components (key)
- Button, Chip, Input.Text, Form.CodeVerify
- Modal.Log (alcohol/sleep/cardio/strength/sugary/fast food/cigs/vape/weed/erection)
- QA.Question, QA.Screen (intake pages)
- Weekly.Row, Weekly.Banner, Weekly.Blocker
- Chart.Projection, TBar, DayStrip
- Paywall.Card

## Tokens & Theming
- See `tokens.vnext.json`. Use as single source of truth for RN styles.
- Elevation/shadow for cards/sheets/toasts defined to keep depth consistent.

## Accessibility
- Minimum tap target **44px**.
- Contrast: brand yellow on background meets WCAG AA for non‑text UI.
- Support Dynamic Type increments (+1 / +2 scales) where possible.

## Analytics (stub for later)
- Events queued locally: Paywall_Shown/Trial_Started/Result_Shown, WeeklyCheckin_Shown/Completed, Log_Submitted, Plan_Updated.

## Supabase (later)
- Replace AsyncStorage with auth/session/profile/tables. Preserve keys: trial_started_at, weekly_due_at, last_checkin_completed_at, logs.
