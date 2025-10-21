import { Pressable, PressableProps, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";

import { getColor, getRadius, getSpacing, theme } from "@/theme";

type ChipProps = Omit<PressableProps, "style"> & {
  label: string;
  selected?: boolean;
  style?: PressableProps["style"];
};

const CHIP_RADIUS = getRadius("pill");
const CHIP_PADDING_HORIZONTAL = getSpacing("16");
const CHIP_PADDING_VERTICAL = getSpacing("8");

const selectedStyles = {
  backgroundColor: getColor("accent.selectedOverlay"),
  borderColor: getColor("accent.brand"),
  textColor: getColor("text.onAccent"),
  borderWidth: 2,
};

const baseStyles = {
  backgroundColor: "transparent" as const,
  borderColor: getColor("border.muted"),
  textColor: getColor("text.primary"),
  borderWidth: StyleSheet.hairlineWidth,
};

export const Chip = ({ label, selected = false, style, ...props }: ChipProps) => {
  const palette = selected ? selectedStyles : baseStyles;

  const resolveStyle: PressableProps["style"] = (state) => {
    const dynamic: ViewStyle = {
      backgroundColor: palette.backgroundColor,
      borderColor: palette.borderColor,
      borderWidth: palette.borderWidth,
      opacity: state.pressed ? 0.88 : 1,
      borderRadius: CHIP_RADIUS,
    };

    const external = typeof style === "function" ? style(state) : style;
    return [styles.base, dynamic, external].filter(Boolean) as StyleProp<ViewStyle>;
  };

  return (
    <Pressable accessibilityRole="button" style={resolveStyle} {...props}>
      <Text style={[styles.label, { color: palette.textColor }]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: CHIP_PADDING_HORIZONTAL,
    paddingVertical: CHIP_PADDING_VERTICAL,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.sm,
    letterSpacing: 0.2,
  },
});