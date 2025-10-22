import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";
import { jsonResponse } from "./http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL environment variable");
}
if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}
if (!ANON_KEY) {
  throw new Error("Missing SUPABASE_ANON_KEY environment variable");
}

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export const getAdminClient = (): SupabaseClient => {
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
};

export const getAnonClient = (): SupabaseClient => {
  if (!anonClient) {
    anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonClient;
};

export type JsonValue = Record<string, unknown>;

export const readJson = async <T = JsonValue>(req: Request): Promise<T | null> => {
  try {
    const data = await req.json();
    return data as T;
  } catch (_error) {
    return null;
  }
};

// Removed jsonResponse - use the standardized version from http.ts instead

export const ensureServiceRole = (req: Request): Response | null => {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : header;
  if (!token || token !== SERVICE_ROLE_KEY) {
    return jsonResponse(403, { ok: false, error: "forbidden" });
  }
  return null;
};

export const logRequest = (details: Record<string, unknown>): void => {
  try {
    console.log(JSON.stringify(details));
  } catch {
    console.log(details);
  }
};

export const nowIso = (): string => new Date().toISOString();
