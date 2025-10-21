import { LogModalBase, type LogModalProps } from './LogModalBase';

export const VapingLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="vapingUse" {...props} />;
};
