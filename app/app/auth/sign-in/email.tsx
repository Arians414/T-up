import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

import { getColor, getSpacing, theme, useTheme } from '@/theme';

const SCREEN_PADDING = getSpacing('pagePadding');

export default function SignInEmailEntry() {
  const router = useRouter();
  const themeTokens = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.select({ ios: 'padding', android: undefined })}>
      <View style={[styles.container, { padding: SCREEN_PADDING, backgroundColor: getColor('background') }]}> 
        <Text style={[styles.heading, { color: themeTokens.colors.text.primary, fontFamily: 'Inter_700Bold', fontSize: theme.typography.scale.xl }]}>Sign in</Text>
        <Text style={[styles.sub, { color: themeTokens.colors.text.secondary, marginTop: getSpacing('12') }]}>Enter your email to sign in.</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
          placeholderTextColor={themeTokens.colors.text.muted}
          style={[styles.input, { color: themeTokens.colors.text.primary, marginTop: getSpacing('24') }]}
        />

        {error ? (
          <Text style={{ color: themeTokens.colors.accent.negative, marginTop: getSpacing('8') }}>{error}</Text>
        ) : null}
        <Pressable
          onPress={async () => {
            setError(null);
            try {
              const { error: authError } = await supabase.auth.signInWithOtp({
                email,
                options: { shouldCreateUser: false },
              });
              if (authError) {
                // Common case: user not found
                if (String(authError.message).toLowerCase().includes('not found')) {
                  setError('No account found — start from Welcome to sign up');
                } else {
                  setError(authError.message);
                }
                return;
              }
              setSent(true);
              router.push({ pathname: '/auth/sign-in/verify', params: { email } });
            } catch (e: any) {
              setError(e?.message ?? 'Failed to send code');
            }
          }}
          style={styles.cta}
        >
          <Text style={styles.ctaLabel}>{sent ? 'Code sent — check your email' : 'Send 6‑digit code'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  heading: { lineHeight: theme.typography.scale.xl * theme.typography.lineHeight.snug },
  sub: { fontSize: theme.typography.scale.md },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: getColor('border.muted'),
    paddingHorizontal: getSpacing('12'),
    paddingVertical: getSpacing('12'),
    fontFamily: 'Inter_500Medium',
    fontSize: theme.typography.scale.md,
  },
  cta: {
    marginTop: getSpacing('24'),
    backgroundColor: getColor('accent.brand'),
    borderRadius: 999,
    paddingVertical: getSpacing('12'),
    alignItems: 'center',
  },
  ctaLabel: { color: getColor('background'), fontFamily: 'Inter_600SemiBold', fontSize: theme.typography.scale.lg },
});
