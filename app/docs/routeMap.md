# T-Up Route Map (Expo Router, iOS MVP)

## Onboarding (pre-trial)
- /onboarding                       # Welcome
- /onboarding/q/[step]              # Intake Part 1 questions
- /onboarding/analyzing             # Analyzing data (auto advance)
- /onboarding/profile-ready         # Profile 70% ready screen
- /auth/sign-up                     # Email + password create account
- /auth/sign-in                     # Email + password sign in
- /paywall                          # 7 day trial, no close

## Onboarding (post-trial)
- /onboarding2/q/[step]             # Intake Part 2 questions
- /onboarding2/result               # T Result + projection summary

## Tabs (unlocked after trial + onboarding)
- /(tabs)/home
- /(tabs)/plan
- /(tabs)/learn
- /(tabs)/profile

## Weekly check-in
- /weekly-checkin                   # shows ALL rows with 7 day chips + answer field
- /weekly-result                    # animated result

## Guards
- If trial not started -> block tabs and onboarding2, redirect to /paywall
- If intake part1 incomplete -> route to /onboarding flow
- If intake part2 incomplete after trial -> route to /onboarding2/q/[next]
- Weekly due: if due, allow home but block plan/learn/profile with blocker
- Anchor: weekly_due = trial_started_at + 7d; completion pushes +7d at 19:00 local
