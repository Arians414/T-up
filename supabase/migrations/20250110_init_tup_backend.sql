-- T-Up initial backend schema migration
-- Generated 2025-10-16T04:20:25

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Shared trigger function to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
-- profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  entitlement_status TEXT NOT NULL DEFAULT 'none' CHECK (entitlement_status IN ('none','trial','active','past_due','canceled')),
  ever_started_trial BOOLEAN NOT NULL DEFAULT FALSE,
  ever_subscribed BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_customer_id TEXT UNIQUE,
  active_subscription_id TEXT,
  intake_p1_completed_at TIMESTAMPTZ,
  intake_p2_completed_at TIMESTAMPTZ,
  current_week_number SMALLINT,
  next_week_due_at TIMESTAMPTZ,
  last_result JSONB,
  smoking_prefs JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profiles_entitlement_status_idx ON public.profiles(entitlement_status);
CREATE INDEX IF NOT EXISTS profiles_next_week_due_at_idx ON public.profiles(next_week_due_at);
CREATE INDEX IF NOT EXISTS profiles_ever_started_trial_idx ON public.profiles(ever_started_trial) WHERE ever_started_trial = TRUE;
-- anonymous_intake_p1_submissions table
CREATE TABLE IF NOT EXISTS public.anonymous_intake_p1_submissions (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id UUID NOT NULL,
  payload JSONB NOT NULL,
  schema_version TEXT NOT NULL,
  linked_user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ,
  intake_locked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 months'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS anonymous_intake_p1_submissions_install_id_desc_idx ON public.anonymous_intake_p1_submissions(install_id DESC);
CREATE INDEX IF NOT EXISTS anonymous_intake_p1_submissions_linked_user_idx ON public.anonymous_intake_p1_submissions(linked_user_id);
CREATE INDEX IF NOT EXISTS anonymous_intake_p1_submissions_expires_at_idx ON public.anonymous_intake_p1_submissions(expires_at);
-- intake_p2_submissions table
CREATE TABLE IF NOT EXISTS public.intake_p2_submissions (
  submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  schema_version TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS intake_p2_submissions_user_submitted_at_idx ON public.intake_p2_submissions(user_id, submitted_at DESC);
-- weekly_checkins table
CREATE TABLE IF NOT EXISTS public.weekly_checkins (
  checkin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  week_number SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 8),
  due_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  CONSTRAINT weekly_checkins_user_week_unique UNIQUE (user_id, week_number)
);
CREATE INDEX IF NOT EXISTS weekly_checkins_user_week_idx ON public.weekly_checkins(user_id, week_number) INCLUDE (submitted_at);
-- estimate_history table
CREATE TABLE IF NOT EXISTS public.estimate_history (
  estimate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('intake_p2','weekly_checkin','recalc')),
  related_checkin_id UUID REFERENCES public.weekly_checkins(checkin_id) ON DELETE SET NULL,
  week_number SMALLINT,
  model_version TEXT NOT NULL,
  score NUMERIC NOT NULL,
  potential NUMERIC,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB
);
CREATE INDEX IF NOT EXISTS estimate_history_user_generated_at_idx ON public.estimate_history(user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS estimate_history_user_source_idx ON public.estimate_history(user_id, source);
-- learn_categories table
CREATE TABLE IF NOT EXISTS public.learn_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  display_order INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS learn_categories_display_order_idx ON public.learn_categories(display_order);
-- learn_articles table
CREATE TABLE IF NOT EXISTS public.learn_articles (
  article_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.learn_categories(category_id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_time TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS learn_articles_category_idx ON public.learn_articles(category_id);
CREATE INDEX IF NOT EXISTS learn_articles_active_idx ON public.learn_articles(is_active) WHERE is_active = TRUE;
-- user_article_reads table
CREATE TABLE IF NOT EXISTS public.user_article_reads (
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.learn_articles(article_id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);
CREATE INDEX IF NOT EXISTS user_article_reads_user_read_at_idx ON public.user_article_reads(user_id, read_at DESC);
-- app_logs table
CREATE TABLE IF NOT EXISTS public.app_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  install_id UUID,
  event TEXT NOT NULL,
  source TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error')),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_logs_event_idx ON public.app_logs(event);
CREATE INDEX IF NOT EXISTS app_logs_created_at_idx ON public.app_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_severity_error_idx ON public.app_logs(severity) WHERE severity = 'error';
-- stripe_webhook_events table
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
-- Triggers for updated_at maintenance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_profiles_trg'
  ) THEN
    CREATE TRIGGER set_updated_at_profiles_trg
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_anonymous_intake_p1_submissions_trg'
  ) THEN
    CREATE TRIGGER set_updated_at_anonymous_intake_p1_submissions_trg
    BEFORE UPDATE ON public.anonymous_intake_p1_submissions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_learn_categories_trg'
  ) THEN
    CREATE TRIGGER set_updated_at_learn_categories_trg
    BEFORE UPDATE ON public.learn_categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_learn_articles_trg'
  ) THEN
    CREATE TRIGGER set_updated_at_learn_articles_trg
    BEFORE UPDATE ON public.learn_articles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;
