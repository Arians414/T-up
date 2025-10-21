import { LogModalBase, type LogModalProps } from './LogModalBase';

export const StrengthLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="strengthSessions" {...props} />;
};
