-- Fix search_path for set_updated_at function
DROP TRIGGER IF EXISTS set_updated_at_profiles_trg ON public.profiles;
DROP TRIGGER IF EXISTS set_updated_at_anonymous_intake_p1_submissions_trg ON public.anonymous_intake_p1_submissions;
DROP TRIGGER IF EXISTS set_updated_at_learn_categories_trg ON public.learn_categories;
DROP TRIGGER IF EXISTS set_updated_at_learn_articles_trg ON public.learn_articles;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_updated_at_profiles_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_anonymous_intake_p1_submissions_trg
BEFORE UPDATE ON public.anonymous_intake_p1_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_learn_categories_trg
BEFORE UPDATE ON public.learn_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_learn_articles_trg
BEFORE UPDATE ON public.learn_articles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
