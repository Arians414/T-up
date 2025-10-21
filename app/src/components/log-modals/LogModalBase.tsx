import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/ui';
import { LOG_METRIC_CONFIG, type QuickAddOption } from '@/constants/logMetrics';
import { useLogs, formatDateToKey, type VapingLevel } from '@/state/logs';
import type { WeeklyMetricId } from '@/state/weekly';
import { getColor, getRadius, getSpacing, theme, useTheme } from '@/theme';

type LogModalProps = {
  visible: boolean;
  date: Date;
  onClose: () => void;
};

type BaseModalProps = LogModalProps & {
  metricId: WeeklyMetricId;
};

const Overlay = ({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) => {
  return (
    <Pressable style={styles.overlay} onPress={onDismiss}>
      <Pressable style={styles.modalSurface} onPress={(event) => event.stopPropagation()}>
        {children}
      </Pressable>
    </Pressable>
  );
};

export const LogModalBase = ({ metricId, visible, date, onClose }: BaseModalProps) => {
  const themeTokens = useTheme();
  const { getValue, setLog } = useLogs();
  const config = LOG_METRIC_CONFIG[metricId];

  const dateKey = useMemo(() => formatDateToKey(date), [date]);
  const existingValue = getValue(metricId, dateKey);

  const [inputValue, setInputValue] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config.valueKind === 'boolean') {
      setInputValue(existingValue === true ? 'yes' : existingValue === false ? 'no' : '');
    } else if (typeof existingValue === 'number') {
      const decimals = config.number?.decimals ?? 0;
      setInputValue(formatNumber(existingValue, decimals));
    } else if (typeof existingValue === 'string') {
      setInputValue(existingValue);
    } else {
      setInputValue('');
    }
    setError(null);
  }, [config.number?.decimals, config.valueKind, existingValue, visible]);

  const handleQuickAdd = (option: QuickAddOption) => {
    setError(null);

    if (config.valueKind === 'enum') {
      if (option.mode === 'set' && typeof option.value === 'string') {
        setInputValue(option.value);
      }
      return;
    }

    if (config.valueKind !== 'number') {
      return;
    }

    const { min = 0, max = 999, decimals = 0 } = config.number ?? { min: 0, max: 999, decimals: 0 };
    const current = Number.parseFloat(inputValue || '0');
    const safeCurrent = Number.isFinite(current) ? current : 0;

    if (option.mode === 'reset') {
      setInputValue('0');
      return;
    }

    const delta = typeof option.value === 'number' ? option.value : 0;

    const nextValue = option.mode === 'delta' ? clampNumber(safeCurrent + delta, min, max) : clampNumber(delta, min, max);
    setInputValue(formatNumber(nextValue, decimals));
  };

  const handleSave = () => {
    if (config.valueKind === 'boolean') {
      if (inputValue !== 'yes' && inputValue !== 'no') {
        setError('Select yes or no');
        return;
      }
      setLog(metricId, dateKey, inputValue === 'yes');
      onClose();
      return;
    }

    if (config.valueKind === 'enum') {
      if (!config.enumOptions?.some((option) => option.value === inputValue)) {
        setError('Pick an option to save');
        return;
      }
      setLog(metricId, dateKey, inputValue as VapingLevel);
      onClose();
      return;
    }

    const rawNumber = Number.parseFloat(inputValue);
    if (Number.isNaN(rawNumber)) {
      setError('Enter a number or use quick add');
      return;
    }

    const { min = 0, max = 999, decimals = 0 } = config.number ?? { min: 0, max: 999, decimals: 0 };
    const clamped = clampNumber(rawNumber, min, max);
    const rounded = decimals > 0 ? Number(clamped.toFixed(decimals)) : Math.round(clamped);
    setLog(metricId, dateKey, rounded);
    onClose();
  };

  const renderBooleanControl = () => {
    return (
      <View style={styles.radioGroup}>
        {[
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ].map((option) => {
          const selected = inputValue === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.radioOption, { borderColor: selected ? themeTokens.colors.accent.brand : themeTokens.colors.border.muted }]}
              onPress={() => {
                setInputValue(option.value);
                setError(null);
              }}
            >
              <View
                style={[
                  styles.radioIndicator,
                  {
                    borderColor: selected ? themeTokens.colors.accent.brand : themeTokens.colors.border.muted,
                    backgroundColor: selected ? themeTokens.colors.accent.brand : 'transparent',
                  },
                ]}
              />
              <Text
                style={{
                  color: themeTokens.colors.text.primary,
                  fontFamily: 'Inter_500Medium',
                  fontSize: theme.typography.scale.md,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderEnumControl = () => {
    return (
      <View style={styles.quickGrid}>
        {(config.enumOptions ?? []).map((option) => {
          const selected = inputValue === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.quickButton, selected && styles.quickButtonSelected]}
              onPress={() => {
                setInputValue(option.value);
                setError(null);
              }}
            >
              <Text
                style={{
                  color: selected ? themeTokens.colors.text.inverse : themeTokens.colors.text.primary,
                  fontFamily: 'Inter_500Medium',
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderNumberControl = () => {
    const { min = 0, max = 999, unit } = config.number ?? { min: 0, max: 999 };
    const keyboardType = (config.number?.decimals ?? 0) > 0 ? 'decimal-pad' : 'numeric';

    return (
      <View style={{ gap: getSpacing('12') }}>
        {config.quickAdd ? (
          <View style={{ gap: getSpacing('8') }}>
            <Text
              style={{
                color: themeTokens.colors.text.secondary,
                fontFamily: 'Inter_500Medium',
                fontSize: theme.typography.scale.sm,
              }}
            >
              Quick Add
            </Text>
            <View style={styles.quickGrid}>
              {config.quickAdd.options.map((option) => (
                <Pressable
                  key={option.label}
                  style={styles.quickButton}
                  onPress={() => handleQuickAdd(option)}
                >
                  <Text
                    style={{
                      color: themeTokens.colors.text.primary,
                      fontFamily: 'Inter_500Medium',
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: getSpacing('4') }}>
          <Text
            style={{
              color: themeTokens.colors.text.secondary,
              fontFamily: 'Inter_500Medium',
              fontSize: theme.typography.scale.sm,
            }}
          >
            Quantity{unit ? ` (${unit})` : ''}
          </Text>
          <TextInput
            value={inputValue}
            onChangeText={(text) => {
              setInputValue(text);
              setError(null);
            }}
            keyboardType={keyboardType}
            placeholder={`Range ${min}-${max}${unit ? ` ${unit}` : ''}`}
            placeholderTextColor={themeTokens.colors.text.muted}
            style={[styles.input, { color: themeTokens.colors.text.primary }]}
          />
        </View>
      </View>
    );
  };

  const renderControl = () => {
    if (config.valueKind === 'boolean') {
      return renderBooleanControl();
    }

    if (config.valueKind === 'enum') {
      return (
        <View style={{ gap: getSpacing('12') }}>
          <Text
            style={{
              color: themeTokens.colors.text.secondary,
              fontFamily: 'Inter_500Medium',
              fontSize: theme.typography.scale.sm,
            }}
          >
            Quick Add
          </Text>
          {renderEnumControl()}
        </View>
      );
    }

    return renderNumberControl();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.centered}>
        <Overlay onDismiss={onClose}>
          <View style={styles.cardContent}>
            <View style={{ gap: getSpacing('12') }}>
              <Text
                style={[
                  styles.title,
                  {
                    color: themeTokens.colors.text.primary,
                    fontFamily: 'Inter_600SemiBold',
                  },
                ]}
              >
                {config.modalTitle}
              </Text>
              <Text
                style={[
                  styles.helper,
                  {
                    color: themeTokens.colors.text.secondary,
                    fontFamily: 'Inter_400Regular',
                  },
                ]}
              >
                {config.modalHelper}
              </Text>
            </View>

            {renderControl()}

            {config.valueKind === 'number' && !config.quickAdd ? (
              <Text
                style={{
                  color: themeTokens.colors.text.secondary,
                  fontFamily: 'Inter_400Regular',
                  fontSize: theme.typography.scale.sm,
                }}
              >
                Tip: use whole numbers unless noted.
              </Text>
            ) : null}

            {error ? (
              <Text
                style={{
                  color: themeTokens.colors.accent.negative,
                  fontFamily: 'Inter_500Medium',
                  fontSize: theme.typography.scale.sm,
                }}
              >
                {error}
              </Text>
            ) : null}

            <View style={styles.actionsRow}>
              <Button label="Cancel" variant="secondary" onPress={onClose} />
              <Button label="Save" onPress={handleSave} />
            </View>
          </View>
        </Overlay>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export type { LogModalProps };

const clampNumber = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

const formatNumber = (value: number, decimals: number) => {
  return decimals > 0 ? value.toFixed(decimals) : String(value);
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: getColor('overlay'),
    paddingHorizontal: getSpacing('20'),
  },
  modalSurface: {
    width: '100%',
    maxWidth: 420,
  },
  cardContent: {
    backgroundColor: getColor('surface.elev1'),
    borderRadius: getRadius('card'),
    padding: getSpacing('24'),
    gap: getSpacing('16'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.subtle'),
  },
  title: {
    fontSize: theme.typography.scale.xl,
    lineHeight: theme.typography.scale.xl * theme.typography.lineHeight.snug,
  },
  helper: {
    fontSize: theme.typography.scale.md,
    lineHeight: theme.typography.scale.md * theme.typography.lineHeight.normal,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: getSpacing('8'),
  },
  quickButton: {
    paddingHorizontal: getSpacing('16'),
    paddingVertical: getSpacing('10'),
    borderRadius: getRadius('pill'),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: getColor('border.subtle'),
    backgroundColor: getColor('surface.base'),
  },
  quickButtonSelected: {
    backgroundColor: getColor('accent.brand'),
    borderColor: getColor('accent.brand'),
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: getRadius('control'),
    borderColor: getColor('border.muted'),
    backgroundColor: getColor('surface.base'),
    paddingHorizontal: getSpacing('12'),
    paddingVertical: getSpacing('10'),
    fontFamily: 'Inter_500Medium',
    fontSize: theme.typography.scale.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: getSpacing('12'),
  },
  radioGroup: {
    flexDirection: 'column',
    gap: getSpacing('12'),
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: getSpacing('12'),
    borderRadius: getRadius('control'),
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: getSpacing('10'),
    paddingHorizontal: getSpacing('12'),
    backgroundColor: getColor('surface.base'),
  },
  radioIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
