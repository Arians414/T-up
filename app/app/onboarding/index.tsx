import { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View, Dimensions } from "react-native";
import { useRouter } from "expo-router";

import { Button, Card } from "@/components/ui";
import { useIntakeState } from "@/state/intakeState";
import { getColor, getSpacing, theme, useTheme } from "@/theme";
import { useState } from 'react';
import { SignInSheetContent } from '../auth/sign-in/index';

const SCREEN_PADDING = getSpacing("pagePadding");
const SECTION_GAP = getSpacing("sectionGap");

// Layout constants for consistent positioning
const ICON_TOP = 233;
const ICON_SIZE = 196;
const ICON_TO_TITLE_SPACING = 0; // No spacing - icon and title directly adjacent

export default function OnboardingWelcome() {
  const router = useRouter();
  const themeTokens = useTheme();
  const { part1Completed, isHydrating, getNextStepIndex } = useIntakeState();
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (!isHydrating && part1Completed) {
      router.replace("/onboarding/analyzing");
    }
  }, [isHydrating, part1Completed, router]);

  const handleStart = () => {
    const nextStep = getNextStepIndex(1);
    router.replace(`/onboarding/q/${nextStep}`);
  };

  const handleSignIn = () => {
    // open sign-in sheet inline
    setShowSignIn(true);
  };

  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: getColor("background"),
          paddingHorizontal: SCREEN_PADDING,
          paddingVertical: SECTION_GAP,
        },
      ]}
    >
      <Image
        source={require('../../assets/app-icon.png')}
        style={[
          styles.logoAbsolute,
          {
            left: SCREEN_PADDING + Math.round((screenWidth - 2 * SCREEN_PADDING - ICON_SIZE) / 2),
            width: ICON_SIZE,
            height: ICON_SIZE,
          },
        ]}
        resizeMode="contain"
      />
      <View style={styles.centerContent}>
        <Text
          style={[
            styles.title,
            { color: themeTokens.colors.text.primary, fontFamily: 'Inter_700Bold' },
          ]}
        >
          Your T levels, Up
        </Text>
        
        <View style={styles.actions}>
          <Button label="Get Started" onPress={handleStart} />
          <Pressable onPress={handleSignIn} accessibilityRole="button">
            <Text
              style={[
                styles.link,
                { color: themeTokens.colors.text.secondary, fontFamily: 'Inter_500Medium' },
              ]}
            >
              Already have account
            </Text>
          </Pressable>
        </View>
      </View>
      {showSignIn ? (
        <SignInSheetContent
          onClose={() => setShowSignIn(false)}
          onOpenEmail={() => {
            setShowSignIn(false);
            router.push('/auth/sign-in/email');
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  centerContent: {
    alignItems: 'center',
    gap: getSpacing('32'), // Space between title and buttons
    // Place title below the absolute-positioned logo with spacing
    marginTop: ICON_TOP + ICON_SIZE + ICON_TO_TITLE_SPACING,
  },
  logoAbsolute: {
    position: 'absolute',
    top: ICON_TOP,
    // width/height and left are computed at runtime for perfect centering
  },
  actions: {
    gap: getSpacing('16'),
    width: '100%', // Make buttons full width
  },
  title: {
    textAlign: 'center',
    fontSize: theme.typography.scale.xxl,
    lineHeight: theme.typography.scale.xxl * theme.typography.lineHeight.snug,
  },
  link: {
    textAlign: "center",
    fontSize: theme.typography.scale.md,
  },
});
