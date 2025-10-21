import { Redirect } from 'expo-router';
import { useAppState } from '@/state/appState';
import { useIntakeState } from '@/state/intakeState';

export default function TabsIndex() {
  const { isHydrating: isAppHydrating } = useAppState();
  const { isHydrating: isIntakeHydrating } = useIntakeState();
  if (isAppHydrating || isIntakeHydrating) return null;
  return <Redirect href="/(tabs)/home" />;
}
