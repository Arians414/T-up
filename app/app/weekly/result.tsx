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

export default function WeeklyResultScreen() {
  const router = useRouter();
  const themeTokens = useTheme();
  const { latestT, weeklyDueAt } = useWeeklyState();
  const dueLabel = useMemo(() => formatDateTime(weeklyDueAt), [weeklyDueAt]);

  const handleFinish = () => {
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaScreen scroll={false}>
      <View style={{ gap: SECTION_GAP, justifyContent: 'space-between', flex: 1 }}>
        <View style={{ gap: SECTION_GAP }}>
          <View style={{ gap: getSpacing('12') }}>
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
              Weekly complete
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
              Your new estimate is locked in and the next check-in is scheduled.
            </Text>
          </View>

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
                Latest estimate
              </Text>
              <Text
                style={[
                  styles.resultValue,
                  {
                    color: themeTokens.colors.text.primary,
                    fontFamily: 'Inter_700Bold',
                  },
                ]}
              >
                {latestT ? `${latestT} ng/dL` : 'Pending'}
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
                Next check-in
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
          </Card>
        </View>

        <Button label="Back to home" onPress={handleFinish} />
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
  resultValue: {
    fontSize: theme.typography.scale.xl,
    lineHeight: theme.typography.scale.xl * theme.typography.lineHeight.snug,
  },
});




