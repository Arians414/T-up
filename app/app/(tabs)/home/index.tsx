import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useRouter } from 'expo-router';

import { SafeAreaScreen } from '@/ui';
import { Card } from '@/components/ui';
import { useAppState } from '@/state/appState';
import { useWeeklyState } from '@/state/weekly';
import { supabase } from '@/lib/supabase';
import { getColor, getRadius, getSpacing, theme, useTheme } from '@/theme';

const SECTION_GAP = getSpacing('sectionGap');
const TRIAL_DURATION_WEEKS = 8;

const focusTasks = [
  'Log daily nutrition',
  'Mindfulness exercise',
  'Hydration check-in',
];

const quote = '"The only bad workout is the one that didn\'t happen."';

const MS_IN_MINUTE = 60 * 1000;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;
const MS_IN_DAY = 24 * MS_IN_HOUR;

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const getLocalDateParts = (date: Date, timeZone: string): LocalDateParts => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
};

const zonedTimeMs = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const isoString = `${lookup('year')}-${lookup('month')}-${lookup('day')}T${lookup('hour')}:${lookup('minute')}:${lookup('second')}Z`;
  return Date.parse(isoString);
};

const computeAvailabilityLabel = (dueIso?: string, timeZone?: string) => {
  if (!dueIso) {
    return '';
  }
  const zone = timeZone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dueDate = new Date(dueIso);
  if (Number.isNaN(dueDate.getTime())) {
    return '';
  }
  const now = new Date();
  let remainingMs: number;
  try {
    const dueMs = zonedTimeMs(dueDate, zone);
    const nowMs = zonedTimeMs(now, zone);
    remainingMs = dueMs - nowMs;
  } catch {
    remainingMs = dueDate.getTime() - now.getTime();
  }
  if (!Number.isFinite(remainingMs)) {
    return '';
  }
  if (remainingMs <= 0) {
    return 'Weekly check-in is available';
  }
  const dueParts = getLocalDateParts(dueDate, zone);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: zone }).format(dueDate);
  const hoursLabel = dueParts.hour.toString().padStart(2, '0');
  const minutesLabel = dueParts.minute.toString().padStart(2, '0');
  return `Available on ${weekday} ${hoursLabel}:${minutesLabel}`;
};

const deriveFallbackDue = (trialStartedAt?: string) => {
  if (!trialStartedAt) {
    return undefined;
  }
  const start = new Date(trialStartedAt);
  if (Number.isNaN(start.getTime())) {
    return undefined;
  }
  const next = new Date(start);
  next.setDate(next.getDate() + 7);
  next.setHours(19, 0, 0, 0);
  return next.toISOString();
};

