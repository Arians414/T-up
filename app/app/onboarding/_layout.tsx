import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="q/[step]" />
      <Stack.Screen name="analyzing" />
      <Stack.Screen name="profile-ready" />
    </Stack>
  );
}
