import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeftIcon } from "react-native-heroicons/outline";

import part2Schema from "@schemas/qa.intake.part2.v2.json";
import { SafeAreaScreen } from "@/ui";
import { supabase } from "@/lib/supabase";
import { post } from "@/lib/functionsClient";
import { normalizeMeasurementAnswers } from "@/lib/measurement";
import { Card, Button, Chips, NumericDial, SliderField, YesNoCard } from "@/components/ui";
import {
  useIntakeState,
  shouldDisplayQuestion,
  extractQuestions,
  type DependsOnDefinition,
  type IntakeAnswers,
} from "@/state/intakeState";
import { useAppState } from "@/state/appState";
import { getColor, getRadius, getSpacing, theme, useTheme } from "@/theme";

const ALL_QUESTIONS = extractQuestions(part2Schema) as Question[];

type Question = {
  id: string;
  type: string;
  label: string;
  help?: string;
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  dependsOn?: DependsOnDefinition;
};

const JEANS_SIZE_OPTIONS = Array.from({ length: 8 }, (_, index) => {
  const inches = 28 + index * 2;
  const centimeters = Math.round(inches * 2.54);
  return {
    label: `W${inches}`,
    value: centimeters,
  };
});

const LETTER_SIZE_OPTIONS = [
  { label: "S", value: Math.round(30 * 2.54) },
  { label: "M", value: Math.round(34 * 2.54) },
  { label: "L", value: Math.round(38 * 2.54) },
  { label: "XL", value: Math.round(42 * 2.54) },
];

type StepDefinition =
  | { kind: "age"; question: Question }
  | { kind: "heightWeight"; height: Question; weight: Question }
  | { kind: "waist"; question: Question }
  | { kind: "slider"; question: Question; min: number; max: number; step: number; unit?: string }
  | { kind: "chips"; question: Question; options: string[] }
  | { kind: "chipsNumber"; question: Question; options: Array<{ label: string; value: number }> }
  | { kind: "yesNo"; question: Question }
  | { kind: "numeric"; question: Question; min: number; max: number; step: number; unit?: string; defaultValue?: number };

type HeightWeightUnit = "metric" | "imperial";

