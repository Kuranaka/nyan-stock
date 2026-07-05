import { Image, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { SignInButtons } from '@/components/SignInButtons';
import { colors } from '@/constants/colors';

type Props = {
  onStart: () => void;
  onSignedIn: () => void;
};

export default function OnboardingScreen({ onStart, onSignedIn }: Props) {
  return (
    <View style={styles.container}>
      <Image source={require('../../assets/icon.png')} style={styles.mark} resizeMode="contain" />
      <Text style={styles.title}>にゃんストック</Text>
      <Text style={styles.catch}>猫用品の買い忘れを防ぐ</Text>
      <View style={styles.points}>
        <Text style={styles.point}>・フード・猫砂・おやつの残り日数を自動計算</Text>
        <Text style={styles.point}>・なくなる前に通知</Text>
        <Text style={styles.point}>・いつもの商品をすぐ再購入</Text>
      </View>
      <SignInButtons onSignedIn={onSignedIn} />
      <AppButton title="ゲストアカウントで始める" onPress={onStart} />
      <View style={styles.guestBox}>
        <Text style={styles.guestTitle}>ゲストアカウントの注意点</Text>
        <Text style={styles.guestText}>
          入力したデータはこの端末に保存されます。アプリ削除や機種変更では引き継げない場合があります。
        </Text>
        <Text style={styles.guestText}>共有同期を使う場合は、あとからGoogleまたはAppleでログインしてください。</Text>
      </View>
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
    alignSelf: 'center',
    borderRadius: 18,
    height: 72,
    width: 72,
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
  guestBox: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  guestTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  guestText: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
  },
});
