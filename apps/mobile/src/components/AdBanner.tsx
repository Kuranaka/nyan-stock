import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';

export function AdBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.safeArea, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="広告とアフィリエイトについて"
        onPress={() => router.push('/affiliate')}
        style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>広告</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            おすすめ猫用品の広告枠
          </Text>
          <Text style={styles.note} numberOfLines={1}>
            タップで広告・アフィリエイト表示について確認
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  banner: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  bannerPressed: {
    opacity: 0.75,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
  },
  badgeText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  note: {
    color: colors.subText,
    fontSize: 12,
    marginTop: 2,
  },
});
