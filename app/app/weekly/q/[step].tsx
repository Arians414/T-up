import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftIcon } from 'react-native-heroicons/outline';

import weeklySchema from '@schemas/qa.weekly.v2.json';
import { SafeAreaScreen } from '@/ui';
import { Button, Card, Chip, Progress } from '@/components/ui';
import { LOG_METRIC_CONFIG, WEEKLY_SEQUENCE } from '@/constants/logMetrics';
import { useAppState } from '@/state/appState';
import { useIntakeState } from '@/state/intakeState';
import { useWeeklyState, type WeeklyMetricId, type WeeklySubmission } from '@/state/weekly';
import { supabase } from '@/lib/supabase';
import { post } from '@/lib/functionsClient';
import type { VapingLevel } from '@/state/logs';
import { getColor, getRadius, getSpacing, theme, useTheme } from '@/theme';

const HEADER_GAP = getSpacing('12');
const SECTION_GAP = getSpacing('24');
const ITEM_GAP = getSpacing('12');
const DAY_GAP = getSpacing('8');

const DEFAULT_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const METRIC_TO_ROW_ID: Partial<Record<WeeklyMetricId, string>> = {
  strengthSessions: 'rt_sessions_week',
  cardioMin: 'cardio_minutes',
  sleepHours: 'sleep_hours',
  proteinHit: 'protein_days',
  sunlight: 'sunlight_days',
  fastFoodMeals: 'fast_food_days',
  sugaryDrinks: 'sugary_drinks',
  morningErection: 'am_erections',
  alcoholDrinks: 'alcohol_drinks',
  cigarettes: 'smoke_amount',
  vapingUse: 'vaping_level',
  weedJoints: 'weed_joints',
};

const schemaRowMap = new Map((weeklySchema.rows ?? []).map((row) => [row.id, row]));

const getSchemaRow = (metric: WeeklyMetricId) => {
  const rowId = METRIC_TO_ROW_ID[metric];
  if (!rowId) {
    return undefined;
  }
  return schemaRowMap.get(rowId);
};

const formatDayValue = (display: string | undefined, metric: WeeklyMetricId, value: unknown) => {
  if (value === undefined || value === null) {
    return '0';
  }

  if (display === 'circles') {
    return '';
  }

  if (metric === 'vapingUse') {
    const label = String(value);
    return label === 'none' ? '-' : label.charAt(0).toUpperCase();
  }

  if (typeof value === 'number') {
    const config = LOG_METRIC_CONFIG[metric];
    const decimals = config.number?.decimals ?? 0;
    return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  return String(value);
};

const isDayActive = (display: string | undefined, value: unknown) => {
  if (display !== 'circles') {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value > 0;
  }
  return Boolean(value && value !== 'none');
};

const clampNumber = (input: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, input));
};

type SessionMap = Partial<Record<WeeklyMetricId, number | VapingLevel>>;

type RouteParams = {
  step?: string;
};

const formatNumberInput = (value: number, decimals = 0) => {
  return decimals > 0 ? value.toFixed(decimals) : String(value);
};

const ADMIN_LOG_EVENT_SECRET = process.env.EXPO_PUBLIC_ADMIN_LOG_EVENT_SECRET;

const logWeeklyError = async (payload: Record<string, unknown>) => {
  if (!ADMIN_LOG_EVENT_SECRET) {
    return;
  }
  try {
    await post(
      '/log_event',
      {
        event: 'weekly_submit.error',
        source: 'edge',
        severity: 'error',
        details: payload,
      },
      undefined,
      { 'X-Admin-Key': ADMIN_LOG_EVENT_SECRET },
    );
  } catch {
    // ignore logging failures
  }
};

