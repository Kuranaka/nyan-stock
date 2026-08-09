import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import googleLogo from '@/assets/google-g-logo.png';
import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';
import type { AuthSession } from '@/features/auth/authTypes';

export function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <AppCard style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.note}>{description}</Text> : null}
      </View>
      {children}
    </AppCard>
  );
}

export function SettingRow({
  title,
  description,
  onPress,
}: {
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
    >
      <View style={styles.menuText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function AccountProviderIcon({ session }: { session: AuthSession | undefined }) {
  if (session?.provider === 'google') {
    return (
      <View style={styles.accountLogoAvatar}>
        <Image
          accessibilityIgnoresInvertColors
          source={googleLogo}
          style={styles.accountGoogleLogo}
        />
      </View>
    );
  }

  const label = session?.provider === 'apple' ? 'A' : session?.provider === 'guest' ? 'ゲ' : '?';
  return (
    <View style={styles.accountAvatar}>
      <Text style={styles.accountAvatarText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  sectionHeader: { gap: 4 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  note: { color: colors.subText, fontSize: 14, lineHeight: 21 },
  menuRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuRowPressed: { backgroundColor: colors.muted, transform: [{ scale: 0.99 }] },
  menuText: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  rowDescription: { color: colors.subText, fontSize: 13, lineHeight: 19 },
  chevron: { color: colors.primaryDark, fontSize: 26, fontWeight: '500', lineHeight: 28 },
  statChip: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 112,
    padding: 12,
  },
  statLabel: { color: colors.subText, fontSize: 12, fontWeight: '700' },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 4 },
  infoLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  infoLabel: { color: colors.subText, fontSize: 13, lineHeight: 18 },
  infoValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
  },
  accountAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  accountLogoAvatar: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  accountGoogleLogo: { height: 20, width: 20 },
  accountAvatarText: { color: colors.primaryDark, fontSize: 16, fontWeight: '900' },
});
