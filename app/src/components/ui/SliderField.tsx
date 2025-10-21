import Slider from "@react-native-community/slider";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { Card } from "./Card";
import { getColor, getSpacing, theme } from "@/theme";

type SliderFieldProps = {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  prompt?: string;
  unit?: string;
  formatter?: (value: number) => string;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const PROMPT_COLOR = getColor("text.secondary");
const VALUE_COLOR = getColor("text.primary");
const TICK_COLOR = getColor("text.tertiary");

const inferPrecision = (step?: number) => {
  if (!step) {
    return 0;
  }
  const text = step.toString();
  if (text.includes(".")) {
    return text.split(".")[1]?.length ?? 0;
  }
  return 0;
};

export const SliderField = ({ value, onChange, min, max, step = 1, prompt, unit, formatter, footer, style, testID }: SliderFieldProps) => {
  const precision = useMemo(() => inferPrecision(step), [step]);
  const format = useMemo(
    () => formatter ?? ((next: number) => (precision > 0 ? next.toFixed(precision) : String(Math.round(next)))),
    [formatter, precision],
  );

  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const formattedValue = `${format(displayValue)}${unit ? ` ${unit}` : ""}`;

  return (
    <Card style={[styles.card, style]} padding={getSpacing("28")} testID={testID}>
      <View style={styles.stack}>
        {prompt ? <Text style={[styles.prompt, { color: PROMPT_COLOR }]}>{prompt}</Text> : null}
        <Text style={[styles.value, { color: VALUE_COLOR }]}>{formattedValue}</Text>
        <Slider
          key={`slider-${min}-${max}`}
          value={value}
          minimumValue={min}
          maximumValue={max}
          step={step}
          onValueChange={onChange}
          minimumTrackTintColor={getColor("accent.brand")}
          maximumTrackTintColor={getColor("surface.progressRemainder")}
          thumbTintColor={getColor("accent.brand")}
          style={styles.slider}
        />
        <View style={styles.tickRow}>
          <Text style={[styles.tickLabel, { color: TICK_COLOR }]}>{format(min)}</Text>
          <Text style={[styles.tickLabel, { color: TICK_COLOR }]}>{format(max)}</Text>
        </View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
  },
  stack: {
    gap: getSpacing("16"),
    alignItems: "center",
  },
  prompt: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
    textAlign: "center",
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 34,
  },
  slider: {
    alignSelf: "stretch",
  },
  tickRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    justifyContent: "space-between",
  },
  tickLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.xs,
  },
  footer: {
    alignSelf: "stretch",
    gap: getSpacing("12"),
  },
});