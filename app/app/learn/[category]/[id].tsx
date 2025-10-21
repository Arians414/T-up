import { ScrollView, StyleSheet, Text, View, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useTheme, getSpacing, theme } from '@/theme';
import { LEARN_DATA, type LearnCategory, type LearnArticle } from '../index';

export default function LearnArticle() {
  const { category, id } = useLocalSearchParams<{ category?: string; id?: string }>();
  const themeTokens = useTheme();
  const cat: LearnCategory | undefined = category ? LEARN_DATA.categories.find((c) => c.id === category) : undefined;
  const article: LearnArticle | undefined = cat?.articles.find((a) => a.id === id);

  return (
    <ScrollView contentContainerStyle={{ padding: getSpacing('20'), gap: getSpacing('12') }} style={{ backgroundColor: themeTokens.colors.background }}>
      <Text style={{ color: themeTokens.colors.text.primary, fontFamily: 'Inter_700Bold', fontSize: theme.typography.scale.xl }}>{article?.title ?? 'Article not found'}</Text>
      {article?.image ? (
        <Image source={{ uri: article.image }} style={{ width: '100%', height: 180, borderRadius: 10 }} resizeMode="cover" />
      ) : null}
      {article?.body ? (
        <Text style={{ color: themeTokens.colors.text.secondary, fontFamily: 'Inter_400Regular', fontSize: theme.typography.scale.md }}>
          {article.body}
        </Text>
      ) : (
        <Text style={{ color: themeTokens.colors.text.secondary, fontFamily: 'Inter_400Regular' }}>Article not found / coming soon</Text>
      )}
    </ScrollView>
  );
}


