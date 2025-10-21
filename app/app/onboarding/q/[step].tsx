import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeftIcon } from "react-native-heroicons/outline";

import part1Schema from "@schemas/qa.intake.part1.v2.json";
import { SafeAreaScreen } from "@/ui";
import { Card, Button, Chips, NumericDial, SliderField, YesNoCard } from "@/components/ui";
import {
  useIntakeState,
  shouldDisplayQuestion,
  extractQuestions,
  type DependsOnDefinition,
  type IntakeAnswers,
} from "@/state/intakeState";
import { getColor, getRadius, getSpacing, theme, useTheme } from "@/theme";
import { post } from "@/lib/functionsClient";
import { getOrCreateInstallId } from "@/lib/installId";
import {
  JEANS_WAIST_SIZES,
  convertJeansSizeToCm,
  type MeasurementUnitPreference,
  normalizeMeasurementAnswers,
} from "@/lib/measurement";

const QUESTIONS = extractQuestions(part1Schema) as Question[];

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

const JEANS_SIZE_OPTIONS = JEANS_WAIST_SIZES.map((size) => ({ label: size, value: size }));

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

const buildPart1Steps = (answers: IntakeAnswers): StepDefinition[] => {
  const steps: StepDefinition[] = [];

  for (const question of QUESTIONS) {
    if (!shouldDisplayQuestion(question, answers)) {
      continue;
    }

    switch (question.id) {
      case "age":
        steps.push({ kind: "age", question });
        break;
      case "height_cm": {
        const weightQuestion = QUESTIONS.find((q) => q.id === "weight_kg");
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

export default function OnboardingQuestion() {
  const router = useRouter();
  const { step } = useLocalSearchParams<{ step?: string }>();

  const themeTokens = useTheme();
  const { part1Answers, setAnswer, part1Completed, isHydrating } = useIntakeState();

  const steps = useMemo(() => buildPart1Steps(part1Answers), [part1Answers]);
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


  // Removed auto-navigation - user must press Next button to continue

  useEffect(() => {
    if (isHydrating) {
      return;
    }
    if (totalSteps === 0) {
      router.replace("/onboarding/analyzing");
      return;
    }
    if (stepIndex >= totalSteps) {
      const safeIndex = Math.max(totalSteps - 1, 0);
      router.replace(`/onboarding/q/${safeIndex}`);
    }
  }, [isHydrating, router, stepIndex, totalSteps]);

  useEffect(() => {
    if (!currentStep) {
      return;
    }
    if (currentStep.kind === "slider") {
      const { question, min } = currentStep;
      if (typeof part1Answers[question.id] !== "number") {
        setAnswer(1, question.id, min);
      }
    }
    if (currentStep.kind === "numeric") {
      const { question, min, defaultValue } = currentStep;
      if (typeof part1Answers[question.id] !== "number") {
        const fallback = typeof defaultValue === "number" ? defaultValue : min;
        setAnswer(1, question.id, fallback);
      }
    }
    if (currentStep.kind === "heightWeight") {
      const { height, weight } = currentStep;
      const existingHeight = part1Answers[height.id];
      const existingWeight = part1Answers[weight.id];
      if (typeof existingHeight !== "number") {
        setAnswer(1, height.id, getDefaultHeightCm(height));
      }
      if (typeof existingWeight !== "number") {
        setAnswer(1, weight.id, getDefaultWeightKg(weight));
      }
      const storedUnit = part1Answers["height_unit"] as HeightWeightUnit | undefined;
      if (storedUnit !== "metric" && storedUnit !== "imperial") {
        setAnswer(1, "height_unit", "metric");
      }
      const storedWeightUnit = part1Answers["weight_unit"] as HeightWeightUnit | undefined;
      if (storedWeightUnit !== "metric" && storedWeightUnit !== "imperial") {
        setAnswer(1, "weight_unit", "metric");
      }
    }
  }, [currentStep, part1Answers, setAnswer]);

  useEffect(() => {
    if (currentStep?.kind !== "waist") {
      return;
    }
    if (typeof part1Answers.waist_unknown !== "boolean") {
      setAnswer(1, "waist_unknown", false);
    }
  }, [currentStep, part1Answers, setAnswer]);

  if (!currentStep) {
    return null;
  }

  const handleBack = useCallback(() => {
    if (stepIndex <= 0) {
      router.replace("/onboarding");
      return;
    }
    const prev = Math.max(0, Math.min(stepIndex - 1, maxStepIndex));
    router.replace(`/onboarding/q/${prev}`);
  }, [router, stepIndex, maxStepIndex]);

  const persistAnonymousIntake = useCallback(async () => {
    try {
      const installId = await getOrCreateInstallId();
      const { payload } = normalizeMeasurementAnswers(part1Answers ?? {});
      const response = await post<{ submission_id: string }>("/save_anonymous_p1", {
        install_id: installId,
        payload,
        schema_version: "v1",
      });
      console.log("[fn] save_anonymous_p1 ok", response?.submission_id ?? response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[fn] save_anonymous_p1 error", message);
    }
  }, [part1Answers]);

  const goToNextStep = useCallback(() => {
    const isLast = stepIndex >= maxStepIndex;
    if (totalSteps === 0 || isLast) {
      router.replace("/onboarding/analyzing");
      return;
    }
    const next = stepIndex + 1; // don't clamp here
    router.replace(`/onboarding/q/${next}`);
  }, [router, stepIndex, maxStepIndex, totalSteps]);

  const handleNext = useCallback(() => {
    if (!currentStep) {
      return;
    }
    Keyboard.dismiss();
    const isLast = stepIndex >= maxStepIndex;
    if (isLast) {
      void persistAnonymousIntake();
    }
    goToNextStep();
  }, [currentStep, goToNextStep, persistAnonymousIntake, stepIndex, maxStepIndex]);

  const renderAge = (stepDef: Extract<StepDefinition, { kind: "age" }>) => {
    const existingBirthdate = dateFromIso(part1Answers["age_birthdate"]);
    const initialDate = existingBirthdate ?? defaultBirthdate(part1Answers["age"]);
    const [dateValue, setDateValue] = useState(initialDate);

    const ageNumber = typeof part1Answers["age"] === "number" ? (part1Answers["age"] as number) : undefined;
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
      setAnswer(1, stepDef.question.id, ageYears);
      setAnswer(1, "age_birthdate", clampedDate.toISOString());
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
    const unitPreference = (part1Answers["height_unit"] as HeightWeightUnit | undefined) ??
      ((part1Answers["weight_unit"] as HeightWeightUnit | undefined) ?? "metric");
    const [unit, setUnit] = useState<HeightWeightUnit>(unitPreference);

    useEffect(() => {
      setUnit(unitPreference);
    }, [unitPreference]);

    useEffect(() => {
      setAnswer(1, "height_unit", unit);
      setAnswer(1, "weight_unit", unit);
    }, [setAnswer, unit]);

    const heightValue = typeof part1Answers[stepDef.height.id] === "number"
      ? (part1Answers[stepDef.height.id] as number)
      : getDefaultHeightCm(stepDef.height);
    const weightValue = typeof part1Answers[stepDef.weight.id] === "number"
      ? (part1Answers[stepDef.weight.id] as number)
      : getDefaultWeightKg(stepDef.weight);

    const { feet, inches } = cmToFeetInches(heightValue);
    const pounds = kgToLbs(weightValue);

    const handleMetricHeightChange = (next: number) => {
      setAnswer(1, stepDef.height.id, next);
    };

    const handleMetricWeightChange = (next: number) => {
      setAnswer(1, stepDef.weight.id, next);
    };

    const handleFeetChange = (nextFeet: number) => {
      const clampedFeet = Math.max(IMPERIAL_FEET_OPTIONS[0], Math.min(IMPERIAL_FEET_OPTIONS.at(-1) ?? 7, nextFeet));
      const newCm = feetInchesToCm(clampedFeet, inches);
      setAnswer(1, stepDef.height.id, newCm);
    };

    const handleInchChange = (nextInches: number) => {
      const clampedInches = Math.max(0, Math.min(11, nextInches));
      const newCm = feetInchesToCm(feet, clampedInches);
      setAnswer(1, stepDef.height.id, newCm);
    };

    const handlePoundsChange = (nextPounds: number) => {
      const kg = lbsToKg(nextPounds);
      const min = typeof stepDef.weight.min === "number" ? stepDef.weight.min : 40;
      const max = typeof stepDef.weight.max === "number" ? stepDef.weight.max : 200;
      setAnswer(1, stepDef.weight.id, clampNumber(kg, min, max));
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
    const jeansSelection =
      typeof part1Answers.waist_size_jeans === "string" ? (part1Answers.waist_size_jeans as string) : null;
    const waistUnknown = part1Answers.waist_unknown === true;
    const rawWaist = part1Answers[stepDef.question.id];
    const waistCm = typeof rawWaist === "number" && Number.isFinite(rawWaist)
      ? Math.round(rawWaist)
      : null;

    const globalUnit =
      (part1Answers["height_unit"] as HeightWeightUnit | undefined) ??
      (part1Answers["weight_unit"] as HeightWeightUnit | undefined) ??
      undefined;
    const resolvedWaistUnit: MeasurementUnitPreference =
      globalUnit === "metric" ? "metric" : "imperial";

    const handleJeansChange = (next: unknown) => {
      if (typeof next !== "string") {
        return;
      }
      const normalized = next.toUpperCase();
      setAnswer(1, "waist_size_jeans", normalized);
      setAnswer(1, "waist_unknown", false);
      const cm = convertJeansSizeToCm(normalized);
      setAnswer(1, stepDef.question.id, cm);
      setAnswer(1, "waist_unit", resolvedWaistUnit);
    };

    const handleUnknown = () => {
      setAnswer(1, "waist_size_jeans", null);
      setAnswer(1, "waist_unknown", true);
      setAnswer(1, stepDef.question.id, null);
    };

    const helperCm = jeansSelection ? convertJeansSizeToCm(jeansSelection) : null;

    return (
      <Card style={styles.cardBody}>
        <View style={styles.cardStack}>
          <Text style={[styles.prompt, { color: getColor("text.secondary") }]}>Select your waist size</Text>
          <Chips
            options={JEANS_SIZE_OPTIONS}
            value={jeansSelection as string | null}
            onChange={handleJeansChange}
          />
          <Pressable accessibilityRole="button" onPress={handleUnknown} style={styles.waistUnknownButton}>
            <Text
              style={[
                styles.waistUnknownLabel,
                { color: waistUnknown ? getColor("text.primary") : getColor("text.secondary") },
              ]}
            >
              I don't know
            </Text>
          </Pressable>
          {helperCm !== null ? (
            <Text
              style={[
                styles.waistPreview,
                { color: getColor("text.secondary"), fontFamily: "Inter_500Medium" },
              ]}
            >
              ≈ {helperCm} cm
            </Text>
          ) : null}
        </View>
      </Card>
    );
  };

  const renderSlider = (stepDef: Extract<StepDefinition, { kind: "slider" }>) => {
    const value = typeof part1Answers[stepDef.question.id] === "number"
      ? (part1Answers[stepDef.question.id] as number)
      : stepDef.min;
    return (
      <SliderField
        value={value}
        min={stepDef.min}
        max={stepDef.max}
        step={stepDef.step}
        unit={stepDef.unit}
        prompt="Slide to set"
        onChange={(next) => setAnswer(1, stepDef.question.id, next)}
      />
    );
  };

  const renderChips = (stepDef: Extract<StepDefinition, { kind: "chips" }>) => {
    const current = part1Answers[stepDef.question.id];
    const options = stepDef.options.map((option) => ({ label: option, value: option }));
    return (
      <Chips
        options={options}
        value={(typeof current === "string" ? current : null) as string | null}
        onChange={(next) => {
          if (typeof next === "string") {
            setAnswer(1, stepDef.question.id, next);
          }
        }}
      />
    );
  };

  const renderChipsNumber = (stepDef: Extract<StepDefinition, { kind: "chipsNumber" }>) => {
    const current = part1Answers[stepDef.question.id];
    return (
      <Chips
        options={stepDef.options}
        value={typeof current === "number" ? (current as number) : null}
        onChange={(next) => {
          if (typeof next === "number") {
            setAnswer(1, stepDef.question.id, next);
          }
        }}
      />
    );
  };

  const renderNumeric = (stepDef: Extract<StepDefinition, { kind: "numeric" }>) => {
    const current = part1Answers[stepDef.question.id];
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
            setAnswer(1, stepDef.question.id, next);
          }
        }}
      />
    );
  };

  const renderYesNo = (stepDef: Extract<StepDefinition, { kind: "yesNo" }>) => {
    const current = part1Answers[stepDef.question.id];
    return (
      <YesNoCard
        value={typeof current === "boolean" ? (current as boolean) : null}
        onChange={(value) => {
          setAnswer(1, stepDef.question.id, value);
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
      case "waist": {
        const jeans = answers["waist_size_jeans"];
        const unknown = answers["waist_unknown"];
        return (typeof jeans === "string" && jeans.trim().length > 0) || unknown === true;
      }
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

  const nextDisabled = !isStepAnswered(currentStep, part1Answers);
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
  waistPreview: {
    textAlign: "center",
    marginTop: getSpacing("4"),
  },
  waistUnknownButton: {
    alignSelf: "center",
    paddingVertical: getSpacing("8"),
    paddingHorizontal: getSpacing("12"),
  },
  waistUnknownLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
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
});
