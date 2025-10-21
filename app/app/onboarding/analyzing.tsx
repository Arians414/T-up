import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { getColor, getSpacing, theme, useTheme } from "@/theme";

const SCREEN_PADDING = getSpacing("pagePadding");

export default function AnalyzingScreen() {
  const router = useRouter();
  const themeTokens = useTheme();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace("/onboarding/profile-ready");
    }, 1200);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: getColor("background"),
          padding: SCREEN_PADDING,
        },
      ]}
    >
      <ActivityIndicator size="large" color={themeTokens.colors.accent.brand} />
      <Text
        style={[
          styles.text,
          {
            color: themeTokens.colors.text.primary,
            fontFamily: "Inter_500Medium",
          },
        ]}
      >
        Analyzing your data...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: getSpacing("16"),
  },
  text: {
    fontSize: theme.typography.scale.lg,
  },
});
