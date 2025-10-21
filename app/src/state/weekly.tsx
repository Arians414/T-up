import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAppState } from '@/state/appState';
import { useLogs, type Last7Entry, type LogMetric, type VapingLevel } from '@/state/logs';

const STORAGE_KEY = 'tup.weekly.v1';

type WeeklyMetricId = LogMetric;

type WeeklySummaryType = 'average' | 'sum' | 'latest';

type AverageMetric = 'sleepHours';
type LatestMetric = 'vapingUse';
type SumMetric = Exclude<WeeklyMetricId, AverageMetric | LatestMetric>;

const SUMMARY_CONFIG: Record<WeeklyMetricId, WeeklySummaryType> = {
  sleepHours: 'average',
  proteinHit: 'sum',
  sunlight: 'sum',
  morningErection: 'sum',
  cardioMin: 'sum',
  strengthSessions: 'sum',
  alcoholDrinks: 'sum',
  sugaryDrinks: 'sum',
  fastFoodMeals: 'sum',
  cigarettes: 'sum',
  vapingUse: 'latest',
  weedJoints: 'sum',
};

type WeeklyStoredState = {
  lastCompletedAt?: string;
  latestT?: number;
};

export type WeeklySubmission = Partial<Record<WeeklyMetricId, number | boolean | string>>;

type CompleteWeeklyOptions = {
  nextDueAt?: Date;
  latestScore?: number | null;
};

type WeeklyMetricSummary<M extends WeeklyMetricId> = {
  metric: M;
  summaryType: WeeklySummaryType;
  entries: Array<Last7Entry<M>>;
  overall: number | VapingLevel | undefined;
};

type WeeklyContextValue = {
  isHydrating: boolean;
  lastCompletedAt?: string;
  latestT?: number;
  weeklyDueAt?: string;
  isWeeklyDue: boolean;
  draft: WeeklySubmission;
  setDraftValue: (metric: WeeklyMetricId, value: number | boolean | string) => void;
  clearDraft: () => void;
  getSummary: <M extends WeeklyMetricId>(metric: M, anchorDate?: Date) => WeeklyMetricSummary<M>;
  completeWeekly: (submission: WeeklySubmission, options?: CompleteWeeklyOptions) => Promise<void>;
};

const WeeklyContext = createContext<WeeklyContextValue | undefined>(undefined);

const computeNextWeeklyDue = (baseDate: Date) => {
  const due = new Date(baseDate);
  due.setDate(due.getDate() + 7);
  due.setHours(19, 0, 0, 0);
  return due;
};

export const WeeklyProvider = ({ children }: PropsWithChildren) => {
  const { getLast7, sum7, avg7 } = useLogs();
  const { weeklyDueAt, setWeeklyDueAt } = useAppState();

  const [stored, setStored] = useState<WeeklyStoredState>({});
  const [isHydrating, setIsHydrating] = useState(true);
  const [draft, setDraft] = useState<WeeklySubmission>({});

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as WeeklyStoredState;
          setStored(parsed);
        }
      } catch (error) {
        console.warn('Failed to load weekly state', error);
      } finally {
        setIsHydrating(false);
      }
    };

    load();
  }, []);

  const persist = useCallback(async (next: WeeklyStoredState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('Failed to persist weekly state', error);
    }
  }, []);

  const getSummary = useCallback<WeeklyContextValue['getSummary']>(
    (metric, anchorDate) => {
      const summaryType = SUMMARY_CONFIG[metric];
      const entries = getLast7(metric, anchorDate) as Array<Last7Entry<typeof metric>>;

      let overall: number | VapingLevel | undefined;
      if (summaryType === 'average') {
        overall = Number(avg7(metric as AverageMetric, anchorDate).toFixed(1));
      } else if (summaryType === 'sum') {
        overall = sum7(metric as SumMetric, anchorDate);
      } else {
        const latestEntry = [...entries].reverse().find((entry) => entry.value !== undefined);
        overall = (latestEntry?.value as VapingLevel | undefined) ?? undefined;
      }

      return {
        metric,
        summaryType,
        entries,
        overall,
      } as WeeklyMetricSummary<typeof metric>;
    },
    [avg7, getLast7, sum7],
  );

  const completeWeekly = useCallback<WeeklyContextValue['completeWeekly']>(
    async (_submission, options) => {
      const completedAt = new Date();
      const nextDue = options?.nextDueAt ?? computeNextWeeklyDue(completedAt);

      const nextState: WeeklyStoredState = {
        lastCompletedAt: completedAt.toISOString(),
        latestT:
          typeof options?.latestScore === 'number'
            ? options.latestScore
            : options?.latestScore === null
            ? undefined
            : stored.latestT,
      };

      setStored(nextState);
      setDraft({});
      await Promise.all([persist(nextState), setWeeklyDueAt(nextDue)]);
    },
    [persist, setWeeklyDueAt, stored.latestT],
  );

  const isWeeklyDue = useMemo(() => {
    if (!weeklyDueAt) {
      return false;
    }
    const now = Date.now();
    const due = new Date(weeklyDueAt).getTime();
    return now >= due;
  }, [weeklyDueAt]);

  const value = useMemo<WeeklyContextValue>(
    () => ({
      isHydrating,
      lastCompletedAt: stored.lastCompletedAt,
      latestT: stored.latestT,
      weeklyDueAt,
      isWeeklyDue,
      draft,
      setDraftValue: (metric, value) => setDraft((d) => ({ ...d, [metric]: value })),
      clearDraft: () => setDraft({}),
      getSummary,
      completeWeekly,
    }),
    [completeWeekly, getSummary, isHydrating, isWeeklyDue, stored, weeklyDueAt, draft],
  );

  return <WeeklyContext.Provider value={value}>{children}</WeeklyContext.Provider>;
};

export const useWeeklyState = () => {
  const context = useContext(WeeklyContext);
  if (!context) {
    throw new Error('useWeeklyState must be used within WeeklyProvider');
  }
  return context;
};


export type { WeeklyMetricId };

