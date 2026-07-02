import { ScrollView, StyleSheet, Text } from 'react-native';

import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

export default function AffiliateDisclosureScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard>
        <Text style={styles.text}>
          商品リンクにはアフィリエイトリンクが含まれる場合があります。リンク経由で購入された場合、運営者が紹介料を受け取ることがあります。ユーザーの購入価格が変わることはありません。
        </Text>
      </AppCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
  },
  text: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 25,
  },
});
