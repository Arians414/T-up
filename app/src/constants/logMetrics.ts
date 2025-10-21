import type { WeeklyMetricId } from '@/state/weekly';
import type { VapingLevel } from '@/state/logs';

type MetricValueKind = 'number' | 'boolean' | 'enum';

type NumberInputConfig = {
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
};

type EnumOption<T extends string> = {
  label: string;
  value: T;
};

type DailyDisplayConfig = {
  subtitle?: string;
  highlightValue?: boolean;
};

type WeeklyDisplayConfig = {
  target?: number;
  unit?: string;
  highlightValue?: boolean;
};

type QuickAddOption = {
  label: string;
  mode: 'set' | 'delta' | 'reset';
  value?: number | VapingLevel;
};

type QuickAddConfig = {
  options: QuickAddOption[];
};

type LogMetricConfig = {
  id: WeeklyMetricId;
  label: string;
  valueKind: MetricValueKind;
  modalTitle: string;
  modalHelper: string;
  weeklyTitle: string;
  weeklyHelper: string;
  number?: NumberInputConfig;
  enumOptions?: Array<EnumOption<VapingLevel>>;
  daily?: DailyDisplayConfig;
  weekly?: WeeklyDisplayConfig;
  quickAdd?: QuickAddConfig;
  listLabel?: string;
};

export const WEEKLY_SEQUENCE: WeeklyMetricId[] = [
  'sleepHours',
  'proteinHit',
  'sunlight',
  'morningErection',
  'cardioMin',
  'strengthSessions',
  'alcoholDrinks',
  'sugaryDrinks',
  'fastFoodMeals',
  'cigarettes',
  'vapingUse',
  'weedJoints',
];

