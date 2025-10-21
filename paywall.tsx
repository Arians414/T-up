import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import paywallConfig from "@config/paywall.config.json";
import copy from "@copy/en.json";
import { Button, Card, Progress } from "@/components/ui";
import { useIntakeState } from "@/state/intakeState";
import { useAppState } from "@/state/appState";
import { getColor, getSpacing, theme, useTheme } from "@/theme";

const bullets = [
  "Dial in daily wins that move testosterone naturally.",
  "Weekly recalibration anchored to your data.",
  "Evidence-based plan tuned over the 8-week arc.",
];

const SCREEN_PADDING = getSpacing("pagePadding");
const SECTION_GAP = getSpacing("sectionGap");
const LEGAL_GAP = getSpacing("12");
const CARD_GAP = getSpacing("16");
const PROGRESS_HEIGHT = getSpacing("6");

export default function PaywallScreen() {
  const themeTokens = useTheme();
  const router = useRouter();
  const { startTrial, hasTrialStarted, isHydrating } = useAppState();
  const { part2Completed, getNextStepIndex } = useIntakeState();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trialCtaLabel = useMemo(() => `Start ${paywallConfig.trialDays}-day trial`, []);

  const handleStartTrial = useCallback(async () => {
    if (isSubmitting || isHydrating || hasTrialStarted) {
      return;
    }

    setIsSubmitting(true);
    try {
      await startTrial();
      router.replace("/(tabs)/home");
    } finally {
      setIsSubmitting(false);
    }
  }, [hasTrialStarted, isHydrating, isSubmitting, router, startTrial]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: getColor("background"),
          paddingHorizontal: SCREEN_PADDING,
          paddingTop: getSpacing("40"),
          paddingBottom: getSpacing("32"),
        },
      ]}
    >
      <View style={[styles.header, { gap: SECTION_GAP }]}>
        <Text
          style={[
            styles.title,
            {
              color: themeTokens.colors.text.primary,
              fontFamily: "Inter_700Bold",
              fontSize: theme.typography.scale.xxl,
            },
          ]}
        >
          {copy.brand.tagline}
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              color: themeTokens.colors.text.secondary,
              fontFamily: "Inter_400Regular",
            },
          ]}
        >
          {copy.brand.promise}
        </Text>
      </View>

      <Card style={{ gap: CARD_GAP }}>
        <View style={{ gap: getSpacing("8") }}>
          <Text
            style={[
              styles.cardTitle,
              {
                color: themeTokens.colors.text.primary,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
          >
            What you unlock
          </Text>
          {bullets.map((item) => (
            <Text
              key={item}
              style={[
                styles.bullet,
                {
                  color: themeTokens.colors.text.secondary,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              ג€¢ {item}
            </Text>
          ))}
        </View>

        <View style={{ gap: getSpacing("8") }}>
          <View style={styles.priceRow}>
            <Text
              style={[
                styles.price,
                {
                  color: getColor("accent.brand"),
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
            >
              {paywallConfig.priceText}
            </Text>
            <Text
              style={[
                styles.trialDays,
                {
                  color: themeTokens.colors.text.tertiary,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              {paywallConfig.trialDays}-day trial ֲ· cancel anytime
            </Text>
          </View>
          <Progress value={0} height={PROGRESS_HEIGHT} />
        </View>

        <Button
          label={trialCtaLabel}
          onPress={handleStartTrial}
          loading={isSubmitting}
          disabled={isHydrating}
        />
      </Card>

      <View style={[styles.legal, { gap: LEGAL_GAP }]}>
        {paywallConfig.legalLinks.map((label) => (
          <Text
            key={label}
            style={[
              styles.legalLink,
              {
                color: themeTokens.colors.text.muted,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "flex-start",
  },
  title: {
    letterSpacing: 0.2,
    lineHeight: theme.typography.scale.xxl * theme.typography.lineHeight.snug,
  },
  subtitle: {
    lineHeight: theme.typography.scale.lg * theme.typography.lineHeight.normal,
  },
  cardTitle: {
    letterSpacing: 0.1,
  },
  bullet: {
    fontSize: theme.typography.scale.md,
    lineHeight: theme.typography.scale.md * theme.typography.lineHeight.normal,
  },
  priceRow: {
    gap: getSpacing("6"),
  },
  price: {
    fontSize: theme.typography.scale.lg,
  },
  trialDays: {
    fontSize: theme.typography.scale.sm,
  },
  legal: {
    alignItems: "center",
  },
  legalLink: {
    textDecorationLine: "underline",
    fontSize: theme.typography.scale.sm,
  },
});
