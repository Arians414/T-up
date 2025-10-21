import { LogModalBase, type LogModalProps } from './LogModalBase';

export const AlcoholLogModal = (props: LogModalProps) => {
  return <LogModalBase metricId="alcoholDrinks" {...props} />;
};
