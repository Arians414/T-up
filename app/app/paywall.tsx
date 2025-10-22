import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import paywallConfig from "@config/paywall.config.json";
import copy from "@copy/en.json";
import { Button, Card, Progress } from "@/components/ui";
import { useAppState } from "@/state/appState";
import { useIntakeState } from "@/state/intakeState";
import { supabase } from "@/lib/supabase";
import { get, post } from "@/lib/functionsClient";
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
  const {
    startTrial,
    hasTrialStarted,
    isHydrating,
    resetAppState,
    setWeeklyDueAt,
    refreshEntitlement,
  } = useAppState();
  const { part2Completed, getNextStepIndex, reset } = useIntakeState();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trialCtaLabel = useMemo(() => `Start ${paywallConfig.trialDays}-day trial`, []);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.log("[paywall] failed to read session", error.message);
        return;
      }
      if (data.session?.access_token) {
        console.log("[paywall] ACCESS TOKEN", data.session.access_token);
      } else {
        console.log("[paywall] session is null");
      }
    });
  }, []);

  const handleStartTrial = useCallback(async () => {
    if (isSubmitting || isHydrating || hasTrialStarted) {
      return;
    }

    setIsSubmitting(true);
    try {
      const tz = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
        } catch {
          return "UTC";
        }
      })();

      let jwt: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        jwt = data.session?.access_token ?? null;
      } catch {
        jwt = null;
      }

      let nextWeekDueFromServer: string | undefined;
      if (jwt) {
        try {
          const trialResponse = await post("/dev_start_trial", { timezone: tz }, jwt);
          if (trialResponse && typeof trialResponse === "object") {
            const serverDue = (trialResponse as Record<string, unknown>).next_week_due_at;
            if (typeof serverDue === "string") {
              nextWeekDueFromServer = serverDue;
            }
          }
        } catch {
          // ignore
        }
      }

      await startTrial();
      if (nextWeekDueFromServer) {
        await setWeeklyDueAt(nextWeekDueFromServer);
      }
      if (!part2Completed) {
        const next = getNextStepIndex(2);
        router.replace(`/onboarding2/q/${next}`);
      } else {
        router.replace("/(tabs)/home");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    getNextStepIndex,
    hasTrialStarted,
    isHydrating,
    isSubmitting,
    part2Completed,
    router,
    startTrial,
    setWeeklyDueAt,
  ]);

  const handleDevRestart = useCallback(async () => {
    await reset();
    await resetAppState();
    router.replace('/onboarding');
  }, [reset, resetAppState, router]);

  const handleDevSkipToIntakeTwo = useCallback(async () => {
    await startTrial();
    const next = getNextStepIndex(2);
    router.replace(`/onboarding2/q/${next}`);
  }, [getNextStepIndex, router, startTrial]);

  const handleDevStartTrial = useCallback(async () => {
    await startTrial();
    router.replace('/onboarding2/q/0');
  }, [router, startTrial]);

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
              - {item}
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
              {paywallConfig.trialDays}-day trial � cancel anytime
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

      {__DEV__ && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: getSpacing('3') }}>
          <View style={{ width: '48%' }}>
            <Button label="Start trial (dev)" variant="secondary" onPress={handleDevStartTrial} />
          </View>
          <View style={{ width: '48%' }}>
            <Button label="Restart onboarding" variant="secondary" onPress={handleDevRestart} />
          </View>
          <View style={{ width: '48%' }}>
            <Button label="Skip to intake 2" variant="secondary" onPress={handleDevSkipToIntakeTwo} />
          </View>
          <View style={{ width: '48%' }}>
            <Button label="Open Sign Up" variant="secondary" onPress={() => router.push('/auth/sign-up')} />
          </View>
          <View style={{ width: '48%' }}>
            <Button label="Open Sign In" variant="secondary" onPress={() => router.push('/auth/sign-in')} />
          </View>
        </View>
      )}

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
