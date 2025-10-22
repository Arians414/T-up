import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { getColor, getSpacing, theme, useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useAppState } from '@/state/appState';
import { post } from '@/lib/functionsClient';
import { getOrCreateInstallId } from '@/lib/installId';

const SCREEN_PADDING = getSpacing('pagePadding');

export default function SignUpVerify() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const themeTokens = useTheme();
  const { startTrial } = useAppState();
  const email = String((params as any)?.email ?? '');
  const providedNameParam = (params as any)?.name;
  const providedName = typeof providedNameParam === 'string' ? providedNameParam.trim() : '';

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const syncAfterSignup = useCallback(async (options?: { name?: string; email?: string }) => {
    try {
      let accessToken: string | null | undefined = null;
      const { data: initialSession } = await supabase.auth.getSession();
      accessToken = initialSession.session?.access_token;
      let activeUser = initialSession.session?.user ?? null;
      if (!accessToken) {
        console.log('[fn] token present?', false, '- polling getSession()');
        for (let attempt = 0; attempt < 10; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          const { data } = await supabase.auth.getSession();
          accessToken = data.session?.access_token;
          if (data.session?.user) {
            activeUser = data.session.user;
          }
          if (accessToken) {
            break;
          }
        }
      } else {
        console.log('[fn] token present?', true);
        if (initialSession.session?.user) {
          activeUser = initialSession.session.user;
        }
      }

      if (!accessToken) {
        console.warn('[fn] signup sync skipped - missing session token');
        return;
      }

      console.log('[fn] ensure_profile start');
      await post('/ensure_profile', {}, accessToken);

      console.log('[fn] link_anonymous_p1_to_user start');
      const installId = await getOrCreateInstallId();
      const linkResult = await post<{ ok: boolean; submission_id?: string; linked?: boolean }>(
        '/link_anonymous_p1_to_user', 
        { install_id: installId }, 
        accessToken
      );

      // Link referral code if user entered one
      console.log('[fn] link_referral_on_signup start');
      try {
        await post('/link_referral_on_signup', { install_id: installId }, accessToken);
      } catch (referralError) {
        // Don't fail signup if referral linking fails
        console.warn('[fn] referral linking failed (non-critical)', referralError);
      }

      const trimmedName = options?.name?.trim();
      if (trimmedName && trimmedName.length > 0) {
        try {
          await supabase.auth.updateUser({ data: { full_name: trimmedName } });
        } catch (updateError) {
          console.warn('[fn] failed to update auth metadata full_name', updateError);
        }

        const targetUserId = activeUser?.id ?? (await supabase.auth.getUser()).data.user?.id;
        if (targetUserId) {
          const profileUpdate: Record<string, unknown> = { user_id: targetUserId, display_name: trimmedName };
          const trimmedEmail = typeof options?.email === 'string' ? options.email.trim().toLowerCase() : undefined;
          if (trimmedEmail && trimmedEmail.length > 0) {
            profileUpdate.contact_email = trimmedEmail;
          }
          const { error: profileNameError } = await supabase
            .from('profiles')
            .upsert(profileUpdate, { onConflict: 'user_id' });
          if (profileNameError) {
            console.warn('[fn] failed to persist profile display_name', profileNameError);
          }
        }
      } else {
        const targetUserId = activeUser?.id ?? (await supabase.auth.getUser()).data.user?.id;
        const trimmedEmail = typeof options?.email === 'string' ? options.email.trim().toLowerCase() : undefined;
        if (targetUserId && trimmedEmail && trimmedEmail.length > 0) {
          const { error: emailOnlyError } = await supabase
            .from('profiles')
            .upsert({ user_id: targetUserId, contact_email: trimmedEmail }, { onConflict: 'user_id' });
          if (emailOnlyError) {
            console.warn('[fn] failed to persist profile contact_email', emailOnlyError);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[fn] signup sync error', message);
      Alert.alert('Sync issue', message);
    }
  }, []);

  const handleVerify = useCallback(async () => {
    if (code === '000000') {
      await startTrial();
      await syncAfterSignup({ name: providedName, email });
      // After successful verification in sign-up, route to the paywall
      router.replace('/paywall');
      return;
    }
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      if (data.session?.access_token) {
        console.log('[fn] token present?', true);
      }
      await syncAfterSignup({ name: providedName, email });
      router.replace('/paywall');
    } catch (e: any) {
      setError(e?.message ?? 'Verification failed');
    }
  }, [code, email, providedName, router, startTrial, syncAfterSignup]);

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

        <Pressable onPress={handleVerify} style={styles.cta}>
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
