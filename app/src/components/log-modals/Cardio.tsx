import { LogModalBase, type LogModalProps } from './LogModalBase';

export const CardioLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="cardioMin" {...props} />;
};
