import { ScrollView, StyleSheet, Text } from 'react-native';

import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

export default function AffiliateDisclosureScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard>
        <Text style={styles.text}>
          Amazonのアソシエイトとして、にゃんストック運営は適格販売により収入を得ています。Amazonを含む商品リンクにはアフィリエイトリンクが含まれる場合があり、リンク経由で購入された場合、運営者が紹介料を受け取ることがあります。アフィリエイトリンクを経由することを理由に、ユーザーの購入価格が上乗せされることはありません。
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
