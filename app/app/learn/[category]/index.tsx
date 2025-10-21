import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Card } from '@/components/ui';
import { useTheme, getSpacing, getColor, theme } from '@/theme';
import { LEARN_DATA, type LearnCategory } from '../index';

export default function LearnCategory() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  const themeTokens = useTheme();
  const router = useRouter();
  const data: LearnCategory | undefined = category ? LEARN_DATA.categories.find((c) => c.id === category) : undefined;

  if (!data) {
    return null;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: getSpacing('20'), gap: getSpacing('16') }} style={{ backgroundColor: themeTokens.colors.background }}>
      <Text style={{ color: themeTokens.colors.text.primary, fontFamily: 'Inter_700Bold', fontSize: theme.typography.scale.xl }}>{data.title}</Text>
      <View style={{ gap: getSpacing('12') }}>
        {data.articles.length === 0 ? (
          <Text style={{ color: themeTokens.colors.text.secondary, fontFamily: 'Inter_400Regular' }}>No articles yet — coming soon</Text>
        ) : null}
        {data.articles.map((art) => (
          <Pressable key={art.id} onPress={() => router.push(`/learn/${data.id}/${art.id}`)} accessibilityRole="button">
            <Card style={{ gap: getSpacing('8') }}>
              {art.image ? (
                <Image source={{ uri: art.image }} style={{ width: '100%', height: 140, borderRadius: 8 }} resizeMode="cover" />
              ) : null}
              <View style={{ gap: getSpacing('4') }}>
                <Text style={{ color: themeTokens.colors.text.primary, fontFamily: 'Inter_600SemiBold', fontSize: theme.typography.scale.lg }}>{art.title}</Text>
                <Text style={{ color: themeTokens.colors.text.secondary, fontFamily: 'Inter_400Regular', fontSize: theme.typography.scale.sm }}>{art.readTime}</Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}


