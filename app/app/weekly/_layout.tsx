import { Stack } from 'expo-router';

import { getColor } from '@/theme';

export default function WeeklyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: getColor('background') },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="q/[step]" />
      <Stack.Screen name="result" />
    </Stack>
  );
}
