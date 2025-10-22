import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

type LogSeverity = "info" | "warn" | "error";
type LogSource = "edge" | "webhook" | "rpc";

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

let serviceClient: SupabaseClient | null = null;

// Removed jsonResponse and corsHeaders - use standardized versions from http.ts instead

export const getServiceSupabaseClient = (): SupabaseClient => {
  if (!serviceClient) {
    serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return serviceClient;
};

export const getSupabaseClientWithAuth = (req: Request): { client: SupabaseClient; accessToken: string } => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : authHeader;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { client, accessToken: token };
};

export const logToAppLogs = async (
  params: {
    userId?: string;
    installId?: string;
    event: string;
    source: LogSource;
    severity?: LogSeverity;
    details?: Record<string, unknown>;
  },
): Promise<void> => {
  try {
    const client = getServiceSupabaseClient();
    await client.from("app_logs").insert({
      user_id: params.userId ?? null,
      install_id: params.installId ?? null,
      event: params.event,
      source: params.source,
      severity: params.severity ?? "error",
      details: params.details ?? {},
    });
  } catch (err) {
    console.error("Failed to write to app_logs", err);
  }
};

export { z };

type MeasurementUnit = "metric" | "imperial";
type MeasurementPrefsKeys = "height" | "weight" | "waist";

export type MeasurementPrefs = Partial<Record<MeasurementPrefsKeys, MeasurementUnit>>;

const measurementKeys: MeasurementPrefsKeys[] = ["height", "weight", "waist"];

const toUnit = (value: unknown): MeasurementUnit | undefined =>
  value === "imperial" ? "imperial" : value === "metric" ? "metric" : undefined;

const coerceBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "no" || normalized === "n" || normalized === "0") {
      return false;
    }
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
};

const coerceMeasurementPrefs = (input: unknown): MeasurementPrefs => {
  if (!input || typeof input !== "object") {
    return {};
  }
  const record = input as Record<string, unknown>;
  const prefs: MeasurementPrefs = {};
  for (const key of measurementKeys) {
    const unit = toUnit(record[key]);
    if (unit) {
      prefs[key] = unit;
    }
  }
  return prefs;
};

export const extractMeasurementPrefsFromPayload = (payload: unknown): MeasurementPrefs | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const prefsFromPayload = coerceMeasurementPrefs(record.measurement_prefs);

  const heightUnit = toUnit(record.height_unit);
  const weightUnit = toUnit(record.weight_unit);
  const waistUnit = toUnit(record.waist_unit);

  const merged: MeasurementPrefs = { ...prefsFromPayload };
  if (heightUnit) merged.height = heightUnit;
  if (weightUnit) merged.weight = weightUnit;
  if (waistUnit) merged.waist = waistUnit;

  return Object.keys(merged).length > 0 ? merged : null;
};

export const normalizeMeasurementPrefsForProfile = (input: unknown): MeasurementPrefs | null => {
  const normalized = coerceMeasurementPrefs(input);
  return Object.keys(normalized).length > 0 ? normalized : null;
};

export const mergeMeasurementPrefs = (existing: unknown, next: MeasurementPrefs | null): MeasurementPrefs | null => {
  if (!next || Object.keys(next).length === 0) {
    return null;
  }
  const current = coerceMeasurementPrefs(existing);
  const merged: MeasurementPrefs = { ...current };
  for (const key of measurementKeys) {
    const value = next[key];
    if (value) {
      merged[key] = value;
    }
  }
  const changed = measurementKeys.some((key) => merged[key] !== current[key]);
  return changed ? merged : null;
};

