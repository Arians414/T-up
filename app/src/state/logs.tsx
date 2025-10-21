import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'tup.logs.v1';

type DateKey = string; // YYYY-MM-DD

export type VapingLevel = 'none' | 'small' | 'medium' | 'high';

export type LogsValueMap = {
  sleepHours: number;
  proteinHit: boolean;
  sunlight: boolean;
  morningErection: boolean;
  cardioMin: number;
  strengthSessions: number;
  alcoholDrinks: number;
  sugaryDrinks: number;
  fastFoodMeals: number;
  cigarettes: number;
  vapingUse: VapingLevel;
  weedJoints: number;
};

export type LogMetric = keyof LogsValueMap;

export type LogsState = {
  [Metric in LogMetric]: Partial<Record<DateKey, LogsValueMap[Metric]>>;
};

export type Last7Entry<Metric extends LogMetric> = {
  date: DateKey;
  value?: LogsValueMap[Metric];
};

type LogsContextValue = {
  isHydrating: boolean;
  logs: LogsState;
  getValue: <Metric extends LogMetric>(metric: Metric, date: DateKey) => LogsValueMap[Metric] | undefined;
  setLog: <Metric extends LogMetric>(
    metric: Metric,
    date: DateKey,
    value: LogsValueMap[Metric] | undefined,
  ) => void;
  getLast7: <Metric extends LogMetric>(metric: Metric, anchorDate?: Date) => Array<Last7Entry<Metric>>;
  sum7: (metric: Exclude<LogMetric, 'vapingUse'>, anchorDate?: Date) => number;
  avg7: (metric: 'sleepHours' | 'cardioMin' | 'strengthSessions' | 'alcoholDrinks' | 'sugaryDrinks' | 'fastFoodMeals' | 'cigarettes' | 'weedJoints', anchorDate?: Date) => number;
};

const defaultLogs: LogsState = {
  sleepHours: {},
  proteinHit: {},
  sunlight: {},
  morningErection: {},
  cardioMin: {},
  strengthSessions: {},
  alcoholDrinks: {},
  sugaryDrinks: {},
  fastFoodMeals: {},
  cigarettes: {},
  vapingUse: {},
  weedJoints: {},
};

const LogsContext = createContext<LogsContextValue | undefined>(undefined);

const formatDateKey = (input: Date): DateKey => {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, '0');
  const day = `${input.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeAnchor = (anchor?: Date) => {
  const base = anchor ? new Date(anchor) : new Date();
  base.setHours(12, 0, 0, 0);
  return base;
};

export const LogsProvider = ({ children }: PropsWithChildren) => {
  const [logs, setLogs] = useState<LogsState>(defaultLogs);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as LogsState;
          setLogs((prev) => ({
            ...prev,
            ...parsed,
          }));
        }
      } catch (error) {
        console.warn('Failed to load logs state', error);
      } finally {
        setIsHydrating(false);
      }
    };

    load();
  }, []);

  const persist = useCallback(async (next: LogsState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('Failed to persist logs state', error);
    }
  }, []);

  const setLog = useCallback<LogsContextValue['setLog']>(
    (metric, date, value) => {
      setLogs((prev) => {
        const next = { ...prev } as LogsState;
        const metricLogs = { ...(prev[metric] ?? {}) } as LogsState[typeof metric];

        if (value === undefined || value === null) {
          delete (metricLogs as Record<string, unknown>)[date];
        } else {
          (metricLogs as Record<string, unknown>)[date] = value as unknown;
        }

        (next[metric] as LogsState[typeof metric]) = metricLogs;

        void persist(next);
        return next;
      });
    },
    [persist],
  );

  const getValue = useCallback<LogsContextValue['getValue']>(
    (metric, date) => {
      return logs[metric]?.[date];
    },
    [logs],
  );

  const getLast7 = useCallback<LogsContextValue['getLast7']>(
    (metric, anchorDate) => {
      const anchor = normalizeAnchor(anchorDate);
      const results: Array<Last7Entry<typeof metric>> = [];

      for (let offset = 6; offset >= 0; offset -= 1) {
        const day = new Date(anchor);
        day.setDate(anchor.getDate() - (6 - offset));
        const key = formatDateKey(day);
        results.push({
          date: key,
          value: logs[metric]?.[key],
        });
      }

      return results;
    },
    [logs],
  );

  const sum7 = useCallback<LogsContextValue['sum7']>(
    (metric, anchorDate) => {
      const entries = getLast7(metric, anchorDate);
      return entries.reduce((total, entry) => {
        const value = entry.value;
        if (typeof value === 'number') {
          return total + value;
        }
        if (typeof value === 'boolean') {
          return total + (value ? 1 : 0);
        }
        return total;
      }, 0);
    },
    [getLast7],
  );

  const avg7 = useCallback<LogsContextValue['avg7']>(
    (metric, anchorDate) => {
      const total = sum7(metric, anchorDate);
      return total / 7;
    },
    [sum7],
  );

  const value = useMemo<LogsContextValue>(
    () => ({
      isHydrating,
      logs,
      getValue,
      setLog,
      getLast7,
      sum7,
      avg7,
    }),
    [avg7, getLast7, getValue, isHydrating, logs, setLog, sum7],
  );

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
};

export const useLogs = () => {
  const context = useContext(LogsContext);
  if (!context) {
    throw new Error('useLogs must be used within LogsProvider');
  }
  return context;
};

export const useLogHelpers = () => {
  const { getLast7, sum7, avg7 } = useLogs();
  return { getLast7, sum7, avg7 };
};

export const formatDateToKey = (date: Date): DateKey => formatDateKey(date);

