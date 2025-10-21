import { useMemo, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeAreaScreen } from '@/ui';
import { Card } from '@/components/ui';
import {
  AlcoholLogModal,
  CardioLogModal,
  CigarettesLogModal,
  FastFoodLogModal,
  MorningErectionLogModal,
  ProteinLogModal,
  SleepLogModal,
  StrengthLogModal,
  SugaryLogModal,
  SunlightLogModal,
  VapingLogModal,
  WeedLogModal,
  type LogModalProps,
} from '@/components/log-modals';
import { LOG_METRIC_CONFIG } from '@/constants/logMetrics';
import { useAppState } from '@/state/appState';
import { useLogs, formatDateToKey, type LogMetric } from '@/state/logs';
import { useWeeklyState, type WeeklyMetricId } from '@/state/weekly';
import { getColor, getRadius, getSpacing, theme, useTheme } from '@/theme';

const DAILY_METRICS: LogMetric[] = ['proteinHit', 'sunlight', 'sleepHours', 'morningErection'];
const WEEKLY_METRICS: WeeklyMetricId[] = ['strengthSessions', 'cardioMin'];
const SUBSTANCE_METRICS: LogMetric[] = ['alcoholDrinks', 'sugaryDrinks', 'fastFoodMeals', 'cigarettes', 'vapingUse', 'weedJoints'];

const MODAL_COMPONENTS: Record<LogMetric, ComponentType<LogModalProps>> = {
  sleepHours: SleepLogModal,
  proteinHit: ProteinLogModal,
  sunlight: SunlightLogModal,
  morningErection: MorningErectionLogModal,
  cardioMin: CardioLogModal,
  strengthSessions: StrengthLogModal,
  alcoholDrinks: AlcoholLogModal,
  sugaryDrinks: SugaryLogModal,
  fastFoodMeals: FastFoodLogModal,
  cigarettes: CigarettesLogModal,
  vapingUse: VapingLogModal,
  weedJoints: WeedLogModal,
};

