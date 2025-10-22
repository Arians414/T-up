import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getServiceSupabaseClient, logToAppLogs, z } from "../_shared/utils.ts";
import { jsonResponse, corsHeaders } from "../_shared/http.ts";

const requestSchema = z.object({
  install_id: z.string().uuid(),
  payload: z.object({}).passthrough(),
  schema_version: z.string().min(1),
});

serve(async (req) => {
  const hasAuthHeader = !!req.headers.get("Authorization");

  await logToAppLogs({
    event: "save_anonymous_p1.request",
    source: "edge",
    severity: "info",
    details: {
      method: req.method,
      userAgent: req.headers.get("user-agent") ?? undefined,
      hasAuthHeader,
    },
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    const json = await req.json();
    parsed = requestSchema.parse(json);
  } catch (error) {
    await logToAppLogs({
      event: "save_anonymous_p1",
      source: "edge",
      severity: "warn",
      details: { reason: "invalid_payload", error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Invalid payload" }, 400);
  }

  try {
    const supabase = getServiceSupabaseClient();
    
    // Check if submission already exists for this install_id (not linked to user yet)
    const { data: existing } = await supabase
      .from("anonymous_intake_p1_submissions")
      .select("submission_id")
      .eq("install_id", parsed.install_id)
      .is("linked_user_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let submissionId: string;
    
    if (existing) {
      // Update existing submission instead of creating duplicate
      const { data, error } = await supabase
        .from("anonymous_intake_p1_submissions")
        .update({
          payload: parsed.payload,
          schema_version: parsed.schema_version,
          updated_at: new Date().toISOString(),
        })
        .eq("submission_id", existing.submission_id)
        .select("submission_id")
        .single();

      if (error) {
        await logToAppLogs({
          event: "save_anonymous_p1",
          source: "edge",
          details: { supabaseError: error, action: "update" },
        });
        return jsonResponse({ ok: false, error: "Failed to update intake" }, 500);
      }
      submissionId = data.submission_id;
    } else {
      // Create new submission
      const { data, error } = await supabase
        .from("anonymous_intake_p1_submissions")
        .insert({
          install_id: parsed.install_id,
          payload: parsed.payload,
          schema_version: parsed.schema_version,
          intake_locked: false,
        })
        .select("submission_id")
        .single();

      if (error) {
        await logToAppLogs({
          event: "save_anonymous_p1",
          source: "edge",
          details: { supabaseError: error, action: "insert" },
        });
        return jsonResponse({ ok: false, error: "Failed to save intake" }, 500);
      }
      submissionId = data.submission_id;
    }

    return jsonResponse({ ok: true, submission_id: submissionId });
  } catch (error) {
    await logToAppLogs({
      event: "save_anonymous_p1",
      source: "edge",
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return jsonResponse({ ok: false, error: "Unexpected error" }, 500);
  }
});
