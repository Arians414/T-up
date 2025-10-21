import { LogModalBase, type LogModalProps } from './LogModalBase';

export const FastFoodLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="fastFoodMeals" {...props} />;
};
