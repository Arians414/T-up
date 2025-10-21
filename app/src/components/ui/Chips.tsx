import { memo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Card } from './Card';
import { Chip } from './Chip';
import { getColor, getSpacing, theme } from '@/theme';

type Primitive = string | number;

type ChipOption<T extends Primitive> = {
  label: string;
  value: T;
};

type ChipsProps<T extends Primitive> = {
  options: Array<ChipOption<T>>;
  value: T | T[] | null | undefined;
  onChange: (next: T | T[]) => void;
  prompt?: string;
  multi?: boolean;
  allowEmpty?: boolean;
  style?: StyleProp<ViewStyle>;
  card?: boolean;
  testID?: string;
};

const PROMPT_COLOR = getColor('text.secondary');

export const Chips = memo(<T extends Primitive>({ options, value, onChange, prompt = 'Choose one', multi = false, allowEmpty = false, style, card = true, testID, }: ChipsProps<T>) => {
  const content = (
    <View style={[styles.stack, style]} testID={testID}>
      {prompt ? <Text style={[styles.prompt, { color: PROMPT_COLOR }]}>{prompt}</Text> : null}
      <View style={styles.row}>
        {options.map((option) => {
          const selected = multi
            ? Array.isArray(value) && (value as T[]).includes(option.value)
            : value === option.value;

          const handleSelect = () => {
            if (multi) {
              const current = Array.isArray(value) ? (value as T[]) : [];
              const exists = current.includes(option.value);
              if (exists) {
                const next = current.filter((item) => item !== option.value);
                if (next.length === 0 && !allowEmpty) {
                  return;
                }
                onChange(next as unknown as T | T[]);
              } else {
                onChange([...current, option.value] as unknown as T | T[]);
              }
            } else {
              if (!allowEmpty && selected) {
                return;
              }
              const nextValue = selected && allowEmpty ? null : option.value;
              onChange((nextValue ?? null) as unknown as T | T[]);
            }
          };

          return (
            <Chip
              key={`${option.value}`}
              label={option.label}
              selected={selected}
              onPress={handleSelect}
            />
          );
        })}
      </View>
    </View>
  );

  if (!card) {
    return content;
  }

  return (
    <Card style={styles.card}>{content}</Card>
  );
});

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
  },
  stack: {
    gap: getSpacing('16'),
  },
  prompt: {
    fontFamily: 'Inter_500Medium',
    fontSize: theme.typography.scale.sm,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: getSpacing('12'),
    justifyContent: 'center',
  },
});