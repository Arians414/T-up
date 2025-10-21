export type MeasurementUnitPreference = "metric" | "imperial";

export type MeasurementPrefs = {
  height?: MeasurementUnitPreference;
  weight?: MeasurementUnitPreference;
  waist?: MeasurementUnitPreference;
};

type AnswersRecord = Record<string, unknown>;

const JEANS_INCHES_MAP: Record<string, number> = {
  W28: 28,
  W30: 30,
  W32: 32,
  W34: 34,
  W36: 36,
  W38: 38,
  W40: 40,
  W42: 42,
  W44: 44,
};

export const JEANS_WAIST_SIZES = Object.keys(JEANS_INCHES_MAP) as Array<keyof typeof JEANS_INCHES_MAP>;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const roundToNearestInt = (value: number) => Math.round(value);

const unitFromValue = (value: unknown): MeasurementUnitPreference | undefined =>
  value === "imperial" ? "imperial" : value === "metric" ? "metric" : undefined;

const coercePrefs = (value: unknown): MeasurementPrefs => {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const next: MeasurementPrefs = {};
  const heightPref = unitFromValue(record.height);
  if (heightPref) {
    next.height = heightPref;
  }
  const weightPref = unitFromValue(record.weight);
  if (weightPref) {
    next.weight = weightPref;
  }
  const waistPref = unitFromValue(record.waist);
  if (waistPref) {
    next.waist = waistPref;
  }
  return next;
};

const deriveMeasurementPrefs = (answers: AnswersRecord): MeasurementPrefs => {
  const base = coercePrefs(answers.measurement_prefs);
  const result: MeasurementPrefs = { ...base };

  const heightUnit = unitFromValue(answers.height_unit);
  if (heightUnit) {
    result.height = heightUnit;
  }

  const weightUnit = unitFromValue(answers.weight_unit);
  if (weightUnit) {
    result.weight = weightUnit;
  }

  const waistUnit = unitFromValue(answers.waist_unit);
  if (waistUnit) {
    result.waist = waistUnit;
  }

  return result;
};

const convertImperialHeightToCm = (answers: AnswersRecord): number | null => {
  const feet = toNumber(answers.height_feet ?? answers.height_ft);
  const inches = toNumber(answers.height_inches ?? answers.height_in);
  const totalInches = toNumber(answers.height_total_inches);

  let inchesValue: number | null = null;
  if (totalInches !== null) {
    inchesValue = totalInches;
  } else if (feet !== null || inches !== null) {
    inchesValue = (feet ?? 0) * 12 + (inches ?? 0);
  }

  if (inchesValue !== null) {
    const cm = inchesValue * 2.54;
    return roundTo(cm, 1);
  }

  return null;
};

const convertImperialWeightToKg = (answers: AnswersRecord): number | null => {
  const lbs =
    toNumber(answers.weight_lb) ??
    toNumber(answers.weight_lbs) ??
    toNumber(answers.weight_pounds);

  if (lbs !== null) {
    const kg = lbs * 0.45359237;
    return roundTo(kg, 1);
  }

  return null;
};

const convertImperialWaistToCm = (answers: AnswersRecord): number | null => {
  const inches =
    toNumber(answers.waist_in) ??
    toNumber(answers.waist_inch) ??
    toNumber(answers.waist_inches);

  if (inches !== null) {
    const cm = inches * 2.54;
    return roundToNearestInt(cm);
  }

  return null;
};

export const convertJeansSizeToCm = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }
  const formatted = value.trim().toUpperCase();
  const inches = JEANS_INCHES_MAP[formatted];
  if (typeof inches !== "number") {
    return null;
  }
  return roundToNearestInt(inches * 2.54);
};

export const normalizeMeasurementAnswers = (
  rawAnswers: AnswersRecord,
): { payload: AnswersRecord; measurementPrefs: MeasurementPrefs } => {
  const payload: AnswersRecord = JSON.parse(JSON.stringify(rawAnswers ?? {}));
  const prefs = deriveMeasurementPrefs(payload);

  const jeansSelection = typeof payload.waist_size_jeans === "string" ? payload.waist_size_jeans.trim().toUpperCase() : undefined;
  if ("waist_size_shirt" in payload) {
    delete payload.waist_size_shirt;
  }
  let waistSelection: { jeans?: string } | null = null;
  let waistCm: number | null = null;

  if (jeansSelection && JEANS_INCHES_MAP[jeansSelection]) {
    waistSelection = { jeans: jeansSelection };
    waistCm = convertJeansSizeToCm(jeansSelection);
  }

  const existingHeightCm = toNumber(payload.height_cm);
  if (prefs.height === "imperial") {
    const converted = convertImperialHeightToCm(payload);
    if (converted !== null) {
      payload.height_cm = converted;
    } else if (existingHeightCm !== null) {
      payload.height_cm = roundTo(existingHeightCm, 1);
    }
  } else if (existingHeightCm !== null) {
    payload.height_cm = roundTo(existingHeightCm, 1);
  }

  const existingWeightKg = toNumber(payload.weight_kg);
  if (prefs.weight === "imperial") {
    const converted = convertImperialWeightToKg(payload);
    if (converted !== null) {
      payload.weight_kg = converted;
    } else if (existingWeightKg !== null) {
      payload.weight_kg = roundTo(existingWeightKg, 1);
    }
  } else if (existingWeightKg !== null) {
    payload.weight_kg = roundTo(existingWeightKg, 1);
  }

  const existingWaistCm = toNumber(payload.waist_cm);
  if (waistCm !== null) {
    payload.waist_cm = waistCm;
  } else if (existingWaistCm !== null) {
    payload.waist_cm = roundToNearestInt(existingWaistCm);
  } else if (prefs.waist === "imperial") {
    const converted = convertImperialWaistToCm(payload);
    if (converted !== null) {
      payload.waist_cm = converted;
    }
  } else {
    payload.waist_cm = null;
  }

  payload.waist_selection = waistSelection ?? null;

  const globalUnit =
    prefs.weight ??
    prefs.height ??
    unitFromValue(payload.default_measurement_unit);

  if (waistSelection) {
    if (globalUnit === "imperial") {
      prefs.waist = "imperial";
    } else if (globalUnit === "metric") {
      if (!prefs.waist || prefs.waist === "metric") {
        prefs.waist = "metric";
      }
    }
  } else if (!prefs.waist && typeof payload.waist_unit === "string") {
    const waistPref = unitFromValue(payload.waist_unit);
    if (waistPref) {
      prefs.waist = waistPref;
    }
  }

  const cleanedPrefsEntries = Object.entries(prefs).filter(
    ([, value]) => value === "metric" || value === "imperial",
  ) as Array<[keyof MeasurementPrefs, MeasurementUnitPreference]>;

  if (cleanedPrefsEntries.length > 0) {
    payload.measurement_prefs = cleanedPrefsEntries.reduce<MeasurementPrefs>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  } else {
    delete payload.measurement_prefs;
  }

  return {
    payload,
    measurementPrefs: payload.measurement_prefs ?? {},
  };
};
