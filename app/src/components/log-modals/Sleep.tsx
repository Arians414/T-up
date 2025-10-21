import { LogModalBase, type LogModalProps } from './LogModalBase';

export const SleepLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="sleepHours" {...props} />;
};