-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_intake_p1_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_p2_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learn_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learn_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_article_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- RLS Policies
-- profiles policies
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles

  FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles

  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles

  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS profiles_select_service_role ON public.profiles;
CREATE POLICY profiles_select_service_role ON public.profiles

  FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS profiles_insert_service_role ON public.profiles;
CREATE POLICY profiles_insert_service_role ON public.profiles

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS profiles_update_service_role ON public.profiles;
CREATE POLICY profiles_update_service_role ON public.profiles

  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS profiles_delete_service_role ON public.profiles;
CREATE POLICY profiles_delete_service_role ON public.profiles

  FOR DELETE
  USING (auth.role() = 'service_role');
-- anonymous_intake_p1_submissions policies (service role only)
DROP POLICY IF EXISTS anonymous_intake_p1_submissions_select_service ON public.anonymous_intake_p1_submissions;
CREATE POLICY anonymous_intake_p1_submissions_select_service ON public.anonymous_intake_p1_submissions

  FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS anonymous_intake_p1_submissions_insert_service ON public.anonymous_intake_p1_submissions;
CREATE POLICY anonymous_intake_p1_submissions_insert_service ON public.anonymous_intake_p1_submissions

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS anonymous_intake_p1_submissions_update_service ON public.anonymous_intake_p1_submissions;
CREATE POLICY anonymous_intake_p1_submissions_update_service ON public.anonymous_intake_p1_submissions

  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS anonymous_intake_p1_submissions_delete_service ON public.anonymous_intake_p1_submissions;
CREATE POLICY anonymous_intake_p1_submissions_delete_service ON public.anonymous_intake_p1_submissions

  FOR DELETE
  USING (auth.role() = 'service_role');
-- intake_p2_submissions policies
DROP POLICY IF EXISTS intake_p2_submissions_select_own ON public.intake_p2_submissions;
CREATE POLICY intake_p2_submissions_select_own ON public.intake_p2_submissions

  FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS intake_p2_submissions_insert_own ON public.intake_p2_submissions;
CREATE POLICY intake_p2_submissions_insert_own ON public.intake_p2_submissions

  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS intake_p2_submissions_select_service ON public.intake_p2_submissions;
CREATE POLICY intake_p2_submissions_select_service ON public.intake_p2_submissions

  FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS intake_p2_submissions_insert_service ON public.intake_p2_submissions;
CREATE POLICY intake_p2_submissions_insert_service ON public.intake_p2_submissions

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS intake_p2_submissions_delete_service ON public.intake_p2_submissions;
CREATE POLICY intake_p2_submissions_delete_service ON public.intake_p2_submissions

  FOR DELETE
  USING (auth.role() = 'service_role');
-- weekly_checkins policies
DROP POLICY IF EXISTS weekly_checkins_select_own ON public.weekly_checkins;
CREATE POLICY weekly_checkins_select_own ON public.weekly_checkins

  FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS weekly_checkins_insert_own ON public.weekly_checkins;
CREATE POLICY weekly_checkins_insert_own ON public.weekly_checkins

  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS weekly_checkins_select_service ON public.weekly_checkins;
CREATE POLICY weekly_checkins_select_service ON public.weekly_checkins

  FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS weekly_checkins_insert_service ON public.weekly_checkins;
CREATE POLICY weekly_checkins_insert_service ON public.weekly_checkins

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS weekly_checkins_delete_service ON public.weekly_checkins;
CREATE POLICY weekly_checkins_delete_service ON public.weekly_checkins

  FOR DELETE
  USING (auth.role() = 'service_role');
