-- Enforce uniqueness of weekly estimates per check-in
CREATE UNIQUE INDEX IF NOT EXISTS estimate_history_user_related_checkin_idx
  ON public.estimate_history(user_id, related_checkin_id)
  WHERE related_checkin_id IS NOT NULL;
-- Atomic completion of intake part 2
CREATE OR REPLACE FUNCTION public.complete_intake2_atomic(
  p_user_id uuid,
  p_payload jsonb,
  p_schema_version text DEFAULT 'v1'
)
RETURNS TABLE(score numeric, potential numeric, generated_at timestamptz, model_version text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_score numeric := 550;
  v_potential numeric := 0.15;
  v_model_version text := 'v1.0.0';
  v_generated_at timestamptz := NOW();
  v_measurement_prefs jsonb := NULL;
BEGIN
  INSERT INTO public.intake_p2_submissions(user_id, payload, schema_version)
  VALUES (p_user_id, p_payload, COALESCE(p_schema_version, 'v1'))
  RETURNING submitted_at INTO v_generated_at;

  UPDATE public.profiles
  SET intake_p2_completed_at = v_generated_at
  WHERE user_id = p_user_id;

  IF p_payload ? 'measurement_prefs' THEN
    v_measurement_prefs := (p_payload -> 'measurement_prefs')::jsonb;
    IF v_measurement_prefs IS NOT NULL THEN
      UPDATE public.profiles
      SET measurement_prefs = COALESCE(measurement_prefs, '{}'::jsonb) || v_measurement_prefs
      WHERE user_id = p_user_id;
    END IF;
  END IF;

  INSERT INTO public.estimate_history(
    user_id, source, related_checkin_id, week_number, model_version, score, potential, generated_at, payload
  ) VALUES (
    p_user_id, 'intake_p2', NULL, NULL, v_model_version, v_score, v_potential, v_generated_at, '{}'::jsonb
  );

  UPDATE public.profiles
  SET last_result = jsonb_build_object(
      'score', v_score,
      'potential', v_potential,
      'model_version_at_score', v_model_version,
      'model_version_at_potential', v_model_version,
      'generated_at', v_generated_at
    ),
    updated_at = v_generated_at
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_score, v_potential, v_generated_at, v_model_version;
END;
$$;;
