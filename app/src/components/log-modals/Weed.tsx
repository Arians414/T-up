import { LogModalBase, type LogModalProps } from './LogModalBase';

export const WeedLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="weedJoints" {...props} />;
};