export const LOG_METRIC_CONFIG: Record<WeeklyMetricId, LogMetricConfig> = {
  sleepHours: {
    id: 'sleepHours',
    label: 'Sleep',
    valueKind: 'number',
    modalTitle: 'How long did you sleep?',
    modalHelper: 'Track average hours slept last night.',
    weeklyTitle: 'How was your sleep this week?',
    weeklyHelper: 'Average nightly hours from the last 7 days.',
    number: {
      min: 0,
      max: 14,
      step: 0.25,
      unit: 'hrs',
      decimals: 1,
    },
    daily: {
      subtitle: 'Tap to adjust',
      highlightValue: true,
    },
    quickAdd: {
      options: [
        { label: '6h', mode: 'set', value: 6 },
        { label: '7h', mode: 'set', value: 7 },
        { label: '8h', mode: 'set', value: 8 },
        { label: '9h', mode: 'set', value: 9 },
      ],
    },
  },
  proteinHit: {
    id: 'proteinHit',
    label: 'Protein day',
    valueKind: 'boolean',
    modalTitle: 'Did you hit protein?',
    modalHelper: 'Log if you reached your protein target today.',
    weeklyTitle: 'Protein hits this week',
    weeklyHelper: 'Count the days you hit protein.',
    daily: {
      subtitle: 'You ? 100–130 g',
    },
    weekly: {
      target: 7,
      unit: 'days',
    },
  },
  sunlight: {
    id: 'sunlight',
    label: 'Sunlight 15 minutes',
    valueKind: 'boolean',
    modalTitle: 'Did you get sunlight?',
    modalHelper: 'Log daylight exposure today.',
    weeklyTitle: 'Sunlight days',
    weeklyHelper: 'Count the days you got outside.',
    daily: {
      subtitle: 'Tap to log',
    },
    weekly: {
      target: 7,
      unit: 'days',
    },
  },
  morningErection: {
    id: 'morningErection',
    label: 'Morning erection',
    valueKind: 'boolean',
    modalTitle: 'Morning erection?',
    modalHelper: 'Track if you woke up with an erection.',
    weeklyTitle: 'Morning erections this week',
    weeklyHelper: 'Count the mornings you noticed one.',
    daily: {
      subtitle: 'Tap to answer',
    },
    weekly: {
      target: 7,
      unit: 'days',
    },
  },
  cardioMin: {
    id: 'cardioMin',
    label: 'Cardio minutes',
    valueKind: 'number',
    modalTitle: 'Cardio minutes',
    modalHelper: 'Track minutes of cardio today.',
    weeklyTitle: 'Cardio minutes this week',
    weeklyHelper: 'Total up your cardio minutes.',
    number: {
      min: 0,
      max: 600,
      step: 5,
      unit: 'min',
    },
    weekly: {
      target: 150,
      unit: 'min',
      highlightValue: true,
    },
    quickAdd: {
      options: [
        { label: '10 min', mode: 'set', value: 10 },
        { label: '20 min', mode: 'set', value: 20 },
        { label: '30 min', mode: 'set', value: 30 },
        { label: '45 min', mode: 'set', value: 45 },
        { label: '60 min', mode: 'set', value: 60 },
      ],
    },
  },
  strengthSessions: {
    id: 'strengthSessions',
    label: 'Strength sessions',
    valueKind: 'number',
    modalTitle: 'Strength sessions',
    modalHelper: 'Log strength or lifting sessions today.',
    weeklyTitle: 'Strength training this week',
    weeklyHelper: 'How many sessions did you complete?',
    number: {
      min: 0,
      max: 7,
      step: 1,
    },
    weekly: {
      target: 2,
      unit: 'sessions',
      highlightValue: true,
    },
    quickAdd: {
      options: [
        { label: '+1 session', mode: 'delta', value: 1 },
        { label: 'Reset', mode: 'reset' },
      ],
    },
  },
  alcoholDrinks: {
    id: 'alcoholDrinks',
    label: 'Alcohol drinks',
    valueKind: 'number',
    modalTitle: 'Log Alcohol',
    modalHelper: 'Count standard alcoholic drinks today.',
    weeklyTitle: 'Alcohol this week',
    weeklyHelper: 'Total standard drinks consumed.',
    number: {
      min: 0,
      max: 42,
      step: 1,
    },
    listLabel: 'Alcohol drinks',
    quickAdd: {
      options: [
        { label: '+1', mode: 'delta', value: 1 },
        { label: '+2', mode: 'delta', value: 2 },
        { label: '-1', mode: 'delta', value: -1 },
        { label: 'Reset', mode: 'reset' },
      ],
    },
  },
  sugaryDrinks: {
    id: 'sugaryDrinks',
    label: 'Sugary drinks',
    valueKind: 'number',
    modalTitle: 'Log Sugary Drinks',
    modalHelper: 'Track sugary beverages today.',
    weeklyTitle: 'Sugary drinks this week',
    weeklyHelper: 'Total sugary drinks consumed.',
    number: {
      min: 0,
      max: 42,
      step: 1,
    },
    listLabel: 'Sugary drinks',
    quickAdd: {
      options: [
        { label: '+1', mode: 'delta', value: 1 },
        { label: '+2', mode: 'delta', value: 2 },
        { label: '-1', mode: 'delta', value: -1 },
        { label: 'Reset', mode: 'reset' },
      ],
    },
  },
  fastFoodMeals: {
    id: 'fastFoodMeals',
    label: 'Fast food meals',
    valueKind: 'number',
    modalTitle: 'Log Fast-Food Meals',
    modalHelper: 'Log fast food meals today.',
    weeklyTitle: 'Fast food this week',
    weeklyHelper: 'Total fast food meals eaten.',
    number: {
      min: 0,
      max: 21,
      step: 1,
    },
    listLabel: 'Fast-food meals',
    quickAdd: {
      options: [
        { label: '+1', mode: 'delta', value: 1 },
        { label: '+2', mode: 'delta', value: 2 },
        { label: '-1', mode: 'delta', value: -1 },
        { label: 'Reset', mode: 'reset' },
      ],
    },
  },
  cigarettes: {
    id: 'cigarettes',
    label: 'Cigarettes',
    valueKind: 'number',
    modalTitle: 'Log Cigarettes',
    modalHelper: 'Count cigarettes smoked today.',
    weeklyTitle: 'Cigarettes this week',
    weeklyHelper: 'Total cigarettes smoked.',
    number: {
      min: 0,
      max: 200,
      step: 1,
    },
    listLabel: 'Cigarettes',
    quickAdd: {
      options: [
        { label: '+1', mode: 'delta', value: 1 },
        { label: '+2', mode: 'delta', value: 2 },
        { label: '-1', mode: 'delta', value: -1 },
        { label: 'Reset', mode: 'reset' },
      ],
    },
  },
  vapingUse: {
    id: 'vapingUse',
    label: 'Vaping',
    valueKind: 'enum',
    modalTitle: 'Log Vaping (usage)',
    modalHelper: 'Log how much you vaped today.',
    weeklyTitle: 'Vaping intensity this week',
    weeklyHelper: 'Pick the level that fits the week.',
    enumOptions: [
      { label: 'None', value: 'none' },
      { label: 'Small', value: 'small' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ],
    listLabel: 'Vaping',
    quickAdd: {
      options: [
        { label: 'None', mode: 'set', value: 'none' },
        { label: 'Small', mode: 'set', value: 'small' },
        { label: 'Medium', mode: 'set', value: 'medium' },
        { label: 'High', mode: 'set', value: 'high' },
      ],
    },
  },
  weedJoints: {
    id: 'weedJoints',
    label: 'Weed joints',
    valueKind: 'number',
    modalTitle: 'Log Weed (Joints)',
    modalHelper: 'Track joints or equivalent today.',
    weeklyTitle: 'Weed this week',
    weeklyHelper: 'Total joints over the week.',
    number: {
      min: 0,
      max: 42,
      step: 1,
    },
    listLabel: 'Weed',
    quickAdd: {
      options: [
        { label: '+1', mode: 'delta', value: 1 },
        { label: '+2', mode: 'delta', value: 2 },
        { label: '-1', mode: 'delta', value: -1 },
        { label: 'Reset', mode: 'reset' },
      ],
    },
  },
};

export type { LogMetricConfig, MetricValueKind, DailyDisplayConfig, WeeklyDisplayConfig, QuickAddOption, QuickAddConfig };
