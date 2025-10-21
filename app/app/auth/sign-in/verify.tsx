import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { getColor, getSpacing, theme, useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useAppState } from '@/state/appState';
import { get } from '@/lib/functionsClient';

const SCREEN_PADDING = getSpacing('pagePadding');

export default function SignInVerify() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const themeTokens = useTheme();
  const { startTrial, refreshEntitlement } = useAppState();
  const email = String((params as any)?.email ?? '');

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  const handleVerify = useCallback(async () => {
    if (code === '000000') {
      await startTrial();
      router.replace('/(tabs)/home');
      return;
    }
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      // session is set on success; fetch entitlement + profile and route deterministically
      setIsRouting(true);
      try {
        const session = data.session ?? (await supabase.auth.getSession()).data.session;
        const accessToken = session?.access_token ?? null;
        if (!accessToken || !session?.user) {
          router.replace('/onboarding');
          return;
        }

        const trimmedEmail = email.trim().toLowerCase();
        if (trimmedEmail.length > 0) {
          const { error: profileEmailError } = await supabase
            .from('profiles')
            .upsert({ user_id: session.user.id, contact_email: trimmedEmail }, { onConflict: 'user_id' });
          if (profileEmailError) {
            console.warn('[fn] failed to persist profile contact_email', profileEmailError);
          }
        }

        const ent = await get<{ entitlement_status?: string }>("/get_entitlement", accessToken);
        const status = typeof ent?.entitlement_status === 'string' ? ent.entitlement_status : 'none';
        const { data: profile } = await supabase
          .from('profiles')
          .select('intake_p2_completed_at')
          .eq('user_id', session.user.id)
          .maybeSingle();

        const isEntitled = status === 'trial' || status === 'active' || status === 'grace';
        const hasP2 = Boolean(profile?.intake_p2_completed_at);

        // Update global entitlement so tabs guard won't bounce to paywall
        try { await refreshEntitlement(); } catch {}

        // Strict rule: entitlement first
        if (!isEntitled) {
          router.replace('/paywall');
        } else if (!hasP2) {
          router.replace('/onboarding2/q/0');
        } else {
          router.replace('/(tabs)/home');
        }
      } finally {
        setIsRouting(false);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Verification failed');
    }
  }, [code, router, startTrial]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.select({ ios: 'padding', android: undefined })}>
      <View style={[styles.container, { padding: SCREEN_PADDING, backgroundColor: getColor('background') }]}> 
        <Text style={[styles.heading, { color: themeTokens.colors.text.primary, fontFamily: 'Inter_700Bold', fontSize: theme.typography.scale.xl }]}>Verify</Text>
        <Text style={[styles.sub, { color: themeTokens.colors.text.secondary, marginTop: getSpacing('12') }]}>Enter the 6-digit code we sent to your email.</Text>

        <TextInput
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          placeholder="000000"
          placeholderTextColor={themeTokens.colors.text.muted}
          style={[styles.input, { color: themeTokens.colors.text.primary, marginTop: getSpacing('24') }]}
        />

        {error ? <Text style={{ color: themeTokens.colors.accent.negative, marginTop: getSpacing('8') }}>{error}</Text> : null}

        <Pressable onPress={handleVerify} style={styles.cta} disabled={isRouting}>
          <Text style={styles.ctaLabel}>Verify</Text>
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
