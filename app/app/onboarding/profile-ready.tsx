import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Button, Card } from "@/components/ui";
import { getColor, getSpacing, theme, useTheme } from "@/theme";

const SCREEN_PADDING = getSpacing("pagePadding");
const SECTION_GAP = getSpacing("sectionGap");

export default function ProfileReady() {
  const router = useRouter();
  const themeTokens = useTheme();

  const handleContinue = () => {
    router.replace("/auth/sign-up");
  };

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
      <Card style={{ gap: getSpacing("16") }}>
        <Text
          style={[
            styles.title,
            {
              color: themeTokens.colors.text.primary,
              fontFamily: "Inter_600SemiBold",
            },
          ]}
        >
          Profile 70% ready
        </Text>
        <Text
          style={[
            styles.body,
            {
              color: themeTokens.colors.text.secondary,
              fontFamily: "Inter_400Regular",
            },
          ]}
        >
          Create your account to save progress, unlock your baseline, and start the 7-day trial.
        </Text>
        <Button label="Continue" onPress={handleContinue} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: theme.typography.scale.xl,
  },
  body: {
    fontSize: theme.typography.scale.md,
    lineHeight: theme.typography.scale.md * theme.typography.lineHeight.normal,
  },
});
