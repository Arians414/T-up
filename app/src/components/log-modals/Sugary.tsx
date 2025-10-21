import { LogModalBase, type LogModalProps } from './LogModalBase';

export const SugaryLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="sugaryDrinks" {...props} />;
};
