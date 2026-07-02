import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { colors } from '@/constants/colors';

type Props = {
  onStart: () => void;
  onSkip: () => void;
};

export default function OnboardingScreen({ onStart, onSkip }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.mark}>🐱</Text>
      <Text style={styles.title}>にゃんストック</Text>
      <Text style={styles.catch}>猫用品の買い忘れを防ぐ</Text>
      <View style={styles.points}>
        <Text style={styles.point}>・フード・猫砂・おやつの残り日数を自動計算</Text>
        <Text style={styles.point}>・なくなる前に通知</Text>
        <Text style={styles.point}>・いつもの商品をすぐ再購入</Text>
      </View>
      <AppButton title="はじめる" onPress={onStart} />
      <AppButton title="あとで設定する" variant="secondary" onPress={onSkip} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
    padding: 24,
    backgroundColor: colors.background,
  },
  mark: {
    fontSize: 62,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  catch: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  points: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 18,
    marginVertical: 10,
  },
  point: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
});
