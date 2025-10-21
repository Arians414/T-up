import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SafeAreaScreen } from '@/ui';
import { Button, Card } from '@/components/ui';
import { useWeeklyState } from '@/state/weekly';
import { getColor, getRadius, getSpacing, theme, useTheme } from '@/theme';

const SECTION_GAP = getSpacing('sectionGap');

const formatDateTime = (iso?: string) => {
  if (!iso) {
    return 'Not scheduled';
  }
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return iso;
  }
};

export default function WeeklyIntroScreen() {
  const router = useRouter();
  const themeTokens = useTheme();
  const { weeklyDueAt, isWeeklyDue, latestT } = useWeeklyState();

  const dueLabel = useMemo(() => formatDateTime(weeklyDueAt), [weeklyDueAt]);

  const handleStart = () => {
    console.log('[weekly] start pressed');
    router.replace('/weekly/q/0');
  };

  return (
    <SafeAreaScreen>
      <View style={{ gap: SECTION_GAP }}>
        <Text
          style={[
            styles.heading,
            {
              color: themeTokens.colors.text.primary,
              fontFamily: 'Inter_700Bold',
              fontSize: theme.typography.scale.xxl,
            },
          ]}
        >
          Weekly check-in
        </Text>
        <Text
          style={[
            styles.body,
            {
              color: themeTokens.colors.text.secondary,
              fontFamily: 'Inter_400Regular',
            },
          ]}
        >
          Review the last seven days, lock in your data, and update your T projection.
        </Text>

        <Card style={[styles.card, { gap: getSpacing('12') }]}>
          <View style={{ gap: getSpacing('4') }}>
            <Text
              style={[
                styles.sectionLabel,
                {
                  color: themeTokens.colors.text.tertiary,
                  fontFamily: 'Inter_500Medium',
                },
              ]}
            >
              Next due
            </Text>
            <Text
              style={[
                styles.body,
                {
                  color: themeTokens.colors.text.primary,
                  fontFamily: 'Inter_600SemiBold',
                },
              ]}
            >
              {dueLabel}
            </Text>
          </View>

          <View style={{ gap: getSpacing('4') }}>
            <Text
              style={[
                styles.sectionLabel,
                {
                  color: themeTokens.colors.text.tertiary,
                  fontFamily: 'Inter_500Medium',
                },
              ]}
            >
              Latest estimate
            </Text>
            <Text
              style={[
                styles.body,
                {
                  color: themeTokens.colors.text.primary,
                  fontFamily: 'Inter_600SemiBold',
                },
              ]}
            >
              {latestT ? `${latestT} ng/dL` : 'Pending'}
            </Text>
          </View>
        </Card>
      </View>

      <View style={{ marginTop: 'auto', gap: getSpacing('12') }}>
        <Button label="Start weekly" onPress={handleStart} disabled={!isWeeklyDue} dimDisabled={false} />
        <Button label="Dev: Jump to intake" variant="secondary" onPress={() => router.push('/onboarding/q/0')} />
        {!isWeeklyDue ? (
          <Text
            style={{
              color: themeTokens.colors.text.tertiary,
              textAlign: 'center',
              fontFamily: 'Inter_400Regular',
              fontSize: theme.typography.scale.sm,
            }}
          >
            Opens when the countdown hits your next due time.
          </Text>
        ) : null}
      </View>
    </SafeAreaScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: getColor('surface.elev1'),
    borderRadius: getRadius('card'),
    borderColor: getColor('border.subtle'),
    borderWidth: StyleSheet.hairlineWidth,
  },
  heading: {
    lineHeight: theme.typography.scale.xxl * theme.typography.lineHeight.snug,
  },
  body: {
    fontSize: theme.typography.scale.md,
    lineHeight: theme.typography.scale.md * theme.typography.lineHeight.normal,
  },
  sectionLabel: {
    fontSize: theme.typography.scale.sm,
    letterSpacing: 0.3,
  },
});