const buildPart2Steps = (answers: IntakeAnswers): StepDefinition[] => {
  const steps: StepDefinition[] = [];

  for (const question of ALL_QUESTIONS) {
    if (!shouldDisplayQuestion(question, answers)) {
      continue;
    }

    switch (question.id) {
      case "age":
        steps.push({ kind: "age", question });
        break;
      case "height_cm": {
        const weightQuestion = ALL_QUESTIONS.find((q) => q.id === "weight_kg");
        if (weightQuestion) {
          steps.push({ kind: "heightWeight", height: question, weight: weightQuestion });
        }
        break;
      }
      case "weight_kg":
        break;
      case "waist_cm":
        steps.push({ kind: "waist", question });
        break;
      case "energy_1_10":
      case "stress_0_10": {
        const min = typeof question.min === "number" ? question.min : 0;
        const max = typeof question.max === "number" ? question.max : 10;
        const step = typeof question.step === "number" && question.step > 0 ? question.step : 1;
        steps.push({ kind: "slider", question, min, max, step, unit: question.unit });
        break;
      }
      case "morning_erections_per_week": {
        const options = Array.from({ length: 8 }, (_, value) => ({ label: `${value}`, value }));
        steps.push({ kind: "chipsNumber", question, options });
        break;
      }
      default: {
        switch (question.type) {
          case "yes_no":
            steps.push({ kind: "yesNo", question });
            break;
          case "enum":
            steps.push({ kind: "chips", question, options: question.options ?? [] });
            break;
          case "scale": {
            const min = typeof question.min === "number" ? question.min : 0;
            const max = typeof question.max === "number" ? question.max : 10;
            const step = typeof question.step === "number" && question.step > 0 ? question.step : 1;
            const options = [] as Array<{ label: string; value: number }>;
            for (let value = min; value <= max; value += step) {
              options.push({ label: `${Number(value.toFixed(2))}`, value: Number(value.toFixed(2)) });
            }
            steps.push({ kind: "chipsNumber", question, options });
            break;
          }
          case "number": {
            const min = typeof question.min === "number" ? question.min : 0;
            const max = typeof question.max === "number" ? question.max : 999;
            const step = typeof question.step === "number" && question.step > 0 ? question.step : 1;
            const defaultValue = 0;
            steps.push({ kind: "numeric", question, min, max, step, unit: question.unit, defaultValue });
            break;
          }
          default:
            steps.push({ kind: "chips", question, options: question.options ?? [] });
        }
      }
    }
  }

  return steps;
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const computeAgeFromDate = (birthdate: Date) => {
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDiff = today.getMonth() - birthdate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdate.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
};

const dateFromIso = (iso?: unknown) => {
  if (typeof iso !== "string") {
    return null;
  }
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const defaultBirthdate = (age?: unknown) => {
  const today = new Date();
  const fallbackAge = typeof age === "number" && age > 0 ? age : 30;
  return new Date(today.getFullYear() - fallbackAge, today.getMonth(), today.getDate());
};

const cmToFeetInches = (centimeters: number) => {
  const totalInches = centimeters / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  return {
    feet,
    inches: Math.min(11, inches),
  };
};

const feetInchesToCm = (feet: number, inches: number) => Math.round((feet * 12 + inches) * 2.54);

const kgToLbs = (kg: number) => Math.round(kg * 2.20462);

const lbsToKg = (lbs: number) => Math.round((lbs / 2.20462) * 10) / 10;

const getDefaultHeightCm = (question: Question) => {
  const min = typeof question.min === "number" ? question.min : 120;
  const max = typeof question.max === "number" ? question.max : 220;
  return Math.round((min + max) / 2);
};

const getDefaultWeightKg = (question: Question) => {
  const min = typeof question.min === "number" ? question.min : 40;
  const max = typeof question.max === "number" ? question.max : 200;
  return Math.round((min + max) / 2);
};

const METRIC_HEIGHT_OPTIONS = Array.from({ length: 221 - 120 + 1 }, (_, index) => 120 + index);
const METRIC_WEIGHT_OPTIONS = Array.from({ length: 200 - 40 + 1 }, (_, index) => 40 + index);
const IMPERIAL_FEET_OPTIONS = Array.from({ length: 4 }, (_, index) => 4 + index); // 4, 5, 6, 7
const IMPERIAL_INCH_OPTIONS = Array.from({ length: 12 }, (_, index) => index); // 0-11
const IMPERIAL_WEIGHT_OPTIONS = Array.from({ length: 331 }, (_, index) => 70 + index);

export default function Onboarding2Question() {
  const router = useRouter();
  const { step } = useLocalSearchParams<{ step?: string }>();

  const themeTokens = useTheme();
  const { setLastResult } = useAppState();
  const { part2Answers, setAnswer, part2Completed, isHydrating } = useIntakeState();

  const steps = useMemo(() => buildPart2Steps(part2Answers), [part2Answers]);
  const totalSteps = steps.length;
  const maxStepIndex = Math.max(totalSteps - 1, 0);
  const stepIndex = useMemo(() => {
    const raw = Number(step ?? 0);
    return Number.isFinite(raw) ? Math.max(0, Math.min(Math.floor(raw), maxStepIndex)) : 0;
  }, [step, maxStepIndex]);
  const currentStep = steps[stepIndex];

  const [maxTotalSteps, setMaxTotalSteps] = useState(() => totalSteps);
  useEffect(() => {
    setMaxTotalSteps((prev) => Math.max(prev, totalSteps));
  }, [totalSteps]);

  const [showWaistHelper, setShowWaistHelper] = useState(false);

  useEffect(() => {
    setShowWaistHelper(false);
  }, [currentStep?.kind]);

  // Removed auto-navigation - user must press Next button to continue

  useEffect(() => {
    if (isHydrating) {
      return;
    }
    if (totalSteps === 0) {
      router.replace("/onboarding2/result");
      return;
    }
    if (stepIndex >= totalSteps) {
      const safeIndex = Math.max(totalSteps - 1, 0);
      router.replace(`/onboarding2/q/${safeIndex}`);
    }
  }, [isHydrating, router, stepIndex, totalSteps]);

  useEffect(() => {
    if (!currentStep) {
      return;
    }
    if (currentStep.kind === "slider") {
      const { question, min } = currentStep;
      if (typeof part2Answers[question.id] !== "number") {
        setAnswer(2, question.id, min);
      }
    }
    if (currentStep.kind === "numeric") {
      const { question, min, defaultValue } = currentStep;
      if (typeof part2Answers[question.id] !== "number") {
        const fallback = typeof defaultValue === "number" ? defaultValue : min;
        setAnswer(2, question.id, fallback);
      }
    }
    if (currentStep.kind === "waist") {
      const { question } = currentStep;
      if (typeof part2Answers[question.id] !== "number") {
        setAnswer(2, question.id, 0);
      }
    }
    if (currentStep.kind === "heightWeight") {
      const { height, weight } = currentStep;
      const existingHeight = part2Answers[height.id];
      const existingWeight = part2Answers[weight.id];
      if (typeof existingHeight !== "number") {
        setAnswer(2, height.id, getDefaultHeightCm(height));
      }
      if (typeof existingWeight !== "number") {
        setAnswer(2, weight.id, getDefaultWeightKg(weight));
      }
      const storedUnit = part2Answers["height_unit"] as HeightWeightUnit | undefined;
      if (storedUnit !== "metric" && storedUnit !== "imperial") {
        setAnswer(2, "height_unit", "metric");
      }
      const storedWeightUnit = part2Answers["weight_unit"] as HeightWeightUnit | undefined;
      if (storedWeightUnit !== "metric" && storedWeightUnit !== "imperial") {
        setAnswer(2, "weight_unit", "metric");
      }
    }
  }, [currentStep, part2Answers, setAnswer]);

  if (!currentStep) {
    return null;
  }

  const handleBack = useCallback(() => {
    if (stepIndex === 0) {
      router.replace("/paywall");
    } else {
      const prev = Math.max(0, Math.min(stepIndex - 1, maxStepIndex));
      router.replace(`/onboarding2/q/${prev}`);
    }
  }, [router, stepIndex, maxStepIndex]);

  const goToNextStep = useCallback(() => {
    const isLast = stepIndex >= maxStepIndex;
    if (totalSteps === 0 || isLast) {
      router.replace("/onboarding2/result");
      return;
    }
    const next = stepIndex + 1; // don't clamp here
    router.replace(`/onboarding2/q/${next}`);
  }, [router, stepIndex, maxStepIndex, totalSteps]);

  const isSubmittingRef = useRef(false);

  const handleNext = useCallback(async () => {
    Keyboard.dismiss();
    const isLast = stepIndex >= maxStepIndex;

    if (!isLast) {
      goToNextStep();
      return;
    }

    try {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const jwt = session?.access_token ?? null;
      const userId = session?.user?.id ?? null;

      if (!session || !jwt || !userId) {
        return;
      }

      const { payload } = normalizeMeasurementAnswers(part2Answers ?? {});

      try {
        const response = await post("/complete_intake2", { payload, schema_version: "v1" }, jwt);
        if (response && typeof response === "object") {
          const score = typeof (response as Record<string, unknown>).score === "number"
            ? (response as Record<string, number>).score
            : undefined;
          const rawPotential = (response as Record<string, unknown>).potential;
          const potential =
            typeof rawPotential === "number"
              ? rawPotential
              : rawPotential === null
              ? null
              : undefined;
          const generatedAt = (response as Record<string, unknown>).generatedAt;
          const modelVersion = (response as Record<string, unknown>).modelVersion;

          if (typeof score === "number") {
            await setLastResult({
              score,
              potential,
              generatedAt: typeof generatedAt === "string" ? generatedAt : undefined,
              modelVersion: typeof modelVersion === "string" ? modelVersion : undefined,
              source: "intake_p2",
              recordedAt: Date.now(),
            });
          }
        }
      } catch {
        // continue silently
      }
    } catch {
      // silent failure
    } finally {
      isSubmittingRef.current = false;
      router.replace("/onboarding2/result");
    }
  }, [maxStepIndex, part2Answers, router, setLastResult, stepIndex]);

  const renderAge = (stepDef: Extract<StepDefinition, { kind: "age" }>) => {
    const existingBirthdate = dateFromIso(part2Answers["age_birthdate"]);
    const initialDate = existingBirthdate ?? defaultBirthdate(part2Answers["age"]);
    const [dateValue, setDateValue] = useState(initialDate);

    const ageNumber = typeof part2Answers["age"] === "number" ? (part2Answers["age"] as number) : undefined;
    useEffect(() => {
      const next = existingBirthdate ?? defaultBirthdate(ageNumber);
      if (!dateValue || next.getTime() !== dateValue.getTime()) {
        setDateValue(next);
      }
    }, [existingBirthdate, ageNumber, dateValue]);

    const today = new Date();
    const maxDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
    const minDate = new Date(today.getFullYear() - 90, today.getMonth(), today.getDate());

    const handleDateChange = (_event: DateTimePickerEvent, nextDate?: Date) => {
      if (!nextDate) {
        return;
      }
      const clampedDate = clampToRange(nextDate, minDate, maxDate);
      setDateValue(clampedDate);
      const ageYears = computeAgeFromDate(clampedDate);
      setAnswer(2, stepDef.question.id, ageYears);
      setAnswer(2, "age_birthdate", clampedDate.toISOString());
    };

    return (
      <Card style={styles.cardBody}>
        <View style={styles.cardStack}>
          <Text style={[styles.prompt, { color: getColor("text.secondary") }]}>Select your birthdate</Text>
          <DateTimePicker
            value={dateValue}
            mode="date"
            display="spinner"
            maximumDate={maxDate}
            minimumDate={minDate}
            onChange={handleDateChange}
            textColor={themeTokens.colors.text.primary}
            style={styles.datePicker}
          />
        </View>
      </Card>
    );
  };

  const renderHeightWeight = (stepDef: Extract<StepDefinition, { kind: "heightWeight" }>) => {
    const unitPreference = (part2Answers["height_unit"] as HeightWeightUnit | undefined) ??
      ((part2Answers["weight_unit"] as HeightWeightUnit | undefined) ?? "metric");
    const [unit, setUnit] = useState<HeightWeightUnit>(unitPreference);

    useEffect(() => {
      setUnit(unitPreference);
    }, [unitPreference]);

    useEffect(() => {
      setAnswer(2, "height_unit", unit);
      setAnswer(2, "weight_unit", unit);
    }, [setAnswer, unit]);

    const heightValue = typeof part2Answers[stepDef.height.id] === "number"
      ? (part2Answers[stepDef.height.id] as number)
      : getDefaultHeightCm(stepDef.height);
    const weightValue = typeof part2Answers[stepDef.weight.id] === "number"
      ? (part2Answers[stepDef.weight.id] as number)
      : getDefaultWeightKg(stepDef.weight);

    const { feet, inches } = cmToFeetInches(heightValue);
    const pounds = kgToLbs(weightValue);

    const handleMetricHeightChange = (next: number) => {
      setAnswer(2, stepDef.height.id, next);
    };

    const handleMetricWeightChange = (next: number) => {
      setAnswer(2, stepDef.weight.id, next);
    };

    const handleFeetChange = (nextFeet: number) => {
      const clampedFeet = Math.max(IMPERIAL_FEET_OPTIONS[0], Math.min(IMPERIAL_FEET_OPTIONS.at(-1) ?? 7, nextFeet));
      const newCm = feetInchesToCm(clampedFeet, inches);
      setAnswer(2, stepDef.height.id, newCm);
    };

    const handleInchChange = (nextInches: number) => {
      const clampedInches = Math.max(0, Math.min(11, nextInches));
      const newCm = feetInchesToCm(feet, clampedInches);
      setAnswer(2, stepDef.height.id, newCm);
    };

    const handlePoundsChange = (nextPounds: number) => {
      const kg = lbsToKg(nextPounds);
      const min = typeof stepDef.weight.min === "number" ? stepDef.weight.min : 40;
      const max = typeof stepDef.weight.max === "number" ? stepDef.weight.max : 200;
      setAnswer(2, stepDef.weight.id, clampNumber(kg, min, max));
    };

    return (
      <Card style={styles.cardBody}>
        <View style={styles.cardStack}>
          <Text style={[styles.prompt, { color: getColor("text.secondary") }]}>Select preferred units</Text>
          <View style={styles.unitToggleRow}>
            {(["metric", "imperial"] as HeightWeightUnit[]).map((option) => {
              const selected = unit === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => setUnit(option)}
                  style={[styles.unitToggle, selected && styles.unitToggleActive]}
                >
                  <Text
                    style={[
                      styles.unitToggleLabel,
                      { color: selected ? getColor("text.onAccent") : getColor("text.primary") },
                    ]}
                  >
                    {option === "metric" ? "Metric" : "Imperial"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.hwGrid}>
            <View style={styles.hwColumn}>
              <Text style={[styles.hwLabel, { color: getColor("text.secondary") }]}>Height</Text>
              {unit === "metric" ? (
                <Picker
                  selectedValue={Math.round(heightValue)}
                  onValueChange={(itemValue) => handleMetricHeightChange(Number(itemValue))}
                  itemStyle={styles.pickerItem}
                  style={styles.pickerNative}
                >
                  {METRIC_HEIGHT_OPTIONS.map((valueOption) => (
                    <Picker.Item key={`height-${valueOption}`} label={`${valueOption} cm`} value={valueOption} />
                  ))}
                </Picker>
              ) : (
                <View style={styles.imperialRow}>
                  <Picker
                    selectedValue={feet}
                    onValueChange={(itemValue) => handleFeetChange(Number(itemValue))}
                    style={[styles.pickerNative, styles.pickerHalf]}
                  >
                    {IMPERIAL_FEET_OPTIONS.map((valueOption) => (
                      <Picker.Item key={`feet-${valueOption}`} label={`${valueOption} ft`} value={valueOption} />
                    ))}
                  </Picker>
                  <Picker
                    selectedValue={inches}
                    onValueChange={(itemValue) => handleInchChange(Number(itemValue))}
                    style={[styles.pickerNative, styles.pickerHalf]}
                  >
                    {IMPERIAL_INCH_OPTIONS.map((valueOption) => (
                      <Picker.Item key={`inch-${valueOption}`} label={`${valueOption} in`} value={valueOption} />
                    ))}
                  </Picker>
                </View>
              )}
            </View>

            <View style={styles.hwColumn}>
              <Text style={[styles.hwLabel, { color: getColor("text.secondary") }]}>Weight</Text>
              {unit === "metric" ? (
                <Picker
                  selectedValue={Math.round(weightValue)}
                  onValueChange={(itemValue) => handleMetricWeightChange(Number(itemValue))}
                  itemStyle={styles.pickerItem}
                  style={styles.pickerNative}
                >
                  {METRIC_WEIGHT_OPTIONS.map((valueOption) => (
                    <Picker.Item key={`weight-${valueOption}`} label={`${valueOption} kg`} value={valueOption} />
                  ))}
                </Picker>
              ) : (
                <Picker
                  selectedValue={pounds}
                  onValueChange={(itemValue) => handlePoundsChange(Number(itemValue))}
                  itemStyle={styles.pickerItem}
                  style={styles.pickerNative}
                >
                  {IMPERIAL_WEIGHT_OPTIONS.map((valueOption) => (
                    <Picker.Item key={`pounds-${valueOption}`} label={`${valueOption} lb`} value={valueOption} />
                  ))}
                </Picker>
              )}
            </View>
          </View>
        </View>
      </Card>
    );
  };

  const renderWaist = (stepDef: Extract<StepDefinition, { kind: "waist" }>) => {
    const current = part2Answers[stepDef.question.id];
    const min = typeof stepDef.question.min === "number" ? stepDef.question.min : 60;
    const max = typeof stepDef.question.max === "number" ? stepDef.question.max : 160;
    const step = typeof stepDef.question.step === "number" && stepDef.question.step > 0 ? stepDef.question.step : 1;

    const handleHelperSelection = (size: unknown) => {
      if (typeof size === "number") {
        const clamped = clampNumber(size, 0, max);
        setAnswer(2, stepDef.question.id, clamped);
      }
    };

    return (
      <Card style={styles.cardBody}>
        <View style={styles.cardStack}>
          <NumericDial
            value={typeof current === "number" ? (current as number) : 0}
            min={0}
            max={max}
            step={step}
            unit={stepDef.question.unit ?? "cm"}
            prompt="Enter measurement"
            onChange={(value) => {
              if (value !== null) {
                setAnswer(2, stepDef.question.id, value);
              }
            }}
          />
          {showWaistHelper ? (
            <View style={styles.waistHelper}>
              <Text style={[styles.helperHeading, { color: getColor("text.secondary") }]}>Jeans size</Text>
              <Chips
                card={false}
                options={JEANS_SIZE_OPTIONS}
                value={typeof current === "number" ? (current as number) : null}
                onChange={handleHelperSelection}
                allowEmpty
              />
              <Text style={[styles.helperHeading, { color: getColor("text.secondary") }]}>Shirt size</Text>
              <Chips
                card={false}
                options={LETTER_SIZE_OPTIONS}
                value={typeof current === "number" ? (current as number) : null}
                onChange={handleHelperSelection}
                allowEmpty
              />
            </View>
          ) : (
            <Pressable style={styles.helperButton} onPress={() => setShowWaistHelper(true)}>
              <Text style={[styles.helperButtonLabel, { color: getColor("accent.brand") }]}>I don't know my waist size</Text>
            </Pressable>
          )}
        </View>
      </Card>
    );
  };

  const renderSlider = (stepDef: Extract<StepDefinition, { kind: "slider" }>) => {
    const value = typeof part2Answers[stepDef.question.id] === "number"
      ? (part2Answers[stepDef.question.id] as number)
      : stepDef.min;
    return (
      <SliderField
        value={value}
        min={stepDef.min}
        max={stepDef.max}
        step={stepDef.step}
        unit={stepDef.unit}
        prompt="Slide to set"
        onChange={(next) => setAnswer(2, stepDef.question.id, next)}
      />
    );
  };

  const renderChips = (stepDef: Extract<StepDefinition, { kind: "chips" }>) => {
    const current = part2Answers[stepDef.question.id];
    const options = stepDef.options.map((option) => ({ label: option, value: option }));
    return (
      <Chips
        options={options}
        value={(typeof current === "string" ? current : null) as string | null}
        onChange={(next) => {
          if (typeof next === "string") {
            setAnswer(2, stepDef.question.id, next);
          }
        }}
      />
    );
  };

  const renderChipsNumber = (stepDef: Extract<StepDefinition, { kind: "chipsNumber" }>) => {
    const current = part2Answers[stepDef.question.id];
    return (
      <Chips
        options={stepDef.options}
        value={typeof current === "number" ? (current as number) : null}
        onChange={(next) => {
          if (typeof next === "number") {
            setAnswer(2, stepDef.question.id, next);
          }
        }}
      />
    );
  };

  const renderNumeric = (stepDef: Extract<StepDefinition, { kind: "numeric" }>) => {
    const current = part2Answers[stepDef.question.id];
    const effectiveValue = typeof current === "number" ? (current as number) : stepDef.defaultValue ?? stepDef.min;
    return (
      <NumericDial
        value={effectiveValue}
        min={stepDef.min}
        max={stepDef.max}
        step={stepDef.step}
        unit={stepDef.unit}
        prompt="Enter amount"
        onChange={(next) => {
          if (next !== null) {
            setAnswer(2, stepDef.question.id, next);
          }
        }}
      />
    );
  };

  const renderYesNo = (stepDef: Extract<StepDefinition, { kind: "yesNo" }>) => {
    const current = part2Answers[stepDef.question.id];
    return (
      <YesNoCard
        value={typeof current === "boolean" ? (current as boolean) : null}
        onChange={(value) => {
          setAnswer(2, stepDef.question.id, value);
        }}
      />
    );
  };

  const renderControl = () => {
    switch (currentStep.kind) {
      case "age":
        return renderAge(currentStep);
      case "heightWeight":
        return renderHeightWeight(currentStep);
      case "waist":
        return renderWaist(currentStep);
      case "slider":
        return renderSlider(currentStep);
      case "chips":
        return renderChips(currentStep);
      case "chipsNumber":
        return renderChipsNumber(currentStep);
      case "numeric":
        return renderNumeric(currentStep);
      case "yesNo":
        return renderYesNo(currentStep);
      default:
        return null;
    }
  };

  const isStepAnswered = (step: StepDefinition, answers: IntakeAnswers) => {
    switch (step.kind) {
      case "age":
        return typeof answers["age"] === "number" && answers["age"] !== null;
      case "heightWeight":
        return typeof answers[step.height.id] === "number" && typeof answers[step.weight.id] === "number";
      case "waist":
        return typeof answers[step.question.id] === "number";
      case "slider":
        return typeof answers[step.question.id] === "number";
      case "chips":
        return typeof answers[step.question.id] === "string" && answers[step.question.id] !== "";
      case "chipsNumber":
        return typeof answers[step.question.id] === "number";
      case "numeric":
        return typeof answers[step.question.id] === "number";
      case "yesNo":
        return typeof answers[step.question.id] === "boolean";
      default:
        return false;
    }
  };

  const nextDisabled = !isStepAnswered(currentStep, part2Answers);
  const questionLabel = (() => {
    switch (currentStep.kind) {
      case "heightWeight":
        return `${currentStep.height.label} & ${currentStep.weight.label}`;
      default:
        return currentStep.question.label;
    }
  })();
  const questionHelp = (() => {
    switch (currentStep.kind) {
      case "heightWeight":
        return currentStep.height.help ?? currentStep.weight.help;
      case "age":
        return currentStep.question.help;
      default:
        return currentStep.question.help;
    }
  })();

  const progressValue = maxTotalSteps > 0 ? Math.min((stepIndex + 1) / (maxTotalSteps + 1), 0.99) : 0;

  return (
    <SafeAreaScreen scroll={false}>
      <View style={styles.screen}>
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} accessibilityRole="button" style={styles.backButton}>
            <ArrowLeftIcon size={20} strokeWidth={2} color={themeTokens.colors.accent.brand} />
          </Pressable>
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${Math.min(100, progressValue * 100)}%` }]} />
            </View>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.centerBlock}>
            <View style={styles.questionBlock}>
              <Text
                style={[
                  styles.questionTitle,
                  {
                    color: themeTokens.colors.text.primary,
                    fontFamily: "Inter_700Bold",
                  },
                ]}
              >
                {questionLabel}
              </Text>
              {questionHelp ? (
                <Text
                  style={[
                    styles.questionHelp,
                    {
                      color: themeTokens.colors.text.secondary,
                      fontFamily: "Inter_400Regular",
                    },
                  ]}
                >
                  {questionHelp}
                </Text>
              ) : null}
            </View>

            <View style={styles.cardSlot}>{renderControl()}</View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Next" onPress={handleNext} disabled={nextDisabled} />
        </View>
      </View>
    </SafeAreaScreen>
  );
}

const clampToRange = (date: Date, minDate: Date, maxDate: Date) => {
  if (date < minDate) {
    return minDate;
  }
  if (date > maxDate) {
    return maxDate;
  }
  return date;
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: getSpacing("24"),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: getSpacing("12"),
  },
  backButton: {
    padding: getSpacing("8"),
  },
  progressContainer: {
    flex: 1,
    paddingRight: getSpacing("12"),
  },
  progressTrack: {
    height: 6,
    borderRadius: getRadius("pill"),
    backgroundColor: getColor("surface.progressRemainder"),
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: getRadius("pill"),
    backgroundColor: getColor("accent.brand"),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerBlock: {
    width: "100%",
    maxWidth: 420,
    gap: getSpacing("32"),
  },
  questionBlock: {
    gap: getSpacing("12"),
    alignItems: "center",
  },
  questionTitle: {
    textAlign: "center",
    fontSize: theme.typography.scale.xl,
    lineHeight: theme.typography.scale.xl * theme.typography.lineHeight.snug,
  },
  questionHelp: {
    textAlign: "center",
    fontSize: theme.typography.scale.md,
    lineHeight: theme.typography.scale.md * theme.typography.lineHeight.normal,
  },
  cardSlot: {
    width: "100%",
  },
  footer: {
    paddingBottom: 0,
  },
  cardBody: {
    alignSelf: "stretch",
  },
  cardStack: {
    gap: getSpacing("16"),
  },
  prompt: {
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
  },
  datePicker: {
    alignSelf: "center",
  },
  unitToggleRow: {
    flexDirection: "row",
    gap: getSpacing("12"),
    alignSelf: "center",
  },
  unitToggle: {
    paddingHorizontal: getSpacing("16"),
    paddingVertical: getSpacing("8"),
    borderRadius: getRadius("pill"),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor("border.muted"),
    backgroundColor: "transparent",
  },
  unitToggleActive: {
    borderColor: getColor("accent.brand"),
    backgroundColor: getColor("accent.selectedOverlay"),
  },
  unitToggleLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: theme.typography.scale.sm,
    textAlign: "center",
  },
  hwGrid: {
    flexDirection: "row",
    gap: getSpacing("16"),
    justifyContent: "center",
  },
  hwColumn: {
    flex: 1,
    gap: getSpacing("12"),
  },
  hwLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
    textAlign: "center",
  },
  pickerNative: {
    width: "100%",
    height: 200,
  },
  pickerItem: {
    fontFamily: "Inter_600SemiBold",
    fontSize: theme.typography.scale.lg,
    color: getColor("text.primary"),
  },
  pickerHalf: {
    flex: 1,
    width: undefined,
  },
  imperialRow: {
    flexDirection: "row",
    gap: getSpacing("12"),
  },
  imperialPickerItem: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: getColor("text.primary"),
  },
  waistHelper: {
    gap: getSpacing("16"),
  },
  helperHeading: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
    textAlign: "center",
  },
  helperButton: {
    alignSelf: "center",
    paddingVertical: getSpacing("8"),
    paddingHorizontal: getSpacing("12"),
  },
  helperButtonLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: theme.typography.scale.sm,
    textAlign: "center",
  },
});