export default function WeeklyStepScreen() {
  const router = useRouter();
  const themeTokens = useTheme();
  const { isHydrating: isAppHydrating, smoking, trialStartedAt, setLastResult } = useAppState();
  const { isHydrating: isIntakeHydrating } = useIntakeState();
  const { step } = useLocalSearchParams<RouteParams>();
  const filteredSequence = useMemo(() => {
    return WEEKLY_SEQUENCE.filter((metric) => {
      if (metric === 'cigarettes' && !smoking.cigarettes) return false;
      if (metric === 'vapingUse' && !smoking.vape) return false;
      if (metric === 'weedJoints' && !smoking.weed) return false;
      return true;
    });
  }, [smoking]);

  const stepIndex = useMemo(() => {
    const parsed = Number(step);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    const maxIndex = Math.max(filteredSequence.length - 1, 0);
    return Math.min(Math.floor(parsed), maxIndex);
  }, [step, filteredSequence.length]);

  const metricId = filteredSequence[stepIndex];
  const config = LOG_METRIC_CONFIG[metricId];
  const schemaRow = getSchemaRow(metricId);
  const displayType = schemaRow?.display ?? 'numbers';
  const dayLabels = schemaRow?.days?.map((day) => day.day) ?? DEFAULT_DAY_LABELS;
  const summaryUnit = schemaRow?.summary?.unit ?? (config.number?.unit ?? '');

  const { draft, setDraftValue, clearDraft, getSummary, completeWeekly } = useWeeklyState();
  const summary = useMemo(() => getSummary(metricId), [getSummary, metricId]);

  const sessionRef = useRef<SessionMap>({});
  const isSubmittingRef = useRef(false);

  const [inputValue, setInputValue] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const isLastStep = stepIndex >= Math.max(filteredSequence.length - 1, 0);

  useEffect(() => {
    // prefer draft first, then session, then summary
    let sessionValue = (draft as any)[metricId] ?? sessionRef.current[metricId];

    if (sessionValue === undefined) {
      if (config.valueKind === 'enum') {
        const defaultSelection = (summary.overall as VapingLevel | undefined) ?? 'none';
        sessionValue = defaultSelection;
      } else {
        const fallback = typeof summary.overall === 'number' ? summary.overall : undefined;
        sessionValue = fallback;
      }
      sessionRef.current[metricId] = sessionValue;
    }

    if (config.valueKind === 'enum') {
      setInputValue(sessionValue === undefined ? '' : String(sessionValue));
    } else {
      const decimals = config.number?.decimals ?? 0;
      const numericValue = typeof sessionValue === 'number' ? sessionValue : undefined;
      setInputValue(Number.isFinite(numericValue as any) ? formatNumberInput(numericValue as number, decimals) : '');
    }
    setError(null);
  }, [config.number?.decimals, config.valueKind, metricId, summary.overall, draft]);

  const progressValue = filteredSequence.length > 0 ? (stepIndex + 1) / filteredSequence.length : 0;

  const handleBack = () => {
    if (stepIndex === 0) {
      router.replace('/weekly');
      return;
    }
    router.replace(`/weekly/q/${stepIndex - 1}`);
  };

  const handleNext = async () => {
    let submissionValue: number | VapingLevel;

    if (config.valueKind === 'enum') {
      submissionValue = (inputValue as VapingLevel) ?? 'none';
      if (!config.enumOptions?.some((option) => option.value === submissionValue)) {
        setError('Select an option to continue');
        return;
      }
    } else {
      const rawNumber = Number.parseFloat(inputValue);
      if (Number.isNaN(rawNumber)) {
        setError('Enter a number to continue');
        return;
      }
      const { min = 0, max = 999, decimals = 0 } = config.number ?? { min: 0, max: 999, decimals: 0 };
      const clamped = clampNumber(rawNumber, min, max);
      submissionValue = decimals > 0 ? Number(clamped.toFixed(decimals)) : Math.round(clamped);
    }

    sessionRef.current[metricId] = submissionValue;

    if (isLastStep) {
      if (isSubmittingRef.current) {
        return;
      }
      isSubmittingRef.current = true;

      const submissionPayload: WeeklySubmission = filteredSequence.reduce((acc, metric) => {
        let value = (draft as any)[metric];
        if (value === undefined) value = sessionRef.current[metric];
        if (value === undefined) {
          const cfg = LOG_METRIC_CONFIG[metric];
          const sum = getSummary(metric);
          if (cfg.valueKind === 'enum') value = (sum.overall as VapingLevel | undefined) ?? 'none';
          else value = typeof sum.overall === 'number' ? sum.overall : 0;
        }
        if (value === null) return acc;
        if (typeof value === 'string' && value.trim() === '') return acc;
        acc[metric] = value as any;
        return acc;
      }, {} as WeeklySubmission);
      const completedAt = new Date();

      const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
      let weekNumber = 1;
      if (trialStartedAt) {
        const trialStartDate = new Date(trialStartedAt);
        if (!Number.isNaN(trialStartDate.getTime())) {
          const diffWeeks = Math.floor((completedAt.getTime() - trialStartDate.getTime()) / WEEK_IN_MS);
          weekNumber = Math.min(8, Math.max(1, diffWeeks + 1));
        }
      }

      let latestScoreForState: number | null | undefined;
      let submissionFailed = false;
      const completedAtIso = completedAt.toISOString();

      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        const userId = session?.user?.id ?? null;
        const jwt = session?.access_token ?? null;

        let relatedCheckinId: string | null = null;

        if (!userId || !jwt) {
          submissionFailed = true;
          await logWeeklyError({ reason: 'missing_session' });
        } else {
          const insertResult = await supabase
            .from('weekly_checkins')
            .insert({
              user_id: userId,
              week_number: weekNumber,
              // placeholder to satisfy NOT NULL; server overwrites to 19:00 local
              due_at: completedAtIso,
              payload: submissionPayload,
            })
            .select('checkin_id, submitted_at')
            .single();

          if (insertResult.data?.checkin_id) {
            relatedCheckinId = insertResult.data.checkin_id;
          } else if (insertResult.error) {
            if (insertResult.error.code === '23505') {
              const existing = await supabase
                .from('weekly_checkins')
                .select('checkin_id')
                .eq('user_id', userId)
                .eq('week_number', weekNumber)
                .maybeSingle();
              if (existing.error) {
                submissionFailed = true;
                await logWeeklyError({
                  reason: 'lookup_failed',
                  message: existing.error.message,
                  code: existing.error.code,
                });
                return;
              }
              relatedCheckinId = existing.data?.checkin_id ?? null;
            } else {
              submissionFailed = true;
              await logWeeklyError({
                reason: 'insert_failed',
                code: insertResult.error.code,
                message: insertResult.error.message,
              });
              Alert.alert('Weekly', "We couldn’t save your answers. Please try again.");
              return;
            }
          }
        }

        if (!submissionFailed && jwt) {
          const body: Record<string, unknown> = {
            source: 'weekly_checkin',
            week_number: weekNumber,
            completed_at: completedAtIso,
          };
          if (relatedCheckinId) {
            body.related_checkin_id = relatedCheckinId;
          }
          try {
            const response = await post('/estimate', body, jwt).catch((e) => {
              throw e;
            });
            if (response && typeof response === 'object') {
              const scoreValue = (response as Record<string, unknown>).score;
              const potentialValue = (response as Record<string, unknown>).potential;
              const generatedAtValue = (response as Record<string, unknown>).generatedAt;
              const modelVersionValue = (response as Record<string, unknown>).modelVersion;
              const nextWeekDueAtValue = (response as Record<string, unknown>).nextWeekDueAt;

              if (typeof scoreValue === 'number') {
                latestScoreForState = scoreValue;
                await setLastResult({
                  score: scoreValue,
                  potential:
                    typeof potentialValue === 'number'
                      ? potentialValue
                      : potentialValue === null
                      ? null
                      : undefined,
                  generatedAt: typeof generatedAtValue === 'string' ? generatedAtValue : undefined,
                  modelVersion: typeof modelVersionValue === 'string' ? modelVersionValue : undefined,
                  source: 'weekly_checkin',
                  recordedAt: Date.now(),
                });
              }

              // Use server-computed next due when available
              if (typeof nextWeekDueAtValue === 'string') {
                try {
                  const parsed = new Date(nextWeekDueAtValue);
                  if (!Number.isNaN(parsed.getTime())) {
                    await completeWeekly(submissionPayload, { nextDueAt: parsed, latestScore: latestScoreForState });
                    // clear draft after successful completion now that weekly state resolved.
                    clearDraft();
                    router.replace('/weekly/result');
                    return;
                  }
                } catch {}
              }
            }
          } catch (estimateError) {
            submissionFailed = true;
            await logWeeklyError({
              reason: 'estimate_failed',
              message: estimateError instanceof Error ? estimateError.message : String(estimateError),
            });
            Alert.alert('Weekly', "We couldn’t compute your result. Please try again.");
          }
        }
      } catch (error) {
        submissionFailed = true;
        await logWeeklyError({
          reason: 'session_or_unknown_failure',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        isSubmittingRef.current = false;
      }

      if (submissionFailed) {
        return;
      }

      // Fallback if server didn't provide next due
      await completeWeekly(submissionPayload, { latestScore: latestScoreForState });
      clearDraft();
      router.replace('/weekly/result');
      return;
    }

    router.replace(`/weekly/q/${stepIndex + 1}`);
  };

  const dailyEntries = summary.entries;

  const renderEnumControl = () => {
    return (
      <View style={styles.quickGrid}>
        {(config.enumOptions ?? []).map((option) => {
          const selected = inputValue === option.value;
          return (
            <Chip
              key={option.value}
              label={option.label}
              selected={selected}
              onPress={() => {
                setInputValue(option.value);
                setError(null);
                // persist selection immediately
                sessionRef.current[metricId] = option.value as VapingLevel;
                setDraftValue(metricId, option.value as VapingLevel);
              }}
            />
          );
        })}
      </View>
    );
  };

  const renderNumberControl = () => {
    const { decimals = 0 } = config.number ?? { decimals: 0 };
    const keyboardType = decimals > 0 ? 'decimal-pad' : 'numeric';

    return (
      <View style={styles.overallRow}>
        <View style={{ gap: getSpacing('4') }}>
          <Text
            style={{
              color: themeTokens.colors.text.secondary,
              fontFamily: 'Inter_500Medium',
              fontSize: theme.typography.scale.sm,
            }}
          >
            Overall
          </Text>
          <TextInput
            value={inputValue}
            onChangeText={(text) => {
              setInputValue(text);
              setError(null);
              const parsed = Number.parseFloat(text);
              if (!Number.isNaN(parsed)) {
                sessionRef.current[metricId] = parsed as number;
                setDraftValue(metricId, parsed as number);
              } else if (text === '') {
                delete (sessionRef.current as any)[metricId];
              }
            }}
            keyboardType={keyboardType}
            style={styles.overallInput}
            placeholder="0"
            placeholderTextColor={themeTokens.colors.text.secondary}
          />
        </View>
        {summaryUnit ? (
          <Text
            style={{
              color: themeTokens.colors.text.secondary,
              fontFamily: 'Inter_500Medium',
              fontSize: theme.typography.scale.sm,
            }}
          >
            {summaryUnit}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderAnswerControl = () => {
    if (config.valueKind === 'enum') {
      return renderEnumControl();
    }
    return renderNumberControl();
  };

  const formatSummaryHelper = () => {
    if (!schemaRow?.summary?.type) {
      return '';
    }
    switch (schemaRow.summary.type) {
      case 'avg':
        return 'Average from last 7 days';
      case 'sum':
        return 'Total from last 7 days';
      case 'count':
        return 'Count from last 7 days';
      default:
        return '';
    }
  };

  if (isAppHydrating || isIntakeHydrating) return null;

  return (
    <SafeAreaScreen>
      <View style={{ gap: SECTION_GAP }}>
        <View style={{ gap: HEADER_GAP }}>
          <View style={styles.headerRow}>
            <Pressable onPress={handleBack} accessibilityRole="button" style={styles.backButton}>
              <ArrowLeftIcon size={24} color={themeTokens.colors.text.primary} />
            </Pressable>
            <Progress value={progressValue} />
          </View>
          <View style={{ gap: ITEM_GAP }}>
            <Text
              style={[
                styles.questionTitle,
                {
                  color: themeTokens.colors.text.primary,
                  fontFamily: 'Inter_600SemiBold',
                },
              ]}
            >
              {schemaRow?.label ?? config.label}
            </Text>
            <Text
              style={[
                styles.helper,
                {
                  color: themeTokens.colors.text.secondary,
                  fontFamily: 'Inter_400Regular',
                },
              ]}
            >
              {schemaRow?.summary?.unit ? `${formatSummaryHelper()} (${schemaRow.summary.unit})` : formatSummaryHelper()}
            </Text>
          </View>
        </View>

        <Card style={{ gap: getSpacing('12') }}>
          <View style={styles.dayHeaderRow}>
            {dayLabels.map((label) => (
              <Text key={label} style={styles.dayHeaderLabel}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.dayValuesRow}>
            {dayLabels.map((label, index) => {
              const entry = dailyEntries[index];
              const value = entry?.value;
              const active = isDayActive(displayType, value);
              const displayValue = formatDayValue(displayType, metricId, value);

              if (displayType === 'circles') {
                return (
                  <View key={`${label}-${index}`} style={styles.dayCircleWrapper}>
                    <View
                      style={[
                        styles.dayCircle,
                        active ? styles.dayCircleActive : styles.dayCircleInactive,
                      ]}
                    />
                  </View>
                );
              }

              return (
                <View key={`${label}-${index}`} style={styles.dayNumberWrapper}>
                  <View style={styles.dayNumberBox}>
                    <Text style={styles.dayNumberText}>{displayValue}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        {renderAnswerControl()}

        {error ? (
          <Text
            style={{
              color: themeTokens.colors.accent.negative,
              fontFamily: 'Inter_500Medium',
              fontSize: theme.typography.scale.sm,
            }}
          >
            {error}
          </Text>
        ) : null}

        <View style={{ gap: ITEM_GAP }}>
          <Button label={isLastStep ? 'Finish' : 'Next'} onPress={handleNext} />
          <Text
            style={[
              styles.backLink,
              {
                color: themeTokens.colors.text.secondary,
                fontFamily: 'Inter_500Medium',
              },
            ]}
            onPress={handleBack}
          >
            Back
          </Text>

          {/* Dev helper: jump to app start (reset state and navigate to root) */}
          <Button
            label="Dev jump to start"
            variant="secondary"
            onPress={async () => {
              try {
                // import useAppState dynamically to avoid circular imports at top-level
                const mod = await import('@/state/appState');
                const { useAppState } = mod as any;
                const ctx = useAppState();
                await ctx.resetAppState();
                // route to app root so the app will treat this as a fresh start
                router.replace('/');
              } catch (e) {
                console.warn('Dev jump failed', e);
              }
            }}
          />
        </View>
      </View>
    </SafeAreaScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getSpacing('12'),
  },
  backButton: {
    width: theme.size.icon.xl,
    height: theme.size.icon.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: getRadius('pill'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.subtle'),
  },
  questionTitle: {
    fontSize: theme.typography.scale.xl,
    lineHeight: theme.typography.scale.xl * theme.typography.lineHeight.snug,
  },
  helper: {
    fontSize: theme.typography.scale.md,
    lineHeight: theme.typography.scale.md * theme.typography.lineHeight.normal,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayHeaderLabel: {
    color: getColor('text.tertiary'),
    fontFamily: 'Inter_500Medium',
    fontSize: theme.typography.scale.xs,
  },
  dayValuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayCircleWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  dayCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  dayCircleActive: {
    backgroundColor: getColor('accent.brand'),
  },
  dayCircleInactive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.muted'),
  },
  dayNumberWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  dayNumberBox: {
    minWidth: 32,
    paddingHorizontal: getSpacing('8'),
    paddingVertical: getSpacing('4'),
    borderRadius: getRadius('pill'),
    backgroundColor: getColor('surface.base'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.subtle'),
    alignItems: 'center',
  },
  dayNumberText: {
    color: getColor('text.primary'),
    fontFamily: 'Inter_600SemiBold',
    fontSize: theme.typography.scale.sm,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: getSpacing('8'),
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: getSpacing('12'),
  },
  overallInput: {
    minWidth: 72,
    paddingHorizontal: getSpacing('12'),
    paddingVertical: getSpacing('8'),
    borderRadius: getRadius('pill'),
    backgroundColor: getColor('surface.base'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.muted'),
    color: getColor('text.primary'),
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  backLink: {
    textAlign: 'center',
    fontSize: theme.typography.scale.md,
  },
});
