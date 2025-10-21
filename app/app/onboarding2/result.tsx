import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Button, Card, Progress } from "@/components/ui";
import { useAppState } from "@/state/appState";
import { supabase } from "@/lib/supabase";
import { get, post } from "@/lib/functionsClient";
import { getColor, getSpacing, theme, useTheme } from "@/theme";

const SCREEN_PADDING = getSpacing("pagePadding");
const SECTION_GAP = getSpacing("sectionGap");

const WEEK_ONE_ITEMS = [
  "Sleep 7+ hours, 5 nights",
  "Log daylight and activity",
  "Dial in protein + hydration",
];

type ServerResult = {
  score: number;
  potential?: number | null;
  generatedAt?: string;
  modelVersion?: string;
};

const ADMIN_LOG_EVENT_SECRET = process.env.EXPO_PUBLIC_ADMIN_LOG_EVENT_SECRET;

export default function OnboardingResult() {
  const router = useRouter();
  const themeTokens = useTheme();
  const { lastResult, setLastResult } = useAppState();
  const [isRouting, setIsRouting] = useState(false);

  const [serverResult, setServerResult] = useState<ServerResult | null>(
    lastResult
      ? {
        score: lastResult.score,
        potential: lastResult.potential,
        generatedAt: lastResult.generatedAt,
        modelVersion: lastResult.modelVersion,
      }
      : null,
  );

  useEffect(() => {
    if (!lastResult) {
      return;
    }
    setServerResult({
      score: lastResult.score,
      potential: lastResult.potential,
      generatedAt: lastResult.generatedAt,
      modelVersion: lastResult.modelVersion,
    });
  }, [lastResult]);

  useEffect(() => {
    if (serverResult) {
      return;
    }

    let isCancelled = false;

    const load = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("last_result")
          .maybeSingle();

        if (error || !profile?.last_result) {
          return;
        }

        const raw =
          typeof profile.last_result === "string"
            ? JSON.parse(profile.last_result)
            : profile.last_result;

        const score = Number(raw?.score ?? NaN);
        if (!Number.isFinite(score)) {
          return;
        }

        const potentialValue = raw?.potential;
        const nextResult: ServerResult = {
          score,
          potential:
            typeof potentialValue === "number"
              ? potentialValue
              : potentialValue === null
              ? null
              : undefined,
          generatedAt:
            typeof raw?.generated_at === "string"
              ? raw.generated_at
              : typeof raw?.generatedAt === "string"
              ? raw.generatedAt
              : undefined,
          modelVersion:
            typeof raw?.model_version_at_score === "string"
              ? raw.model_version_at_score
              : typeof raw?.modelVersion === "string"
              ? raw.modelVersion
              : undefined,
        };

        if (isCancelled) {
          return;
        }

        setServerResult(nextResult);
        await setLastResult({
          score: nextResult.score,
          potential: nextResult.potential,
          generatedAt: nextResult.generatedAt,
          modelVersion: nextResult.modelVersion,
          source: (raw?.source as "intake_p2" | "weekly_checkin" | "recalc") ?? "intake_p2",
          recordedAt: Date.now(),
        });
      } catch {
        // silent failure
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [serverResult, setLastResult]);

  const displayScore = useMemo(() => {
    if (!serverResult) {
      return "--";
    }
    return `${Math.round(serverResult.score)} ng/dL`;
  }, [serverResult]);

  const potentialText = useMemo(() => {
    if (!serverResult) {
      return "Potential data pending";
    }
    if (serverResult.potential === null || serverResult.potential === undefined) {
      return "Potential data pending";
    }
    const pct = Math.round(serverResult.potential * 100);
    return `Potential: +${pct}% (8 weeks)`;
  }, [serverResult]);

  const handleContinue = useCallback(async () => {
    if (isRouting) {
      return;
    }

    setIsRouting(true);

    let entitlementStatus: string | null = "none";
    let routedTo: "/paywall" | "/(tabs)/home" = "/paywall";

    try {
      const { data } = await supabase.auth.getSession();
      let accessToken = data.session?.access_token ?? null;

      if (!accessToken) {
        try {
          const { data: refreshed } = await supabase.auth.refreshSession();
          accessToken = refreshed.session?.access_token ?? null;
        } catch {
          accessToken = null;
        }
      }

      if (accessToken) {
        try {
          const entitlement = await get<{ entitlement_status?: string }>("/get_entitlement", accessToken);
          const status =
            typeof entitlement?.entitlement_status === "string" ? entitlement.entitlement_status : "none";
          entitlementStatus = status;
          if (status === "trial" || status === "active") {
            routedTo = "/(tabs)/home";
          }
        } catch {
          entitlementStatus = "none";
        }
      }
    } catch {
      entitlementStatus = "none";
    } finally {
      router.replace(routedTo);

      if (ADMIN_LOG_EVENT_SECRET) {
        try {
          await post(
            "/log_event",
            {
              event: "nav_decision",
              source: "app",
              severity: "info",
              details: {
                from: "intake2_results",
                entitlement_status: entitlementStatus ?? "unknown",
                routedTo,
              },
            },
            undefined,
            { "X-Admin-Key": ADMIN_LOG_EVENT_SECRET },
          );
        } catch {
          // ignore logging failure
        }
      }

      setIsRouting(false);
    }
  }, [isRouting, router]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: getColor("background"),
          paddingHorizontal: SCREEN_PADDING,
          paddingVertical: SECTION_GAP,
        },
      ]}
    >
      <View style={{ gap: SECTION_GAP }}>
        <Text
          style={[
            styles.heading,
            {
              color: themeTokens.colors.text.primary,
              fontFamily: "Inter_700Bold",
              fontSize: theme.typography.scale.xxl,
            },
          ]}
        >
          Total T is {displayScore}
        </Text>
        <Text
          style={[
            styles.subhead,
            {
              color: themeTokens.colors.text.secondary,
              fontFamily: "Inter_500Medium",
            },
          ]}
        >
          {potentialText}
        </Text>
      </View>

      <Card style={{ gap: getSpacing("16") }}>
        <Text
          style={[
            styles.sectionTitle,
            {
              color: themeTokens.colors.text.primary,
              fontFamily: "Inter_600SemiBold",
            },
          ]}
        >
          Projection
        </Text>
        <View style={{ gap: getSpacing("8") }}>
          <Progress value={0.35} />
          <Text
            style={[
              styles.helper,
              {
                color: themeTokens.colors.text.muted,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            Week 0 -> Week 8 trajectory (placeholder)
          </Text>
        </View>
      </Card>

      <Card style={{ gap: getSpacing("12") }}>
        <Text
          style={[
            styles.sectionTitle,
            {
              color: themeTokens.colors.text.primary,
              fontFamily: "Inter_600SemiBold",
            },
          ]}
        >
          Week 1 at a glance
        </Text>
        {WEEK_ONE_ITEMS.map((item) => (
          <Text
            key={item}
            style={[
              styles.listItem,
              {
                color: themeTokens.colors.text.secondary,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            - {item}
          </Text>
        ))}
      </Card>

      <Button label="Continue to app" onPress={handleContinue} loading={isRouting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: SECTION_GAP,
  },
  heading: {
    lineHeight: theme.typography.scale.xxl * theme.typography.lineHeight.snug,
  },
  subhead: {
    fontSize: theme.typography.scale.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.scale.lg,
  },
  helper: {
    fontSize: theme.typography.scale.sm,
  },
  listItem: {
    fontSize: theme.typography.scale.md,
  },
});
