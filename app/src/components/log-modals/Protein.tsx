import { LogModalBase, type LogModalProps } from './LogModalBase';

export const ProteinLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="proteinHit" {...props} />;
};
