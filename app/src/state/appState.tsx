import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { get } from '@/lib/functionsClient';

const STORAGE_KEY = 'tup.appState.v1';

type ResultSource = 'intake_p2' | 'weekly_checkin' | 'recalc';

type LastResult = {
  score: number;
  potential?: number | null;
  generatedAt?: string;
  modelVersion?: string;
  source?: ResultSource;
  recordedAt?: number;
  /** @deprecated retained for legacy persisted data */
  at?: number;
};
type SmokingPrefs = { cigarettes: boolean; vape: boolean; weed: boolean };

type StoredState = {
  trialStartedAt?: string;
  weeklyDueAt?: string;
  lastResult?: LastResult;
  smoking?: SmokingPrefs;
  intakeP2CompletedAt?: string;
};

type AppStateContextValue = {
  isHydrating: boolean;
  trialStartedAt?: string;
  weeklyDueAt?: string;
  hasTrialStarted: boolean;
  entitlementStatus: string | null;
  isEntitlementLoading: boolean;
  startTrial: () => Promise<void>;
  refreshEntitlement: () => Promise<void>;
  setWeeklyDueAt: (next: Date | string) => Promise<void>;
  resetAppState: () => Promise<void>;
  lastResult?: LastResult;
  setLastResult: (result: LastResult) => Promise<void>;
  smoking: SmokingPrefs;
  setSmoking: (next: SmokingPrefs) => Promise<void>;
  intakeP2CompletedAt?: string;
};

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export const AppStateProvider = ({ children }: PropsWithChildren) => {
  const [storedState, setStoredState] = useState<StoredState>({});
  const [isHydrating, setIsHydrating] = useState(true);
  const [entitlementStatus, setEntitlementStatus] = useState<string | null>(null);
  const [isEntitlementLoading, setIsEntitlementLoading] = useState(true);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const refreshEntitlement = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const run = (async () => {
      setIsEntitlementLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        let session = data.session ?? null;
        let accessToken = session?.access_token ?? null;

        if (!accessToken) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          session = refreshed.session ?? session;
          accessToken = session?.access_token ?? null;
        }

        if (!accessToken || !session?.user) {
          setEntitlementStatus(null);
          return;
        }

        const response = await get<{ entitlement_status?: string }>('/get_entitlement', accessToken);
        const status =
          typeof response?.entitlement_status === 'string' ? response.entitlement_status : 'none';
        setEntitlementStatus(status);

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('trial_started_at, intake_p2_completed_at, next_week_due_at')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (!profileError) {
          const remoteTrialStartedAt =
            typeof profile?.trial_started_at === 'string' ? profile.trial_started_at : undefined;
          const remoteWeeklyDueAt =
            typeof profile?.next_week_due_at === 'string' ? profile.next_week_due_at : undefined;
          const remoteP2CompletedAt =
            typeof profile?.intake_p2_completed_at === 'string' ? profile.intake_p2_completed_at : undefined;

          setStoredState((prev) => {
            const current = prev.trialStartedAt ?? undefined;
            if (
              current === remoteTrialStartedAt &&
              prev.weeklyDueAt === remoteWeeklyDueAt &&
              prev.intakeP2CompletedAt === remoteP2CompletedAt
            ) {
              return prev;
            }
            const next: StoredState = {
              ...prev,
              trialStartedAt: remoteTrialStartedAt,
              weeklyDueAt: remoteWeeklyDueAt ?? prev.weeklyDueAt,
              intakeP2CompletedAt: remoteP2CompletedAt ?? prev.intakeP2CompletedAt,
            };
            void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((error) => {
              console.warn('Failed to persist app state', error);
            });
            return next;
          });
        }
      } catch {
        setEntitlementStatus(null);
      } finally {
        setIsEntitlementLoading(false);
      }
    })();

    refreshPromiseRef.current = run.finally(() => {
      refreshPromiseRef.current = null;
    });

    return refreshPromiseRef.current;
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as StoredState;
          const rawResult = parsed.lastResult;
          let normalizedResult: LastResult | undefined;
          if (rawResult && typeof rawResult === 'object') {
            const scoreValue = Number((rawResult as any).score ?? NaN);
            if (Number.isFinite(scoreValue)) {
              const potentialValue = (rawResult as any).potential;
              normalizedResult = {
                score: scoreValue,
                potential:
                  typeof potentialValue === 'number'
                    ? potentialValue
                    : potentialValue === null
                    ? null
                    : undefined,
                generatedAt:
                  typeof (rawResult as any).generatedAt === 'string'
                    ? (rawResult as any).generatedAt
                    : undefined,
                modelVersion:
                  typeof (rawResult as any).modelVersion === 'string'
                    ? (rawResult as any).modelVersion
                    : undefined,
                source: (rawResult as any).source as ResultSource | undefined,
                recordedAt:
                  typeof (rawResult as any).recordedAt === 'number'
                    ? (rawResult as any).recordedAt
                    : typeof (rawResult as any).at === 'number'
                    ? (rawResult as any).at
                    : undefined,
              };
            }
          }

          setStoredState({
            trialStartedAt: parsed.trialStartedAt,
            weeklyDueAt: parsed.weeklyDueAt,
            lastResult: normalizedResult,
            smoking: parsed.smoking,
            intakeP2CompletedAt: parsed.intakeP2CompletedAt,
          });
        }
      } catch (error) {
        console.warn('Failed to load app state', error);
      } finally {
        setIsHydrating(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    void refreshEntitlement();
  }, [refreshEntitlement]);

  const persist = useCallback(async (nextState: StoredState) => {
    setStoredState(nextState);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch (error) {
      console.warn('Failed to persist app state', error);
    }
  }, []);

  const startTrial = useCallback(async () => {
    if (storedState.trialStartedAt) {
      await refreshEntitlement();
      return;
    }

    const startedAt = new Date();
    const trialStartedAt = startedAt.toISOString();

    const weeklyDue = new Date(startedAt);
    weeklyDue.setDate(weeklyDue.getDate() + 7);
    weeklyDue.setHours(19, 0, 0, 0);
    const weeklyDueAt = weeklyDue.toISOString();

    await persist({ trialStartedAt, weeklyDueAt });
    await refreshEntitlement();
  }, [persist, refreshEntitlement, storedState.trialStartedAt]);

  const setWeeklyDueAt = useCallback<AppStateContextValue['setWeeklyDueAt']>(
    async (next) => {
      const iso = typeof next === 'string' ? next : next.toISOString();
      await persist({
        ...storedState,
        weeklyDueAt: iso,
      });
    },
    [persist, storedState],
  );

  const setLastResult = useCallback<AppStateContextValue['setLastResult']>(
    async (result) => {
      await persist({
        ...storedState,
        lastResult: result,
      });
    },
    [persist, storedState],
  );

  const setSmoking = useCallback<AppStateContextValue['setSmoking']>(
    async (next) => {
      await persist({
        ...storedState,
        smoking: next,
      });
    },
    [persist, storedState],
  );

  const resetAppState = useCallback(async () => {
    await persist({});
  }, [persist]);

  const value = useMemo<AppStateContextValue>(() => {
    const defaultSmoking: SmokingPrefs = { cigarettes: true, vape: true, weed: true };
    return {
      isHydrating,
      trialStartedAt: storedState.trialStartedAt,
      weeklyDueAt: storedState.weeklyDueAt,
      hasTrialStarted:
        entitlementStatus === 'trial' || entitlementStatus === 'active' || entitlementStatus === 'grace',
      entitlementStatus,
      isEntitlementLoading,
      startTrial,
      refreshEntitlement,
      setWeeklyDueAt,
      resetAppState,
      lastResult: storedState.lastResult,
      setLastResult,
      smoking: storedState.smoking ?? defaultSmoking,
      setSmoking,
      intakeP2CompletedAt: storedState.intakeP2CompletedAt,
    };
  }, [
    entitlementStatus,
    isEntitlementLoading,
    isHydrating,
    refreshEntitlement,
    resetAppState,
    setWeeklyDueAt,
    setLastResult,
    setSmoking,
    startTrial,
    storedState,
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const context = useContext(AppStateContext);

  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }

  return context;
};
