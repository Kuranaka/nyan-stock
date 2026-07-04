import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors } from '@/constants/colors';

type Props = TextInputProps & {
  label: string;
  error?: string;
  requirement?: 'required' | 'optional' | 'conditional';
};

export function AppTextInput({ label, error, requirement, style, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {requirement ? (
          <Text
            style={[
              styles.requirementBadge,
              requirement === 'required' && styles.requiredBadge,
              requirement === 'optional' && styles.optionalBadge,
              requirement === 'conditional' && styles.conditionalBadge,
            ]}
          >
            {requirement === 'required' ? '必須' : requirement === 'conditional' ? 'どちらか必須' : '任意'}
          </Text>
        ) : null}
      </View>
      <TextInput
        placeholderTextColor={colors.subText}
        style={[styles.input, Boolean(error) && styles.inputError, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 7,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  requirementBadge: {
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  requiredBadge: {
    backgroundColor: colors.dangerLight,
    color: colors.danger,
  },
  optionalBadge: {
    backgroundColor: colors.muted,
    color: colors.subText,
  },
  conditionalBadge: {
    backgroundColor: colors.warningLight,
    color: colors.primaryDark,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
});
