import { Platform } from "react-native";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const FUNCTIONS_OVERRIDE = process.env.EXPO_PUBLIC_FUNCTIONS_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let cachedUrl: string | null = null;

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

export const getFunctionsUrl = (): string => {
  if (cachedUrl) {
    return cachedUrl;
  }

  const override = FUNCTIONS_OVERRIDE?.trim();
  if (override) {
    cachedUrl = normalizeBaseUrl(override);
    return cachedUrl;
  }

  if (!SUPABASE_URL) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
  }

  const normalized = normalizeBaseUrl(SUPABASE_URL.trim());
  const functionsUrl = normalized.replace(".supabase.co", ".functions.supabase.co");
  cachedUrl = functionsUrl;
  return cachedUrl;
};

const buildUrl = (path: string) => {
  const base = getFunctionsUrl();
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${safePath}`;
};

type HttpMethod = "GET" | "POST";

type RequestOptions = {
  path: string;
  method: HttpMethod;
  body?: unknown;
  jwt?: string;
  extraHeaders?: Record<string, string>;
};

const request = async <T = unknown>({
  path,
  method,
  body,
  jwt,
  extraHeaders,
}: RequestOptions): Promise<T> => {
  if (!ANON_KEY) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_ANON_KEY");
  }

  const url = buildUrl(path);
  const token = jwt ?? ANON_KEY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };

  const payload = body === undefined ? undefined : JSON.stringify(body ?? {});
  const init: RequestInit = {
    method,
    headers,
    body: payload,
  };

  console.log("[fn] request", { platform: Platform.OS, url, method, body });

  const response = await fetch(url, init);
  const text = await response.text();

  let data: unknown = text;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // leave as raw text
    }
  } else {
    data = null;
  }

  console.log("[fn] response", { url, status: response.status, data });

  if (!response.ok) {
    let errorMessage: string | undefined;
    if (typeof data === "object" && data !== null) {
      if ("error" in data && typeof (data as Record<string, unknown>).error === "string") {
        errorMessage = (data as Record<string, unknown>).error as string;
      } else if ("message" in data && typeof (data as Record<string, unknown>).message === "string") {
        errorMessage = (data as Record<string, unknown>).message as string;
      }
    }
    throw new Error(errorMessage ?? response.statusText ?? "Function request failed");
  }

  return data as T;
};

export const post = <T = unknown>(path: string, body?: unknown, jwt?: string, extraHeaders?: Record<string, string>) =>
  request<T>({ path, method: "POST", body, jwt, extraHeaders });

export const get = <T = unknown>(path: string, jwt?: string, extraHeaders?: Record<string, string>) =>
  request<T>({ path, method: "GET", jwt, extraHeaders });