const formatNumber = (value: number, decimals = 0) => {
  return decimals > 0 ? value.toFixed(decimals) : String(value);
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

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

export default function PlanScreen() {
  const themeTokens = useTheme();
  const { trialStartedAt } = useAppState();
  const { getValue, getLast7 } = useLogs();
  const { getSummary } = useWeeklyState();

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateToKey(today), [today]);

  const weekIndex = useMemo(() => computeWeekIndex(trialStartedAt), [trialStartedAt]);

  const [activeMetric, setActiveMetric] = useState<LogMetric | null>(null);

  const ActiveModal = activeMetric ? MODAL_COMPONENTS[activeMetric] : null;

  const handleOpenModal = (metric: LogMetric) => {
    setActiveMetric(metric);
  };

  const handleCloseModal = () => {
    setActiveMetric(null);
  };

  const renderDailyRows = () => {
    return DAILY_METRICS.map((metric, index) => {
      const config = LOG_METRIC_CONFIG[metric];
      const raw = getValue(metric, todayKey);
      const isBoolean = config.valueKind === 'boolean';
      const checked = isBoolean ? raw === true : Boolean(raw);
      const decimals = config.number?.decimals ?? (metric === 'sleepHours' ? 1 : 0);
      let displayValue: string | undefined;

      if (config.valueKind === 'number') {
        const numeric = typeof raw === 'number' ? raw : 0;
        displayValue = formatNumber(numeric, decimals) + (config.number?.unit ? ` ${config.number.unit}` : '');
      } else if (typeof raw === 'string') {
        displayValue = capitalize(raw);
      }

      return (
        <Pressable
          key={metric}
          onPress={() => handleOpenModal(metric)}
          style={[styles.row, index < DAILY_METRICS.length - 1 && styles.rowDivider]}
          accessibilityRole="button"
        >
          <View style={[styles.circle, checked && styles.circleFilled]} />
          <View style={{ flex: 1, gap: getSpacing('4') }}>
            <Text
              style={[
                styles.rowLabel,
                {
                  color: themeTokens.colors.text.primary,
                  fontFamily: 'Inter_600SemiBold',
                },
              ]}
            >
              {config.label}
            </Text>
            {config.daily?.subtitle ? (
              <Text
                style={{
                  color: themeTokens.colors.text.secondary,
                  fontFamily: 'Inter_400Regular',
                  fontSize: theme.typography.scale.sm,
                }}
              >
                {config.daily.subtitle}
              </Text>
            ) : null}
          </View>
          {displayValue ? (
            <Text
              style={{
                color: config.daily?.highlightValue ? themeTokens.colors.accent.brand : themeTokens.colors.text.secondary,
                fontFamily: 'Inter_600SemiBold',
                fontSize: theme.typography.scale.sm,
              }}
            >
              {displayValue}
            </Text>
          ) : null}
        </Pressable>
      );
    });
  };

  const renderWeeklyRows = () => {
    return WEEKLY_METRICS.map((metric, index) => {
      const config = LOG_METRIC_CONFIG[metric];
      const summary = getSummary(metric);
      const numeric = typeof summary.overall === 'number' ? summary.overall : 0;
      const target = config.weekly?.target;
      const unit = config.weekly?.unit ?? '';
      const highlight = config.weekly?.highlightValue;

      return (
        <Pressable
          key={metric}
          style={[styles.row, index < WEEKLY_METRICS.length - 1 && styles.rowDivider]}
          onPress={() => handleOpenModal(metric)}
          accessibilityRole="button"
        >
          <View style={{ flex: 1, gap: getSpacing('4') }}>
            <Text
              style={[
                styles.rowLabel,
                {
                  color: themeTokens.colors.text.primary,
                  fontFamily: 'Inter_500Medium',
                },
              ]}
            >
              {config.label}
            </Text>
            <Text
              style={{
                color: themeTokens.colors.text.secondary,
                fontFamily: 'Inter_400Regular',
                fontSize: theme.typography.scale.sm,
              }}
            >
              {config.weekly?.target ? `${config.weekly.target} ${unit}` : config.weeklyHelper}
            </Text>
          </View>
          <Text
            style={{
              color: highlight ? themeTokens.colors.accent.brand : themeTokens.colors.text.secondary,
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {target !== undefined ? `${numeric} / ${target}` : formatNumber(numeric)}
          </Text>
        </Pressable>
      );
    });
  };

  const renderSubstances = () => {
    return SUBSTANCE_METRICS.map((metric, index) => {
      const config = LOG_METRIC_CONFIG[metric];
      const entries = getLast7(metric);
      let valueText = '0 this week';
      if (config.valueKind === 'enum') {
        const latest = [...entries].reverse().find((entry) => typeof entry.value === 'string');
        valueText = latest ? `${capitalize(String(latest.value))} this week` : 'None this week';
      } else {
        const total = entries.reduce((sum, entry) => {
          const value = entry.value;
          if (typeof value === 'number') {
            return sum + value;
          }
          if (typeof value === 'boolean') {
            return sum + (value ? 1 : 0);
          }
          return sum;
        }, 0);
        valueText = `${total} this week`;
      }

      return (
        <Pressable
          key={metric}
          style={[styles.row, styles.substanceRowSpacing, index < SUBSTANCE_METRICS.length - 1 && styles.rowDivider]}
          onPress={() => handleOpenModal(metric)}
          accessibilityRole="button"
        >
          <Text
            style={{
              color: themeTokens.colors.text.primary,
              fontFamily: 'Inter_500Medium',
              fontSize: theme.typography.scale.md,
            }}
          >
            {config.listLabel ?? config.label}
          </Text>
          <Text
            style={{
              color: themeTokens.colors.text.secondary,
              fontFamily: 'Inter_500Medium',
              fontSize: theme.typography.scale.sm,
            }}
          >
            {valueText}
          </Text>
        </Pressable>
      );
    });
  };

  return (
    <SafeAreaScreen>
      <View style={{ gap: getSpacing('24') }}>
        <View style={{ gap: getSpacing('8') }}>
          <Text
            style={[
              styles.title,
              {
                color: themeTokens.colors.text.primary,
                fontFamily: 'Inter_700Bold',
                fontSize: theme.typography.scale.xl,
              },
            ]}
          >
            Plan � Week {Math.min(weekIndex, 8)} of 8
          </Text>
          <Text
            style={{
              color: themeTokens.colors.text.secondary,
              fontFamily: 'Inter_400Regular',
              fontSize: theme.typography.scale.sm,
            }}
          >
            Tap a row to log. Daily resets nightly.
          </Text>
        </View>

        <Card style={styles.sectionCard}>
          <Text
            style={{
              color: themeTokens.colors.text.primary,
              fontFamily: 'Inter_600SemiBold',
              fontSize: theme.typography.scale.lg,
            }}
          >
            Today
          </Text>
          <View>{renderDailyRows()}</View>
        </Card>

        <Card style={styles.sectionCard}>
          <Text
            style={{
              color: themeTokens.colors.text.primary,
              fontFamily: 'Inter_600SemiBold',
              fontSize: theme.typography.scale.lg,
            }}
          >
            This Week (log anytime)
          </Text>
          <View>{renderWeeklyRows()}</View>
        </Card>

        <Card style={styles.sectionCard}>
          <Text
            style={{
              color: themeTokens.colors.text.primary,
              fontFamily: 'Inter_600SemiBold',
              fontSize: theme.typography.scale.lg,
            }}
          >
            Substances
          </Text>
          <View>{renderSubstances()}</View>
        </Card>
      </View>

      {ActiveModal ? <ActiveModal visible date={today} onClose={handleCloseModal} /> : null}
    </SafeAreaScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    letterSpacing: 0.4,
  },
  sectionCard: {
    gap: getSpacing('16'),
    backgroundColor: getColor('surface.elev1'),
    borderRadius: getRadius('card'),
    padding: getSpacing('20'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.subtle'),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getSpacing('12'),
    paddingVertical: getSpacing('12'),
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: getColor('border.subtle'),
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.muted'),
    backgroundColor: getColor('surface.base'),
  },
  circleFilled: {
    backgroundColor: getColor('accent.brand'),
    borderColor: getColor('accent.brand'),
  },
  rowLabel: {
    fontSize: theme.typography.scale.md,
  },
  substanceRowSpacing: {
    paddingVertical: getSpacing('16'),
  },
});
