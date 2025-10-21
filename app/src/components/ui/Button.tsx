import { ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";

import { getColor, getRadius, getSpacing, theme } from "@/theme";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = Omit<PressableProps, "style"> & {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  dimDisabled?: boolean;
  style?: PressableProps["style"];
};

const BUTTON_HEIGHT = theme.size.buttonHeight;
const CONTROL_RADIUS = getRadius("xl");
const HORIZONTAL_PADDING = getSpacing("16");
const VERTICAL_PADDING = getSpacing("12");
const DISABLED_OPACITY = theme.opacity.disabled;

const variantStyles: Record<ButtonVariant, { background: string; text: string; borderColor?: string }> = {
  primary: {
    background: getColor("accent.brand"),
    text: getColor("background"),
  },
  secondary: {
    background: getColor("surface.button"),
    text: getColor("text.primary"),
    borderColor: getColor("border.muted"),
  },
};

export const Button = ({
  label,
  variant = "primary",
  loading = false,
  disabled,
  dimDisabled = true,
  style,
  onPress,
  ...props
}: ButtonProps) => {
  const palette = variantStyles[variant];
  const isDisabled = disabled || loading;

  const resolveStyle: PressableProps["style"] = (state) => {
    const dynamicStyle: ViewStyle = {
      backgroundColor: palette.background,
      opacity: isDisabled && dimDisabled ? DISABLED_OPACITY : state.pressed ? 0.9 : 1,
      borderRadius: CONTROL_RADIUS,
      borderColor: palette.borderColor,
      borderWidth: palette.borderColor ? StyleSheet.hairlineWidth : 0,
      paddingHorizontal: HORIZONTAL_PADDING,
      paddingVertical: VERTICAL_PADDING,
    };

    const external = typeof style === "function" ? style(state) : style;

    return [styles.base, dynamicStyle, external].filter(Boolean) as StyleProp<ViewStyle>;
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading || undefined }}
      hitSlop={8}
      style={resolveStyle}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    height: BUTTON_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: theme.typography.scale.lg,
    letterSpacing: 0.2,
  },
});
