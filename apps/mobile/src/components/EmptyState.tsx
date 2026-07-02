import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

import { AppButton } from './AppButton';

type Props = {
  title: string;
  message: string;
  actionTitle?: string;
  onAction?: () => void;
};

export function EmptyState({ title, message, actionTitle, onAction }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🐾</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionTitle && onAction ? <AppButton title={actionTitle} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
    padding: 28,
  },
  icon: {
    fontSize: 38,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: colors.subText,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
