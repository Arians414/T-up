import { Stack } from "expo-router";

export default function OnboardingTwoLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="q/[step]" />
      <Stack.Screen name="result" />
    </Stack>
  );
}
