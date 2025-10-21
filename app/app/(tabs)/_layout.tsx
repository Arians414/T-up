import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { AcademicCapIcon, ClipboardDocumentListIcon, HomeIcon, UserIcon } from 'react-native-heroicons/outline';

import { useAppState } from '@/state/appState';
import { useIntakeState } from '@/state/intakeState';
import { useWeeklyState } from '@/state/weekly';
import { getColor, getRadius, getSpacing, theme, useTheme } from '@/theme';

const WeeklyGateModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const router = useRouter();
  const themeTokens = useTheme();

  const handleProceed = () => {
    onClose();
    router.push('/weekly');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.gateCard} onPress={(event) => event.stopPropagation()}>
          <View style={{ gap: getSpacing('12') }}>
            <Text
              style={[
                styles.gateTitle,
                {
                  color: themeTokens.colors.text.primary,
                  fontFamily: 'Inter_600SemiBold',
                },
              ]}
            >
              Weekly check-in required
            </Text>
            <Text
              style={[
                styles.gateBody,
                {
                  color: themeTokens.colors.text.secondary,
                  fontFamily: 'Inter_400Regular',
                },
              ]}
            >
              Finish this week�s review to unlock Plan, Learn, and Profile.
            </Text>
          </View>
          <Pressable style={styles.gateButton} onPress={handleProceed} accessibilityRole="button">
            <Text style={styles.gateButtonLabel}>Go to weekly</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default function TabsLayout() {
  const themeTokens = useTheme();
  const router = useRouter();
  const [gateVisible, setGateVisible] = useState(false);

  const {
    isHydrating: isAppHydrating,
    entitlementStatus,
    isEntitlementLoading,
    intakeP2CompletedAt,
  } = useAppState();
  const { isHydrating: isIntakeHydrating, part2Completed, getNextStepIndex } = useIntakeState();
  const { isWeeklyDue } = useWeeklyState();

  if (isAppHydrating || isIntakeHydrating || isEntitlementLoading) {
    return null;
  }

  const effectiveEntitlement = entitlementStatus ?? 'none';
  const isEntitled = effectiveEntitlement === 'trial' || effectiveEntitlement === 'active' || effectiveEntitlement === 'grace';
  const serverHasP2 = Boolean(intakeP2CompletedAt);

  // Strict rule: entitlement first
  if (!isEntitled) {
    return <Redirect href="/paywall" />;
  }

  if (!serverHasP2 && !part2Completed) {
    const next = getNextStepIndex(2);
    const safe = Number.isFinite(Number(next)) ? Math.max(0, Math.floor(Number(next))) : 0;
    return <Redirect href={`/onboarding2/q/${safe}`} />;
  }

  const iconSize = theme.size.icon.lg;

  const guardTabPress = (event: { preventDefault: () => void }) => {
    if (isWeeklyDue) {
      event.preventDefault();
      setGateVisible(true);
    }
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: themeTokens.colors.accent.brand,
          tabBarInactiveTintColor: themeTokens.colors.text.secondary,
          tabBarStyle: {
            backgroundColor: themeTokens.colors.surface.base,
            borderTopColor: themeTokens.colors.border.subtle,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontFamily: 'Inter_500Medium',
            fontSize: theme.typography.scale.sm,
          },
          tabBarItemStyle: {
            paddingVertical: 4,
          },
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="home/index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <HomeIcon color={color} size={iconSize} />,
          }}
        />
        <Tabs.Screen
          name="plan/index"
          listeners={{ tabPress: guardTabPress }}
          options={{
            title: 'Plan',
            tabBarIcon: ({ color }) => <ClipboardDocumentListIcon color={color} size={iconSize} />,
          }}
        />
        <Tabs.Screen
          name="learn/index"
          listeners={{ tabPress: guardTabPress }}
          options={{
            title: 'Learn',
            tabBarIcon: ({ color }) => <AcademicCapIcon color={color} size={iconSize} />,
          }}
        />
        <Tabs.Screen
          name="profile/index"
          listeners={{ tabPress: guardTabPress }}
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <UserIcon color={color} size={iconSize} />,
          }}
        />
      </Tabs>
      <WeeklyGateModal visible={gateVisible && isWeeklyDue} onClose={() => setGateVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: getColor('overlay'),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: getSpacing('20'),
  },
  gateCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: getColor('surface.elev1'),
    borderRadius: getRadius('card'),
    padding: getSpacing('24'),
    gap: getSpacing('16'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.subtle'),
  },
  gateTitle: {
    fontSize: theme.typography.scale.lg,
    lineHeight: theme.typography.scale.lg * theme.typography.lineHeight.snug,
  },
  gateBody: {
    fontSize: theme.typography.scale.md,
    lineHeight: theme.typography.scale.md * theme.typography.lineHeight.normal,
  },
  gateButton: {
    backgroundColor: getColor('accent.brand'),
    borderRadius: getRadius('pill'),
    paddingVertical: getSpacing('12'),
    alignItems: 'center',
  },
  gateButtonLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: theme.typography.scale.md,
    color: getColor('text.inverse'),
  },
});
