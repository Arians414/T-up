import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getServiceSupabaseClient, jsonResponse, z } from "../_shared/utils.ts";

const ADMIN_SHARED_SECRET = Deno.env.get("ADMIN_LOG_EVENT_SECRET") ?? "";

if (!ADMIN_SHARED_SECRET) {
  throw new Error("Missing ADMIN_LOG_EVENT_SECRET");
}

const requestSchema = z.object({
  user_id: z.string().uuid().optional(),
  install_id: z.string().uuid().optional(),
  event: z.string().min(1),
  source: z.enum(["edge", "webhook", "rpc"]),
  severity: z.enum(["info", "warn", "error"]).default("info"),
  details: z.record(z.any()).optional(),
});

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const adminKey = req.headers.get("X-Admin-Key") ?? "";
  if (!adminKey || adminKey !== ADMIN_SHARED_SECRET) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await req.json());
  } catch (_error) {
    return jsonResponse({ ok: false, error: "Invalid payload" }, 400);
  }

  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.from("app_logs").insert({
    user_id: payload.user_id ?? null,
    install_id: payload.install_id ?? null,
    event: payload.event,
    source: payload.source,
    severity: payload.severity,
    details: payload.details ?? {},
  });

  if (error) {
    return jsonResponse({ ok: false, error: "Failed to log event" }, 500);
  }

  return jsonResponse({ ok: true });
});
