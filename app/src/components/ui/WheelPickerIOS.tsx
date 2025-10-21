import { ComponentProps, useMemo } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { getColor, getRadius, getSpacing, theme } from '@/theme';

type PickerItem = ComponentProps<typeof Picker>['selectedValue'];

type WheelOption<T extends PickerItem = PickerItem> = {
  label: string;
  value: T;
};

type WheelPickerIOSProps<T extends PickerItem = PickerItem> = {
  value: T;
  onChange: (next: T) => void;
  options: Array<WheelOption<T>>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const CARD_BACKGROUND = getColor('surface.elev1');
const TEXT_COLOR = getColor('text.primary');

export const WheelPickerIOS = <T extends PickerItem>({ value, onChange, options, style, testID }: WheelPickerIOSProps<T>) => {
  const resolvedValue = useMemo(() => {
    const values = options.map((option) => option.value);
    if (values.includes(value)) {
      return value;
    }
    return values[0];
  }, [options, value]);

  return (
    <View style={[styles.card, { backgroundColor: CARD_BACKGROUND }, style]} testID={testID}>
      <Picker
        selectedValue={resolvedValue}
        onValueChange={(itemValue) => onChange(itemValue as T)}
        style={styles.picker}
        itemStyle={styles.item}
        selectionColor={getColor('accent.brand')}
        dropdownIconColor={getColor('accent.brand')}
        mode={Platform.OS === 'ios' ? 'dialog' : 'dropdown'}
      >
        {options.map((option) => (
          <Picker.Item key={`${option.value}`} label={option.label} value={option.value} color={TEXT_COLOR} />
        ))}
      </Picker>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: getRadius('card'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.subtle'),
    paddingVertical: getSpacing('12'),
    paddingHorizontal: getSpacing('8'),
    alignItems: 'stretch',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  picker: {
    width: '100%',
    height: 200,
  },
  item: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: theme.typography.scale.lg,
    color: TEXT_COLOR,
  },
});