-- estimate_history policies
DROP POLICY IF EXISTS estimate_history_select_own ON public.estimate_history;
CREATE POLICY estimate_history_select_own ON public.estimate_history

  FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS estimate_history_insert_own ON public.estimate_history;
CREATE POLICY estimate_history_insert_own ON public.estimate_history

  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS estimate_history_select_service ON public.estimate_history;
CREATE POLICY estimate_history_select_service ON public.estimate_history

  FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS estimate_history_insert_service ON public.estimate_history;
CREATE POLICY estimate_history_insert_service ON public.estimate_history

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS estimate_history_delete_service ON public.estimate_history;
CREATE POLICY estimate_history_delete_service ON public.estimate_history

  FOR DELETE
  USING (auth.role() = 'service_role');
-- learn_categories policies
DROP POLICY IF EXISTS learn_categories_select_all ON public.learn_categories;
CREATE POLICY learn_categories_select_all ON public.learn_categories

  FOR SELECT
  USING (TRUE);
DROP POLICY IF EXISTS learn_categories_insert_service ON public.learn_categories;
CREATE POLICY learn_categories_insert_service ON public.learn_categories

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS learn_categories_update_service ON public.learn_categories;
CREATE POLICY learn_categories_update_service ON public.learn_categories

  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS learn_categories_delete_service ON public.learn_categories;
CREATE POLICY learn_categories_delete_service ON public.learn_categories

  FOR DELETE
  USING (auth.role() = 'service_role');
-- learn_articles policies
DROP POLICY IF EXISTS learn_articles_select_all ON public.learn_articles;
CREATE POLICY learn_articles_select_all ON public.learn_articles

  FOR SELECT
  USING (TRUE);
DROP POLICY IF EXISTS learn_articles_insert_service ON public.learn_articles;
CREATE POLICY learn_articles_insert_service ON public.learn_articles

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS learn_articles_update_service ON public.learn_articles;
CREATE POLICY learn_articles_update_service ON public.learn_articles

  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS learn_articles_delete_service ON public.learn_articles;
CREATE POLICY learn_articles_delete_service ON public.learn_articles

  FOR DELETE
  USING (auth.role() = 'service_role');
-- user_article_reads policies
DROP POLICY IF EXISTS user_article_reads_select_own ON public.user_article_reads;
CREATE POLICY user_article_reads_select_own ON public.user_article_reads

  FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_article_reads_insert_own ON public.user_article_reads;
CREATE POLICY user_article_reads_insert_own ON public.user_article_reads

  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_article_reads_delete_own ON public.user_article_reads;
CREATE POLICY user_article_reads_delete_own ON public.user_article_reads

  FOR DELETE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_article_reads_select_service ON public.user_article_reads;
CREATE POLICY user_article_reads_select_service ON public.user_article_reads

  FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS user_article_reads_insert_service ON public.user_article_reads;
CREATE POLICY user_article_reads_insert_service ON public.user_article_reads

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS user_article_reads_delete_service ON public.user_article_reads;
CREATE POLICY user_article_reads_delete_service ON public.user_article_reads

  FOR DELETE
  USING (auth.role() = 'service_role');
-- app_logs policies (service role only)
DROP POLICY IF EXISTS app_logs_select_service ON public.app_logs;
CREATE POLICY app_logs_select_service ON public.app_logs

  FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS app_logs_insert_service ON public.app_logs;
CREATE POLICY app_logs_insert_service ON public.app_logs

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS app_logs_delete_service ON public.app_logs;
CREATE POLICY app_logs_delete_service ON public.app_logs

  FOR DELETE
  USING (auth.role() = 'service_role');
-- stripe_webhook_events policies (service role only)
DROP POLICY IF EXISTS stripe_webhook_events_select_service ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_select_service ON public.stripe_webhook_events

  FOR SELECT
  USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS stripe_webhook_events_insert_service ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_insert_service ON public.stripe_webhook_events

  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS stripe_webhook_events_update_service ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_update_service ON public.stripe_webhook_events

  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS stripe_webhook_events_delete_service ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_delete_service ON public.stripe_webhook_events
  FOR DELETE
  USING (auth.role() = 'service_role');
