import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui';
import { getColor, getSpacing, theme, useTheme } from '@/theme';

const SCREEN_PADDING = getSpacing('pagePadding');

export default function SignUpSuccess() {
  const router = useRouter();
  const themeTokens = useTheme();

  return (
    <View style={[styles.container, { padding: SCREEN_PADDING, backgroundColor: getColor('background') }]}> 
      <Text style={[styles.heading, { color: themeTokens.colors.text.primary, fontFamily: 'Inter_700Bold', fontSize: theme.typography.scale.xl }]}>You're all set</Text>
      <Text style={[styles.sub, { color: themeTokens.colors.text.secondary, marginTop: getSpacing('12') }]}>Account created. Continue to start your trial and unlock the app.</Text>

      <View style={{ marginTop: getSpacing('24') }}>
        <Button label="Continue" onPress={() => router.replace('/paywall')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { lineHeight: theme.typography.scale.xl * theme.typography.lineHeight.snug },
  sub: { fontSize: theme.typography.scale.md },
});
