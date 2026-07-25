import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { colors } from '@/constants/colors';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

const textStyles: Record<Variant, TextStyle> = {
  primary: { color: colors.card },
  secondary: { color: colors.primaryDark },
  danger: { color: colors.danger },
  ghost: { color: colors.primaryDark },
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  selected,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const indicatorColor =
    variant === 'primary' ? colors.card : variant === 'danger' ? colors.danger : colors.primaryDark;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading, selected }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        selected && styles.selected,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={indicatorColor} size="small" /> : null}
        <Text style={[styles.text, textStyles[variant]]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  secondary: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.interactiveBorder,
  },
  danger: {
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  selected: {
    borderColor: colors.primaryDark,
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.86,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
});
