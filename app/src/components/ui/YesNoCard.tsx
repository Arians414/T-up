import { memo } from "react";
import { Pressable, PressableStateCallbackType, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { Card } from "./Card";
import { getColor, getRadius, getSpacing, theme } from "@/theme";

type YesNoCardProps = {
  value?: boolean | null;
  onChange: (next: boolean) => void;
  prompt?: string;
  yesLabel?: string;
  noLabel?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
};

const PROMPT_COLOR = getColor("text.secondary");
const BASE_BORDER = getColor("border.muted");
const SELECTED_BORDER = getColor("accent.brand");
const SELECTED_BACKGROUND = getColor("accent.selectedOverlay");
const PRESS_BACKGROUND = getColor("surface.base");

export const YesNoCard = memo(
  ({
    value = null,
    onChange,
    prompt = "Choose one",
    yesLabel = "Yes",
    noLabel = "No",
    style,
    disabled = false,
    testID,
  }: YesNoCardProps) => {
    const handlePress = (next: boolean) => {
      if (disabled) {
        return;
      }
      onChange(next);
    };

    const renderPill = (label: string, nextValue: boolean) => {
      const selected = value === nextValue;
      const backgroundColor = selected ? SELECTED_BACKGROUND : "transparent";
      const borderColor = selected ? SELECTED_BORDER : BASE_BORDER;
      const textColor = selected ? getColor("text.onAccent") : getColor("text.primary");

      const pressableStyle = ({ pressed }: PressableStateCallbackType) => [
        styles.pill,
        {
          backgroundColor: pressed && !selected ? PRESS_BACKGROUND : backgroundColor,
          borderColor,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.9 : 1,
        },
      ];

      return (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityState={{ selected, disabled }}
          onPress={() => handlePress(nextValue)}
          style={pressableStyle}
          disabled={disabled}
          hitSlop={getSpacing("4")}
          testID={selected ? `${testID ?? "yesno"}-${label.toLowerCase()}-selected` : undefined}
        >
          <Text style={[styles.pillLabel, { color: textColor }]}>{label}</Text>
        </Pressable>
      );
    };

    return (
      <Card style={[styles.card, style]} testID={testID}>
        <View style={styles.stack}>
          <Text style={[styles.prompt, { color: PROMPT_COLOR }]}>{prompt}</Text>
          <View style={styles.row}>
            {renderPill(yesLabel, true)}
            {renderPill(noLabel, false)}
          </View>
        </View>
      </Card>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
  },
  stack: {
    gap: getSpacing("16"),
  },
  prompt: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    gap: getSpacing("12"),
  },
  pill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: getRadius("pill"),
    minHeight: getSpacing("44"),
    paddingVertical: getSpacing("12"),
    paddingHorizontal: getSpacing("16"),
  },
  pillLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: theme.typography.scale.md,
  },
});