const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERRAL_CODE_REGEX = /^[A-Z0-9\-_]+$/;

export const requireString = (
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; trim?: boolean } = {},
): string => {
  if (typeof value !== "string") {
    throw new Error(`${field}_required`);
  }
  const trimmed = opts.trim === false ? value : value.trim();
  if (opts.min !== undefined && trimmed.length < opts.min) {
    throw new Error(`${field}_too_short`);
  }
  if (opts.max !== undefined && trimmed.length > opts.max) {
    throw new Error(`${field}_too_long`);
  }
  if (trimmed.length === 0) {
    throw new Error(`${field}_required`);
  }
  return trimmed;
};

export const requireUUID = (value: unknown, field: string): string => {
  const str = requireString(value, field);
  if (!UUID_REGEX.test(str)) {
    throw new Error(`${field}_invalid`);
  }
  return str;
};

export const normalizeReferralCode = (raw: unknown): string => {
  const input = requireString(raw, "code", { min: 2, max: 32 });
  const normalized = input.replace(/\s+/g, "").toUpperCase();
  if (!REFERRAL_CODE_REGEX.test(normalized)) {
    throw new Error("code_invalid_format");
  }
  return normalized;
};

export const requireNumberInRange = (
  value: unknown,
  field: string,
  opts: { min?: number; max?: number },
): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field}_invalid`);
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new Error(`${field}_too_small`);
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new Error(`${field}_too_large`);
  }
  return value;
};