export const loadLatestMeasurementPrefs = async (
  client: SupabaseClient,
  userId: string,
): Promise<MeasurementPrefs | null> => {
  const { data, error } = await client
    .from("anonymous_intake_p1_submissions")
    .select("payload")
    .eq("linked_user_id", userId)
    .order("linked_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return extractMeasurementPrefsFromPayload(data.payload);
};

export type SmokingPrefs = {
  cigarettes: boolean;
  vape: boolean;
  cigars: boolean;
  weed: boolean;
  other?: boolean;
};

const baseSmokingPrefs = (): SmokingPrefs => ({
  cigarettes: false,
  vape: false,
  cigars: false,
  weed: false,
});

export const deriveSmokingPrefs = (
  payload: Record<string, unknown> | null | undefined,
): SmokingPrefs | null => {
  if (!payload) {
    return null;
  }

  const smokeNow = coerceBoolean(payload.smoke_now);
  if (smokeNow === undefined) {
    return null;
  }
  const prefs = baseSmokingPrefs();
  if (!smokeNow) {
    return prefs;
  }

  const typeValue = typeof payload.smoke_type === "string" ? payload.smoke_type.toLowerCase().trim() : "";
  switch (typeValue) {
    case "cigarettes":
      prefs.cigarettes = true;
      break;
    case "vape":
      prefs.vape = true;
      break;
    case "cigar":
    case "cigars":
      prefs.cigars = true;
      break;
    case "weed":
      prefs.weed = true;
      break;
    case "":
      break;
    default:
      prefs.other = true;
      break;
  }
  return prefs;
};

export type ProfileSmokingPrefs = {
  cigarettes: boolean;
  vape: boolean;
  weed: boolean;
};

const baseProfileSmokingPrefs = (): ProfileSmokingPrefs => ({
  cigarettes: false,
  vape: false,
  weed: false,
});

export const normalizeSmokingPrefsForProfile = (prefs: SmokingPrefs | Record<string, unknown> | null | undefined): ProfileSmokingPrefs | null => {
  if (!prefs || typeof prefs !== "object") {
    return null;
  }
  const source = prefs as Record<string, unknown>;
  return {
    cigarettes: Boolean(source.cigarettes),
    vape: Boolean(source.vape),
    weed: Boolean(source.weed),
  };
};

export const deriveProfileSmokingPrefs = (payload: Record<string, unknown> | null | undefined): ProfileSmokingPrefs | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const smokeNow = coerceBoolean(payload.smoke_now);
  if (smokeNow === undefined) {
    return null;
  }
  if (!smokeNow) {
    return baseProfileSmokingPrefs();
  }
  const derived = deriveSmokingPrefs(payload as Record<string, unknown>);
  if (!derived) {
    return null;
  }
  return {
    cigarettes: Boolean(derived.cigarettes),
    vape: Boolean(derived.vape),
    weed: Boolean(derived.weed),
  };
};

export const loadLatestSmokingPrefs = async (
  client: SupabaseClient,
  userId: string,
): Promise<SmokingPrefs | null> => {
  const { data, error } = await client
    .from("intake_p2_submissions")
    .select("payload")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return deriveSmokingPrefs((data.payload ?? {}) as Record<string, unknown>);
};

export const isEmptyObjectRecord = (value: unknown): boolean =>
  !value || typeof value !== "object" || Object.keys(value as Record<string, unknown>).length === 0;

type IsoDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const buildPartsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

const extractDateParts = (date: Date, formatter: Intl.DateTimeFormat): IsoDateParts => {
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
};

const parseOffsetMinutes = (timeZone: string, date: Date): number => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const offsetPart = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")
    ?.value ?? "GMT+00:00";
  const match = offsetPart.match(/GMT([+-])(\d{2})(?::?(\d{2}))?/);
  if (!match) {
    return 0;
  }
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
};

export const computeNextDueAt19Local = (timeZone: string | undefined, fromDate: Date): string => {
  const zone = timeZone?.trim() || "UTC";
  try {
    const formatter = buildPartsFormatter(zone);
    const localParts = extractDateParts(fromDate, formatter);
    const scheduledLocal = new Date(
      Date.UTC(localParts.year, localParts.month - 1, localParts.day, 19, 0, 0, 0),
    );
    scheduledLocal.setUTCDate(scheduledLocal.getUTCDate() + 7);
    const offsetMinutes = parseOffsetMinutes(zone, scheduledLocal);
    const dueUtcMs = scheduledLocal.getTime() - offsetMinutes * 60 * 1000;
    return new Date(dueUtcMs).toISOString();
  } catch (_error) {
    const fallback = new Date(fromDate);
    fallback.setDate(fallback.getDate() + 7);
    fallback.setHours(19, 0, 0, 0);
    return fallback.toISOString();
  }
};

export const computeNextWeekDueAt = (baseDate: Date, timeZone?: string): string =>
  computeNextDueAt19Local(timeZone, baseDate);
