CREATE OR REPLACE FUNCTION public.complete_intake2_atomic(
  p_user_id uuid,
  p_payload jsonb,
  p_schema_version text DEFAULT 'v1'
)
RETURNS TABLE (score numeric, potential numeric, generated_at timestamptz, model_version text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := NOW();
  v_score numeric;
  v_potential numeric;
  v_model text := 'v1.0.0';
BEGIN
  INSERT INTO public.intake_p2_submissions(user_id, payload, schema_version, submitted_at)
  VALUES (p_user_id, p_payload, COALESCE(p_schema_version, 'v1'), v_now);

  UPDATE public.profiles
     SET intake_p2_completed_at = v_now,
         updated_at = v_now
   WHERE user_id = p_user_id;

  -- Placeholder scoring; replace with real estimator as needed
  v_score := 550;
  v_potential := 0.15;

  INSERT INTO public.estimate_history(
    user_id,
    source,
    related_checkin_id,
    week_number,
    model_version,
    score,
    potential,
    generated_at,
    payload
  )
  VALUES (
    p_user_id,
    'intake_p2',
    NULL,
    NULL,
    v_model,
    v_score,
    v_potential,
    v_now,
    p_payload
  );

  UPDATE public.profiles
     SET last_result = jsonb_build_object(
           'score', v_score,
           'potential', v_potential,
           'generated_at', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'model_version_at_score', v_model,
           'model_version_at_potential', v_model
         ),
         updated_at = v_now
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_score, v_potential, v_now, v_model;
END;
$$;;
