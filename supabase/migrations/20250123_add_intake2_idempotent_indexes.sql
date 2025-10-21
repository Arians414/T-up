-- Note: CONCURRENTLY is avoided due to CLI pipeline mode
CREATE UNIQUE INDEX IF NOT EXISTS ux_intake_p2_one_per_user
  ON public.intake_p2_submissions(user_id)
-- 2) Only one baseline estimate per user (source='intake_p2')
CREATE UNIQUE INDEX IF NOT EXISTS ux_estimate_one_baseline_per_user
  ON public.estimate_history(user_id)
  WHERE source = 'intake_p2'