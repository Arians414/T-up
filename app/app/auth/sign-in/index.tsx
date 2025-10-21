import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getColor, getSpacing, getRadius, theme, useTheme } from '@/theme';
import { useAppState } from '@/state/appState';
import { supabase } from '@/lib/supabase';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
// Compressed sheet: show only the title, buttons and short terms text.
// Use a compact fixed-ish height so the sheet shows the controls without large empty space.
const SHEET_HEIGHT = Math.max(220, Math.min(320, Math.round(SCREEN_HEIGHT * 0.28)));

export function SignInSheetContent({ onClose, onOpenEmail }: { onClose?: () => void; onOpenEmail?: () => void }) {
  const router = useRouter();
    const [contentHeight, setContentHeight] = useState<number | null>(null);
    const [activeView, setActiveView] = useState<'main' | 'email' | 'verify'>('main');
    const [emailValue, setEmailValue] = useState('');
    const [codeValue, setCodeValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const themeTokens = useTheme();
    const { startTrial } = useAppState();
    const appCtx = useAppState();

    const pan = useRef(new Animated.Value(SHEET_HEIGHT)).current; // start hidden (translated down)
    const panOffset = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // record current pan value as offset so drags start from current position
        pan.stopAnimation((value: number) => {
          panOffset.current = value;
        });
      },
      onPanResponderMove: (e, gestureState) => {
        const dy = gestureState.dy;
        const h = contentHeight ?? SHEET_HEIGHT;
        // compute value relative to the recorded offset and clamp to [0, h]
        const raw = panOffset.current + dy;
        const v = Math.min(Math.max(0, raw), h);
        pan.setValue(v);
      },
      onPanResponderRelease: (e, gestureState) => {
        const dy = gestureState.dy;
        const vy = gestureState.vy;
        const h = contentHeight ?? SHEET_HEIGHT;
        const current = panOffset.current + dy;
        // If user dragged far or flicked down, dismiss quickly
        if (current > h * 0.4 || vy > 0.9) {
          Animated.timing(pan, {
            toValue: h,
            duration: 140,
            useNativeDriver: true,
          }).start(() => {
            if (onClose) {
              try { onClose(); } catch (e) { /* swallow */ }
            } else {
              router.back();
            }
          });
        } else {
          // snap back up smoothly, clamp overshoot to avoid header peek
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
            speed: 14,
            overshootClamping: true,
          }).start();
        }
      },
    }),
  ).current;

  // When contentHeight is measured, initialize the pan to that height and animate open.
  useEffect(() => {
    if (contentHeight == null) return;
    // set pan start position to contentHeight so it animates up from below
    pan.setValue(contentHeight);
    Animated.spring(pan, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
      speed: 14,
    }).start();
  }, [contentHeight, pan]);

  const effectiveHeight = contentHeight ?? SHEET_HEIGHT;
  const sheetTranslate = pan.interpolate({
    inputRange: [0, effectiveHeight],
    outputRange: [0, effectiveHeight],
    extrapolate: 'clamp',
  });

  const handleClose = () => {
    const h = contentHeight ?? SHEET_HEIGHT;
    Animated.timing(pan, {
      toValue: h,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      if (onClose) {
        try { onClose(); } catch (e) { /* swallow errors from parent handlers */ }
      } else {
        router.back();
      }
    });
  };

  const handleApple = () => {
    // placeholder: implement Apple sign in
  };
  const handleGoogle = () => {
    // placeholder: implement Google sign in
  };
  const handleEmail = () => {
    // If a parent provided onOpenEmail explicitly and wants to handle navigation, call it.
    // Otherwise, when used inline we should close the sheet with an animation and then navigate
    // to the standalone email entry page so the user can fill their email on a full screen.
    if (onOpenEmail) {
      try { onOpenEmail(); } catch (e) { /* swallow */ }
      return;
    }
    const h = contentHeight ?? SHEET_HEIGHT;
    // animate the sheet closed, then navigate to the sign-in email entry page
    Animated.timing(pan, {
      toValue: h,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      router.push('/auth/sign-in/email');
    });
  };

  const handleDevSignin = () => {
    try {
      (appCtx as any)?.setSignedIn?.(true);
    } catch (e) {
      // ignore missing dev API
    }
    router.replace('/paywall');
  };

  const handleSendCode = async () => {
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: emailValue,
        options: { shouldCreateUser: false },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      setContentHeight(null);
      setActiveView('verify');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send email');
    }
  };

  const handleVerifyInline = async () => {
    // Dev-mode verification: code 000000 always succeeds
    if (codeValue === '000000') {
      await startTrial();
      // close inline sheet and navigate to app home (sign-in flow should not show sign-up success)
      if (onClose) {
        onClose();
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(tabs)/home');
      }
      return;
    }
    setError('Invalid code');
  };

  return (
    <Modal transparent animationType="none" visible onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <Animated.View
          style={[styles.sheet, { position: 'absolute', left: 0, right: 0, bottom: 0, transform: [{ translateY: sheetTranslate }], overflow: 'visible' }]}
        >
          <View
            onLayout={(e) => {
              const h = Math.min(e.nativeEvent.layout.height, Math.round(SCREEN_HEIGHT * 0.9));
              if (contentHeight !== h) {
                setContentHeight(h);
              }
            }}
          >
          <View style={styles.handleRow} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          {activeView === 'main' ? (
            <>
              <Text style={styles.title}>Sign In</Text>

              <View style={styles.buttonsColumn}>
                <Pressable style={({ pressed }) => [styles.iconPill, pressed && styles.pressed]} onPress={handleApple}>
                  <View style={styles.iconLeft}><Text style={styles.iconText}></Text></View>
                  <Text style={styles.iconLabel}>Sign in with Apple</Text>
                </Pressable>

                <Pressable style={({ pressed }) => [styles.iconPill, pressed && styles.pressed]} onPress={handleGoogle}>
                  <View style={styles.iconLeft}><Text style={styles.iconText}>G</Text></View>
                  <Text style={styles.iconLabel}>Sign in with Google</Text>
                </Pressable>

                <Pressable style={({ pressed }) => [styles.hollowPill, pressed && styles.pressed]} onPress={handleEmail}>
                  <View style={styles.emailLeft}><Text style={styles.emailIconText}>✉︎</Text></View>
                  <Text style={styles.hollowLabel}>Continue with Email</Text>
                </Pressable>

                <Pressable style={({ pressed }) => [styles.outlinedPill, pressed && styles.pressed]} onPress={handleDevSignin}>
                  <Text style={styles.outlinedLabel}>Dev sign-in</Text>
                </Pressable>
              </View>

              <Text style={styles.terms}>
                By continuing you agree to T-up's Terms and Conditions and Privacy Policy
              </Text>
            </>
          ) : null}

          {activeView === 'email' ? (
            <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
              <Text style={styles.title}>Enter Email</Text>
              <TextInput
                value={emailValue}
                onChangeText={setEmailValue}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="you@example.com"
                style={[styles.input, { marginTop: getSpacing('12') }]}
              />
              <Pressable onPress={handleSendCode} style={[styles.cta, { marginTop: getSpacing('16') }]}> 
                <Text style={styles.ctaLabel}>Send code</Text>
              </Pressable>
            </KeyboardAvoidingView>
          ) : null}

          {activeView === 'verify' ? (
            <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
              <Text style={styles.title}>Enter code</Text>
              <TextInput
                value={codeValue}
                onChangeText={setCodeValue}
                keyboardType="number-pad"
                placeholder="000000"
                style={[styles.input, { marginTop: getSpacing('12') }]}
              />
              {error ? <Text style={{ color: themeTokens.colors.accent.negative, marginTop: getSpacing('8') }}>{error}</Text> : null}
              <Pressable onPress={handleVerifyInline} style={[styles.cta, { marginTop: getSpacing('16') }]}> 
                <Text style={styles.ctaLabel}>Verify</Text>
              </Pressable>
            </KeyboardAvoidingView>
          ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Default page export so /auth/sign-in still works as a standalone route
export default function SignInSheet() {
  return <SignInSheetContent />;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: getColor('surface.card'),
    borderTopLeftRadius: getRadius('card'),
    borderTopRightRadius: getRadius('card'),
    paddingTop: getSpacing('8'),
    paddingHorizontal: getSpacing('20'),
    paddingBottom: getSpacing('20'),
  },
  handleRow: {
    alignItems: 'center',
    marginBottom: getSpacing('12'),
  },
  handle: {
    width: 72,
    height: 6,
    borderRadius: 6,
    backgroundColor: getColor('border.muted'),
  },
  title: {
    fontSize: 22,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    marginBottom: getSpacing('16'),
    color: getColor('text.primary'),
  },
  buttonsColumn: {
    gap: getSpacing('12'),
    alignItems: 'center',
  },
  iconPill: {
    width: '100%',
    maxWidth: 420,
    height: 56,
    borderRadius: 28,
    backgroundColor: getColor('accent.brand'),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  iconLeft: {
    position: 'absolute',
    left: 28,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailLeft: {
    position: 'absolute',
    left: 28,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailIconText: {
    fontSize: 35,
    lineHeight: 30,
    color: getColor('accent.brand'),
  },
  iconText: {
    fontSize: 25,
    lineHeight: 26,
    color: '#000000',
  },
  iconLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: '#000000',
  },
  hollowPill: {
    width: '100%',
    maxWidth: 420,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('accent.brand'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  hollowLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: getColor('accent.brand'),
  },
  outlinedPill: {
    width: '100%',
    maxWidth: 420,
    height: 56,
    borderRadius: 28,
    backgroundColor: getColor('surface.base'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.muted'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: getColor('accent.brand'),
  },
  terms: {
    marginTop: getSpacing('8'),
    fontSize: 12,
    textAlign: 'center',
    color: getColor('text.muted'),
  },
  pressed: {
    opacity: 0.85,
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.muted'),
    paddingHorizontal: getSpacing('12'),
    paddingVertical: getSpacing('12'),
    fontFamily: 'Inter_500Medium',
    fontSize: theme.typography.scale.md,
    color: getColor('text.primary'),
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
