import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';
import { getColor, getSpacing, theme, useTheme } from '@/theme';

const parseTokensFromUrl = (url: string | null | undefined) => {
  if (!url) return { access_token: undefined, refresh_token: undefined };
  try {
    const parsed = new URL(url);
    const queryAccess = parsed.searchParams.get('access_token') ?? undefined;
    const queryRefresh = parsed.searchParams.get('refresh_token') ?? undefined;

    // Hash may look like: #access_token=...&refresh_token=...
    const hash = parsed.hash?.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    const hashParams = new URLSearchParams(hash ?? '');
    const hashAccess = hashParams.get('access_token') ?? undefined;
    const hashRefresh = hashParams.get('refresh_token') ?? undefined;

    return {
      access_token: queryAccess ?? hashAccess,
      refresh_token: queryRefresh ?? hashRefresh,
    };
  } catch {
    return { access_token: undefined, refresh_token: undefined };
  }
};

export default function AuthCallback() {
  const router = useRouter();
  const themeTokens = useTheme();
  const [error, setError] = useState<string | null>(null);
  const url = Linking.useURL();

  const initialUrl = useMemo(() => url, [url]);

  useEffect(() => {
    const run = async () => {
      try {
        const fromHook = initialUrl ?? (await Linking.getInitialURL());
        const { access_token, refresh_token } = parseTokensFromUrl(fromHook);
        if (!access_token || !refresh_token) {
          setError('Missing tokens in callback URL');
          return;
        }
        const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
        if (setErr) {
          setError(setErr.message);
          return;
        }
        router.replace('/paywall');
      } catch (e: any) {
        setError(e?.message ?? 'Failed to complete sign-in');
      }
    };
    void run();
  }, [initialUrl, router]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: getColor('background'),
          paddingHorizontal: getSpacing('20'),
          paddingTop: getSpacing('40'),
        },
      ]}
    >
      <Text
        style={[
          styles.title,
          { color: themeTokens.colors.text.primary, fontFamily: 'Inter_700Bold', fontSize: theme.typography.scale.xl },
        ]}
      >
        Signing you in…
      </Text>
      {error ? (
        <Text style={{ color: themeTokens.colors.accent.negative, marginTop: getSpacing('12') }}>{error}</Text>
      ) : (
        <ActivityIndicator style={{ marginTop: getSpacing('12') }} color={themeTokens.colors.accent.brand} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    letterSpacing: 0.3,
  },
});