const computeWeekIndex = (trialStartedAt?: string) => {
  if (!trialStartedAt) {
    return 1;
  }
  const start = new Date(trialStartedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
  return Math.max(diffWeeks + 1, 1);
};

const ProgressChart = ({ data }: { data: number[] }) => {
  if (data.length === 0) {
    return null;
  }
  const width = 220;
  const height = 120;
  const padding = 16;
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const range = maxValue - minValue || 1;

  const points = data
    .map((value, index) => {
      const x = padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const circles = data.map((value, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
    return <Circle key={value + index} cx={x} cy={y} r={4} fill={getColor('accent.brand')} />;
  });

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={getColor('accent.brand')} strokeWidth={2} />
      {circles}
    </Svg>
  );
};

export default function HomeScreen() {
  const themeTokens = useTheme();
  const router = useRouter();
  const { trialStartedAt, weeklyDueAt, lastResult, setLastResult, setWeeklyDueAt } = useAppState();
  const { latestT, getSummary } = useWeeklyState();
  const [profileTimezone, setProfileTimezone] = useState<string | undefined>();
  const [profileWeekNumber, setProfileWeekNumber] = useState<number | undefined>(undefined);
  const [countdownLabel, setCountdownLabel] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const syncProfile = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session || cancelled) {
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('timezone, next_week_due_at, current_week_number, last_result')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error || !profile || cancelled) {
          return;
        }

        const timezoneValue =
          typeof profile.timezone === 'string' && profile.timezone.trim().length > 0
            ? profile.timezone.trim()
            : undefined;
        if (cancelled) {
          return;
        }
        setProfileTimezone(timezoneValue);
        const currentWeekNumber =
          typeof profile.current_week_number === 'number' && profile.current_week_number > 0
            ? profile.current_week_number
            : undefined;
        setProfileWeekNumber(currentWeekNumber);

        const serverDue =
          typeof profile.next_week_due_at === 'string' && profile.next_week_due_at
            ? profile.next_week_due_at
            : undefined;

        if (!cancelled) {
          if (serverDue && serverDue !== weeklyDueAt) {
            await setWeeklyDueAt(serverDue);
          } else if (!serverDue && !weeklyDueAt && currentWeekNumber == null) {
            const fallbackDue = deriveFallbackDue(trialStartedAt);
            if (fallbackDue) {
              await setWeeklyDueAt(fallbackDue);
            }
          }
        }

        if (profile.last_result && !cancelled) {
          const raw =
            typeof profile.last_result === 'string'
              ? JSON.parse(profile.last_result)
              : profile.last_result;
          const scoreValue = Number(raw?.score ?? NaN);
          if (Number.isFinite(scoreValue)) {
            const potentialValue = raw?.potential;
            const normalizedPotential =
              typeof potentialValue === 'number'
                ? potentialValue
                : potentialValue === null
                ? null
                : undefined;
            const generatedAt =
              typeof raw?.generated_at === 'string'
                ? raw.generated_at
                : typeof raw?.generatedAt === 'string'
                ? raw.generatedAt
                : undefined;
            const modelVersion =
              typeof raw?.model_version_at_score === 'string'
                ? raw.model_version_at_score
                : typeof raw?.modelVersion === 'string'
                ? raw.modelVersion
                : undefined;
            const source =
              (raw?.source as 'intake_p2' | 'weekly_checkin' | 'recalc') ??
              lastResult?.source ??
              undefined;

            if (
              !lastResult ||
              lastResult.score !== scoreValue ||
              lastResult.potential !== normalizedPotential ||
              lastResult.generatedAt !== generatedAt
            ) {
              await setLastResult({
                score: scoreValue,
                potential: normalizedPotential,
                generatedAt,
                modelVersion,
                source,
                recordedAt: Date.now(),
              });
            }
          }
        }
      } catch {
        // ignore sync errors
      }
    };

    void syncProfile();

    return () => {
      cancelled = true;
    };
  }, [lastResult, setLastResult, setProfileWeekNumber, setWeeklyDueAt, trialStartedAt, weeklyDueAt]);

  useEffect(() => {
    const effectiveDue =
      weeklyDueAt ?? (profileWeekNumber == null ? deriveFallbackDue(trialStartedAt) : undefined);
    const label = computeAvailabilityLabel(effectiveDue, profileTimezone);
    setCountdownLabel(label);
  }, [profileTimezone, profileWeekNumber, trialStartedAt, weeklyDueAt]);

  const fallbackWeekIndex = useMemo(() => computeWeekIndex(trialStartedAt), [trialStartedAt]);
  const displayWeekNumber = useMemo(() => {
    if (typeof profileWeekNumber === 'number' && profileWeekNumber > 0) {
      return Math.min(profileWeekNumber, TRIAL_DURATION_WEEKS);
    }
    if (weeklyDueAt) {
      return 1;
    }
    return Math.min(fallbackWeekIndex, TRIAL_DURATION_WEEKS);
  }, [profileWeekNumber, fallbackWeekIndex, weeklyDueAt]);

  const strengthSummary = getSummary('strengthSessions');
  const cardioSummary = getSummary('cardioMin');

  const progressSeries = useMemo(() => {
    const base = 520;
    const latest = lastResult?.score ?? latestT ?? 540;
    const mid = (base + latest) / 2;
    return [base, Math.round(mid), latest];
  }, [lastResult?.score, latestT]);

  const handleOpenPlan = () => {
    router.push('/(tabs)/plan');
  };

  

  return (
    <SafeAreaScreen>
      <View style={{ gap: SECTION_GAP }}>
        <Text
          style={{
            color: themeTokens.colors.accent.brand,
            fontFamily: 'Inter_500Medium',
            textAlign: 'center',
            fontSize: theme.typography.scale.sm,
          }}
        >
          {countdownLabel || 'Weekly check-in status unavailable'}
        </Text>

        <Card style={[styles.card, { gap: getSpacing('16') }]}> 
          <View style={styles.cardHeaderRow}>
            <Text
              style={{
                color: themeTokens.colors.text.primary,
                fontFamily: 'Inter_600SemiBold',
                fontSize: theme.typography.scale.lg,
              }}
            >
              T-Score Overview
            </Text>
            <Text
              style={{
                color: themeTokens.colors.text.secondary,
                fontFamily: 'Inter_500Medium',
                fontSize: theme.typography.scale.sm,
              }}
            >
              Week {displayWeekNumber} of {TRIAL_DURATION_WEEKS}
            </Text>
          </View>

          <View style={{ gap: getSpacing('4') }}>
            <Text
              style={{
                color: themeTokens.colors.accent.brand,
                fontFamily: 'Inter_700Bold',
                fontSize: 44,
                letterSpacing: 0.4,
              }}
            >
              {lastResult?.score ? `${lastResult.score} ng/dL` : (latestT ? `${latestT} ng/dL` : '540 ng/dL')}
            </Text>
            <Text
              style={{
                color: themeTokens.colors.text.secondary,
                fontFamily: 'Inter_500Medium',
              }}
            >
              Potential: {lastResult?.potential ? `+${Math.round(lastResult.potential * 100)}%` : '+12–18%'} ({TRIAL_DURATION_WEEKS} weeks)
            </Text>
          </View>

          <View style={{ gap: getSpacing('12') }}>
            <Text
              style={{
                color: themeTokens.colors.text.primary,
                fontFamily: 'Inter_600SemiBold',
                fontSize: theme.typography.scale.md,
              }}
            >
              Progress Overview
            </Text>
            <ProgressChart data={progressSeries} />
          </View>
        </Card>

        <Card style={[styles.card, { gap: getSpacing('12') }]}> 
          <View style={styles.cardHeaderRow}>
            <Text
              style={{
                color: themeTokens.colors.text.primary,
                fontFamily: 'Inter_600SemiBold',
                fontSize: theme.typography.scale.lg,
              }}
            >
              Today�s Focus
            </Text>
            <Text
              style={{
                color: themeTokens.colors.accent.brand,
                fontFamily: 'Inter_500Medium',
              }}
              onPress={handleOpenPlan}
            >
              Open Plan �
            </Text>
          </View>
          <View style={{ gap: getSpacing('8') }}>
            {focusTasks.map((task) => (
              <Text
                key={task}
                style={{
                  color: themeTokens.colors.text.primary,
                  fontFamily: 'Inter_400Regular',
                }}
              >
                {task}
              </Text>
            ))}
          </View>
        </Card>

        <Card style={[styles.card, { gap: getSpacing('8') }]}> 
          <Text
            style={{
              color: themeTokens.colors.text.primary,
              fontFamily: 'Inter_600SemiBold',
              fontSize: theme.typography.scale.lg,
            }}
          >
            Weekly Snapshot
          </Text>
          <View style={styles.snapshotRow}>
            <Text style={styles.snapshotLabel}>Strength</Text>
            <Text style={styles.snapshotValue}>
              {typeof strengthSummary.overall === 'number' ? `${strengthSummary.overall} / 2 sessions` : '0 / 2 sessions'}
            </Text>
          </View>
          <View style={[styles.snapshotRow, styles.rowDivider]}> 
            <Text style={styles.snapshotLabel}>Cardio</Text>
            <Text style={styles.snapshotValue}>
              {typeof cardioSummary.overall === 'number' ? `${cardioSummary.overall} / 150 min` : '0 / 150 min'}
            </Text>
          </View>
        </Card>

        <Card style={[styles.card, styles.quoteCard]}> 
          <Text
            style={{
              color: themeTokens.colors.text.secondary,
              fontFamily: 'Inter_400Regular',
              fontStyle: 'italic',
            }}
          >
            {quote}
          </Text>
        </Card>
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
    padding: getSpacing('20'),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  snapshotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: getSpacing('8'),
  },
  snapshotLabel: {
    color: getColor('text.primary'),
    fontFamily: 'Inter_500Medium',
    fontSize: theme.typography.scale.md,
  },
  snapshotValue: {
    color: getColor('text.secondary'),
    fontFamily: 'Inter_500Medium',
    fontSize: theme.typography.scale.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: getColor('border.subtle'),
  },
  quoteCard: {
    alignItems: 'center',
  },
});
