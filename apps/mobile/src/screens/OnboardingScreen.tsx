import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { SignInButtons } from '@/components/SignInButtons';
import { colors } from '@/constants/colors';

type Props = {
  onStart: () => Promise<void>;
  onSignedIn: () => void;
};

export default function OnboardingScreen({ onStart, onSignedIn }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [startingAsGuest, setStartingAsGuest] = useState(false);

  const startAsGuest = async () => {
    setStartingAsGuest(true);
    try {
      await onStart();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'しばらくしてからもう一度お試しください。';
      Alert.alert('開始できませんでした', message);
    } finally {
      setStartingAsGuest(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Math.max(24, insets.top + 16),
          paddingBottom: Math.max(40, insets.bottom + 24),
        },
      ]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
    >
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.brand}>
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel="にゃんストックのアプリアイコン"
              accessible
              source={require('../../assets/icon.png')}
              style={styles.mark}
              resizeMode="contain"
            />
            <Text style={styles.brandName}>にゃんストック</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            買い忘れを先回り
          </Text>
          <Text style={styles.lead}>
            ペット用品の残りを見える化{'\n'}
            なくなる前の買い足しを支えます
          </Text>
        </View>

        <View style={styles.stepsSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            はじめ方はかんたん3ステップ
          </Text>
          <View style={styles.stepsCard}>
            <View style={styles.step}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <Text style={styles.stepTitle}>ペット用品を登録</Text>
              </View>
              <Text style={styles.stepText}>フードやトイレ用品などを記録します</Text>
            </View>
            <View style={styles.stepDivider} />
            <View style={styles.step}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <Text style={styles.stepTitle}>残り日数がわかる</Text>
              </View>
              <Text style={styles.stepText}>残量と使用量から残り日数を計算します</Text>
            </View>
            <View style={styles.stepDivider} />
            <View style={styles.step}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <Text style={styles.stepTitle}>なくなる前に買い足す</Text>
              </View>
              <Text style={styles.stepText}>通知からいつもの商品をすぐ買い足せます</Text>
            </View>
          </View>
        </View>

        <View style={styles.primaryAction}>
          <AppButton
            title={startingAsGuest ? '準備しています...' : '無料で始める'}
            loading={startingAsGuest}
            disabled={startingAsGuest}
            onPress={() => void startAsGuest()}
          />
          <Text style={styles.actionHint}>
            メールアドレスは不要です{'\n'}
            ゲストアカウントを作成して始めます
          </Text>
        </View>

        <View style={styles.accountDivider}>
          <View style={styles.accountDividerLine} />
          <Text accessibilityRole="header" style={styles.accountDividerText}>
            アカウントをお持ちの方
          </Text>
          <View style={styles.accountDividerLine} />
        </View>

        <SignInButtons onSignedIn={onSignedIn} />

        <View style={styles.dataNote}>
          <Text accessibilityRole="header" style={styles.dataNoteTitle}>
            データの保存について
          </Text>
          <View style={styles.dataNoteItem}>
            <Text style={styles.dataNoteLabel}>ゲストで始める場合</Text>
            <Text style={styles.dataNoteText}>
              開始時に匿名IDを作成します。在庫データはこの端末に保存され、アプリ削除や機種変更では引き継げません。
            </Text>
          </View>
          <View style={styles.dataNoteDivider} />
          <View style={styles.dataNoteItem}>
            <Text style={styles.dataNoteLabel}>共有・引き継ぎを使う場合</Text>
            <Text style={styles.dataNoteText}>
              あとからGoogleまたはAppleでログインしてください。
            </Text>
          </View>
        </View>

        <View accessibilityRole="summary" style={styles.legalLinks}>
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.push('/privacy')}
            style={({ pressed }) => pressed && styles.legalLinkPressed}
          >
            <Text style={styles.legalLinkText}>プライバシーポリシー</Text>
          </Pressable>
          <Text accessible={false} style={styles.legalLinkSeparator}>
            ・
          </Text>
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.push('/terms')}
            style={({ pressed }) => pressed && styles.legalLinkPressed}
          >
            <Text style={styles.legalLinkText}>利用規約</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  content: {
    alignSelf: 'center',
    gap: 24,
    justifyContent: 'center',
    maxWidth: 520,
    width: '100%',
  },
  hero: {
    alignItems: 'center',
    gap: 12,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  mark: {
    borderRadius: 14,
    height: 48,
    width: 48,
  },
  brandName: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '900',
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0.5,
    lineHeight: 44,
    textAlign: 'center',
  },
  lead: {
    color: colors.subText,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 330,
    textAlign: 'center',
  },
  stepsSection: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
  stepsCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  step: {
    gap: 8,
    paddingVertical: 14,
  },
  stepHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  stepNumberText: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  stepTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 23,
  },
  stepText: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 2,
  },
  stepDivider: {
    backgroundColor: colors.border,
    height: 1,
  },
  primaryAction: {
    gap: 9,
  },
  actionHint: {
    alignSelf: 'center',
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 320,
    textAlign: 'center',
  },
  accountDivider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  accountDividerLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
  },
  accountDividerText: {
    color: colors.subText,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  dataNote: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  dataNoteTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  dataNoteItem: {
    gap: 3,
  },
  dataNoteLabel: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  dataNoteText: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 20,
  },
  legalLinks: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  legalLinkPressed: {
    opacity: 0.65,
  },
  legalLinkText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 6,
  },
  dataNoteDivider: {
    backgroundColor: colors.background,
    height: 1,
  },
});
