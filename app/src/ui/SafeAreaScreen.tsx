import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getColor, getSpacing } from '@/theme';

type SafeAreaScreenProps = PropsWithChildren<{
  scroll?: boolean;
}>;

export const SafeAreaScreen = ({ children, scroll = true }: SafeAreaScreenProps) => {
  const insets = useSafeAreaInsets();

  const paddingHorizontal = getSpacing('pagePadding');
  const paddingTop = insets.top + paddingHorizontal;
  const paddingBottom = insets.bottom + paddingHorizontal;

  const baseBackground = getColor('background');
  const contentPadding = {
    paddingTop,
    paddingBottom,
    paddingHorizontal,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.flex, { backgroundColor: baseBackground }]}
        contentContainerStyle={[styles.content, contentPadding]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: baseBackground }, contentPadding]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 0,
  },
});
