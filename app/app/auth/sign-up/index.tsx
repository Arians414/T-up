import { useState, useMemo } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { Button, Progress } from "@/components/ui";
import { ArrowLeftIcon } from "react-native-heroicons/outline";
import { getColor, getRadius, getSpacing, theme, useTheme } from "@/theme";
import { useIntakeState, extractQuestions } from "@/state/intakeState";
import { useAppState } from "@/state/appState";
import { SignInSheetContent } from '../sign-in/index';
import part1Schema from "@schemas/qa.intake.part1.v2.json";

const SCREEN_PADDING = getSpacing("pagePadding");
const SECTION_GAP = getSpacing("sectionGap");

export default function SignUpScreen() {
  const router = useRouter();
  const themeTokens = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { reset: resetIntakeState } = useIntakeState();
  const { resetAppState } = useAppState();
  const [showSignInSheet, setShowSignInSheet] = useState(false);

  const handleContinue = () => {
    router.replace("/paywall");
  };

  const handleSignIn = () => {
    // open sign-in sheet inline
    setShowSignInSheet(true);
  };

  // Calculate the last intake question index
  const lastQuestionIndex = useMemo(() => {
    const questions = extractQuestions(part1Schema);
    return Math.max(0, questions.length - 1);
  }, []);

  const handleBack = () => {
    // Go back to last intake question (referral code)
    // This prevents the analyzing screen loop
    router.replace(`/onboarding/q/${lastQuestionIndex}`);
  };

  const progressValue = 1; // show full progress (100%) for the sign-up screen

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            backgroundColor: getColor("background"),
            padding: SCREEN_PADDING,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ height: SCREEN_PADDING }} />

        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} accessibilityRole="button" style={styles.backButton}>
            <ArrowLeftIcon size={20} strokeWidth={2} color={themeTokens.colors.accent.brand} />
          </Pressable>
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressBar, { width: `${Math.min(100, progressValue * 100)}%` }]} />
            </View>
          </View>
        </View>

        <Text
          style={[
            styles.heading,
            {
              color: themeTokens.colors.text.primary,
              fontFamily: "Inter_700Bold",
              fontSize: theme.typography.scale.xl,
              textAlign: 'center'
            },
          ]}
        >
          Sign in to Save
        </Text>

        <View style={[styles.centerArea, { justifyContent: 'center', paddingTop: 0 }]}>
          <View style={{ transform: [{ translateY: -20 }], gap: getSpacing("12"), alignItems: 'center' }}>
            <Pressable style={({ pressed }) => [styles.iconPill, { opacity: pressed ? 0.9 : 1 }]} onPress={() => {}}>
              <View style={styles.iconLeft}><Text style={styles.iconText}></Text></View>
              <Text style={styles.iconLabel}>Sign in with Apple</Text>
            </Pressable>

            <Pressable style={({ pressed }) => [styles.googlePill, { opacity: pressed ? 0.9 : 1 }]} onPress={() => {}}>
              <View style={styles.iconLeft}><Text style={styles.iconText}>G</Text></View>
              <Text style={styles.outlinedLabel}>Sign in with Google</Text>
            </Pressable>
          </View>

          <View style={{ height: getSpacing('8') }} />

          <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Pressable onPress={() => router.push('/auth/sign-up/email')}>
              <Text style={[styles.link, { textAlign: 'center', color: themeTokens.colors.text.secondary }]}>Sign in with Email</Text>
            </Pressable>
          </View>

          {__DEV__ && (
            <View style={{ width: "100%", marginTop: getSpacing("16") }}>
              <Button
                label="Restart app (dev)"
                variant="secondary"
                onPress={async () => {
                  resetIntakeState();
                  await resetAppState();
                  router.replace("/onboarding");
                }}
              />
            </View>
          )}
        </View>
      </ScrollView>
            {showSignInSheet ? (
              <SignInSheetContent
                onClose={() => setShowSignInSheet(false)}
                onOpenEmail={() => {
                  setShowSignInSheet(false);
                  router.push('/auth/sign-in/email');
                }}
              />
            ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    gap: SECTION_GAP,
  },
  subhead: {
    fontSize: theme.typography.scale.md,
    lineHeight: theme.typography.scale.md * theme.typography.lineHeight.normal,
  },
  input: {
    borderRadius: getRadius("control"),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor("border.muted"),
    backgroundColor: getColor("surface.base"),
    paddingHorizontal: getSpacing("12"),
    paddingVertical: getSpacing("10"),
    fontFamily: "Inter_500Medium",
    fontSize: theme.typography.scale.md,
  },
  link: {
    textAlign: "center",
    fontSize: theme.typography.scale.md,
  },
  topBar: {
    height: getSpacing("14"),
  },
  cardWrap: {
    alignItems: "center",
  },
  cardContent: {
    width: "100%",
    maxWidth: 380,
    borderRadius: getRadius("card"),
    backgroundColor: getColor("surface.card"),
    padding: getSpacing("24"),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor("border.subtle"),
    gap: getSpacing("8"),
  },
  title: {
    letterSpacing: 0.2,
  },
  heading: {
    lineHeight: theme.typography.scale.xl * theme.typography.lineHeight.snug,
  },
  cardSub: {
    fontSize: theme.typography.scale.md,
    marginBottom: getSpacing("8"),
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: getSpacing("8"),
    marginTop: getSpacing("8"),
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: getColor("surface.base"),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor("border.muted"),
  },
  checkboxLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: theme.typography.scale.md,
  },
  primaryButton: {
    marginTop: getSpacing("12"),
  },
  pillButton: {
    width: "100%",
    maxWidth: 360,
    borderRadius: getRadius("xl"),
  },
  progressRow: {
    width: "100%",
    position: "relative",
    alignItems: "center",
  },
  /* Onboarding-like header */
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: getSpacing("12"),
  },
  backButton: {
    padding: getSpacing("8"),
  },
  progressContainer: {
    flex: 1,
    paddingRight: 0,
  },
  progressTrack: {
    height: 6,
    borderRadius: getRadius("pill"),
    backgroundColor: getColor("surface.progressRemainder"),
    overflow: "hidden",
    width: "100%",
  },
  progressBar: {
    height: "100%",
    borderRadius: getRadius("pill"),
    backgroundColor: getColor("accent.brand"),
  },
  progressArrowWrap: {
    position: "absolute",
    right: getSpacing("6"),
    top: -getSpacing("3"),
    backgroundColor: "transparent",
  },
  progressArrowLeft: {
    position: "absolute",
    left: getSpacing("4"),
    top: -getSpacing("2"),
    backgroundColor: "transparent",
  },
  iconPill: {
    width: 342,
    height: 56,
    borderRadius: 28,
    backgroundColor: getColor("accent.brand"),
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  iconLeft: {
    position: "absolute",
    left: 28,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: theme.typography.scale.lg,
    lineHeight: theme.typography.scale.lg + 2,
  },
  iconLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: theme.typography.scale.lg,
    color: getColor("background"),
  },
  centerArea: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    marginTop: getSpacing("0") - 30,
  },
  outlinedPill: {
    width: 342,
    height: 56,
    borderRadius: 28,
    backgroundColor: getColor("surface.base"),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor("border.muted"),
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  googlePill: {
    width: 342,
    height: 56,
    borderRadius: 28,
    backgroundColor: getColor("accent.brand"),
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  outlinedLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: theme.typography.scale.lg,
    color: getColor("background"),
  },
});
