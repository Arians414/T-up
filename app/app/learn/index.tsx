import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card } from '@/components/ui';
import { useTheme, getSpacing, getRadius, getColor, theme } from '@/theme';

// Types for Learn data
export interface LearnArticle {
  id: string;
  title: string;
  image?: string | null;
  readTime?: string;
  body?: string; // optional; if missing we show an empty state
}

export interface LearnCategory {
  id: string;
  title: string;
  subtitle?: string;
  articles: LearnArticle[]; // can be empty; UI shows empty state
}

export interface LearnDataset {
  categories: LearnCategory[];
}

export default function LearnCategories() {
  const themeTokens = useTheme();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={{ padding: getSpacing('20'), gap: getSpacing('16') }} style={{ backgroundColor: themeTokens.colors.background }}>
      <Text style={{ color: themeTokens.colors.text.primary, fontFamily: 'Inter_700Bold', fontSize: theme.typography.scale.xl }}>Learn</Text>
      <View style={styles.grid}>
        {LEARN_DATA.categories.map((cat) => (
          <Pressable key={cat.id} onPress={() => router.push(`/learn/${cat.id}`)} style={styles.cell} accessibilityRole="button">
            <Card style={{ gap: getSpacing('6') }}>
              <View style={styles.icon} />
              <Text style={[styles.title, { color: themeTokens.colors.text.primary }]}>{cat.title}</Text>
              <Text style={[styles.subtitle, { color: themeTokens.colors.text.secondary }]}>{cat.subtitle}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: getSpacing('12'),
  },
  cell: {
    width: '48%'
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: getColor('accent.brand'),
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: theme.typography.scale.lg,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: theme.typography.scale.sm,
  },
});

export const LEARN_DATA: LearnDataset = {
  categories: [
    { id: 'training', title: 'Training', subtitle: 'Strength, cardio, mobility', articles: [] },
    { id: 'sleep', title: 'Sleep', subtitle: 'Quality, duration, timing', articles: [] },
    { id: 'nutrition', title: 'Nutrition', subtitle: 'Macros, hydration, timing', articles: [] },
    { id: 'stress', title: 'Stress', subtitle: 'Recovery, mindfulness', articles: [] },
    { id: 'sex', title: 'Sex', subtitle: 'Libido, function, frequency', articles: [] },
    { id: 'substances', title: 'Substances', subtitle: 'Alcohol, weed, nicotine', articles: [] },
  ],
};


