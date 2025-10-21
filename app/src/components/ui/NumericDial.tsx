import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";

import { Card } from "./Card";
import { getColor, getSpacing, theme } from "@/theme";

type NumericDialProps = {
  value: number | null | undefined;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  prompt?: string;
  placeholder?: string;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  allowEmpty?: boolean;
};

const CARD_PADDING = getSpacing("32");
const PROMPT_COLOR = getColor("text.secondary");
const VALUE_COLOR = getColor("text.primary");
const UNIT_COLOR = getColor("text.secondary");
const PLACEHOLDER_COLOR = getColor("text.tertiary");

const sanitize = (text: string) => text.replace(/[^0-9.,-]/g, "");

const toNumber = (sanitized: string): number | null => {
  if (sanitized === "" || sanitized === "-" || sanitized === "." || sanitized === "-." || sanitized === "-0." || sanitized === "-0") {
    return null;
  }
  const normalized = sanitized.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const inferPrecision = (step: number) => {
  if (step <= 0) {
    return 0;
  }
  const parts = step.toString().split(".");
  return parts[1]?.length ?? 0;
};

const formatValue = (value: number, precision: number) => {
  if (precision <= 0) {
    return String(Math.round(value));
  }
  return value.toFixed(precision);
};

export const NumericDial = ({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  prompt = "Enter amount",
  placeholder = "0",
  footer,
  style,
  testID,
  allowEmpty = false,
}: NumericDialProps) => {
  const inputRef = useRef<TextInput>(null);
  const precision = useMemo(() => inferPrecision(step), [step]);
  const resolvedValue = useMemo(() => clampNumber(value ?? 0, min, max), [value, min, max]);
  const [textValue, setTextValue] = useState(() => formatValue(resolvedValue, precision));

  useEffect(() => {
    setTextValue(formatValue(resolvedValue, precision));
  }, [precision, resolvedValue]);

  const commitValue = useCallback(
    (raw: string) => {
      const sanitized = sanitize(raw);
      if (sanitized.length === 0) {
        if (allowEmpty) {
          setTextValue("");
          onChange(null);
          return;
        }
        const fallback = clampNumber(0, min, max);
        setTextValue(formatValue(fallback, precision));
        onChange(fallback);
        return;
      }

      const numeric = toNumber(sanitized);
      if (numeric === null) {
        setTextValue(formatValue(resolvedValue, precision));
        return;
      }

      const bounded = clampNumber(sanitizeStep(numeric, step, min), min, max);
      setTextValue(formatValue(bounded, precision));
      onChange(bounded);
    },
    [allowEmpty, max, min, onChange, precision, resolvedValue, step],
  );

  const handleBlur = useCallback(() => {
    commitValue(textValue);
  }, [commitValue, textValue]);

  const handleChangeText = useCallback(
    (next: string) => {
      const sanitized = sanitize(next);
      setTextValue(sanitized);

      if (sanitized.length === 0) {
        if (allowEmpty) {
          onChange(null);
        } else {
          onChange(clampNumber(0, min, max));
        }
        return;
      }

      const numeric = toNumber(sanitized);
      if (numeric === null) {
        return;
      }

  const snapped = sanitizeStep(numeric, step, min);
  const bounded = clampNumber(snapped, min, max);
  onChange(bounded);
    },
    [allowEmpty, max, min, onChange],
  );

  const handlePress = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const display = textValue.length === 0 ? placeholder : textValue;
  const displayColor = textValue.length === 0 ? PLACEHOLDER_COLOR : VALUE_COLOR;

  return (
    <Card style={[styles.card, style]} padding={CARD_PADDING} testID={testID}>
      <View style={styles.body}>
        <Text style={[styles.prompt, { color: PROMPT_COLOR }]}>{prompt}</Text>
        <Pressable accessibilityRole="button" onPress={handlePress} style={styles.dial}>
          <Text style={[styles.value, { color: displayColor }]}>{display}</Text>
          {unit ? (
            <Text style={[styles.unit, { color: UNIT_COLOR }]}>{unit}</Text>
          ) : null}
        </Pressable>
        <TextInput
          ref={inputRef}
          value={textValue}
          onChangeText={handleChangeText}
          onBlur={handleBlur}
          onSubmitEditing={handleBlur}
          keyboardType={precision > 0 ? "decimal-pad" : "number-pad"}
          returnKeyType="done"
          style={styles.hiddenInput}
          blurOnSubmit
        />
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Card>
  );
};

const sanitizeStep = (value: number, step: number, min: number) => {
  if (step <= 0) {
    return value;
  }
  const offset = value - min;
  const intervals = Math.round(offset / step);
  return intervals * step + min;
};

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
  },
  body: {
    gap: getSpacing("16"),
    alignItems: "center",
  },
  prompt: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
    textAlign: "center",
  },
  dial: {
    alignItems: "center",
    justifyContent: "center",
    gap: getSpacing("4"),
    minWidth: 200,
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 60,
    letterSpacing: -0.5,
  },
  unit: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
    letterSpacing: 0.2,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 0,
    height: 0,
  },
  footer: {
    alignSelf: "stretch",
    gap: getSpacing("12"),
  },
});