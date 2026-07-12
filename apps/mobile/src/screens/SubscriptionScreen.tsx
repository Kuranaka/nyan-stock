import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';
import {
  freePlanCatLimit,
  freePlanInventoryLimit,
  getCurrentOffering,
  getSubscriptionEntitlement,
  getSubscriptionErrorMessage,
  hasRevenueCatApiKey,
  isPurchaseCancelled,
  plusAnnualPriceLabel,
  plusMonthlyPriceLabel,
  purchasePlusPackage,
  restorePlusPurchase,
  SubscriptionEntitlement,
} from '@/features/subscription/subscriptionService';

export default function SubscriptionScreen() {
  const router = useRouter();
  const [entitlement, setEntitlement] = useState<SubscriptionEntitlement | undefined>();
  const [offering, setOffering] = useState<PurchasesOffering | undefined>();
  const [loading, setLoading] = useState(true);
  const [purchaseTarget, setPurchaseTarget] = useState<string | undefined>();
  const [restoring, setRestoring] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const nextEntitlement = await getSubscriptionEntitlement();
      setEntitlement(nextEntitlement);
      setOffering(hasRevenueCatApiKey() ? await getCurrentOffering() : undefined);
    } catch (error) {
      setLoadError(getSubscriptionErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const purchase = async (nextPackage: PurchasesPackage) => {
    setPurchaseTarget(nextPackage.identifier);
    try {
      const nextEntitlement = await purchasePlusPackage(nextPackage);
      setEntitlement(nextEntitlement);
      Alert.alert(
        nextEntitlement.isPlus ? 'Plusが有効になりました' : '購入を確認しました',
        nextEntitlement.isPlus
          ? '在庫と猫プロフィールの登録数上限を解除し、広告を非表示にしました。'
          : '購入状況を確認しています。反映されない場合は、しばらくしてからもう一度アプリを開いてください。',
      );
    } catch (error) {
      if (!isPurchaseCancelled(error)) {
        Alert.alert('購入できませんでした', getSubscriptionErrorMessage(error));
      }
    } finally {
      setPurchaseTarget(undefined);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      const nextEntitlement = await restorePlusPurchase();
      setEntitlement(nextEntitlement);
      Alert.alert(
        nextEntitlement.isPlus ? '購入を復元しました' : '復元できるPlus購入がありません',
        nextEntitlement.isPlus
          ? 'Plusの利用状態を反映しました。'
          : '同じストアアカウントで購入済みか確認してください。',
      );
    } catch (error) {
      Alert.alert('復元できませんでした', getSubscriptionErrorMessage(error));
    } finally {
      setRestoring(false);
    }
  };

  const openManagementUrl = async () => {
    if (!entitlement?.managementUrl) return;
    await WebBrowser.openBrowserAsync(entitlement.managementUrl);
  };

  const isPlus = entitlement?.isPlus;
  const monthlyPackage = offering?.monthly;
  const annualPackage = offering?.annual;
  const monthlyPrice = monthlyPackage?.product.priceString ?? plusMonthlyPriceLabel;
  const annualPrice = annualPackage?.product.priceString ?? plusAnnualPriceLabel;
  const otherPackages = offering?.availablePackages.filter(
    (nextPackage) =>
      nextPackage.identifier !== monthlyPackage?.identifier &&
      nextPackage.identifier !== annualPackage?.identifier,
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard style={styles.heroCard}>
        <Text style={styles.badge}>{isPlus ? 'Plus利用中' : '無料プラン'}</Text>
        <Text style={styles.title}>にゃんストック Plus</Text>
        <Text style={styles.lead}>
          よく使う家庭向けに、登録数の上限を解除して広告を非表示にします。
        </Text>
        <View style={styles.priceStrip}>
          <PricePill label="月額" value={monthlyPrice} />
          <PricePill label="年額" value={annualPrice} />
        </View>
        {loadError ? <Text style={styles.warningText}>{loadError}</Text> : null}
        {entitlement?.source === 'error' && entitlement.errorMessage ? (
          <Text style={styles.warningText}>{entitlement.errorMessage}</Text>
        ) : null}
        {entitlement?.activeProductIdentifier ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>購入商品: {entitlement.activeProductIdentifier}</Text>
            {entitlement.expirationDate ? (
              <Text style={styles.statusText}>
                有効期限: {formatDate(entitlement.expirationDate)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>無料プラン</Text>
        <PlanRow label={`猫プロフィール ${freePlanCatLimit}匹まで`} />
        <PlanRow label={`在庫登録 ${freePlanInventoryLimit}件まで`} />
        <PlanRow label="家族共有・複数端末同期" />
        <PlanRow label="購入履歴・月別費用レポート" />
        <PlanRow label="広告表示あり" />
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>Plus</Text>
        <PlanRow label="猫プロフィール 無制限" />
        <PlanRow label="在庫登録 無制限" />
        <PlanRow label="広告非表示" />
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>購入</Text>
        {loading ? <Text style={styles.note}>プランを読み込んでいます。</Text> : null}
        {!loading && hasRevenueCatApiKey() && !offering ? (
          <Text style={styles.warningText}>現在、プランを読み込めません。時間をおいてもう一度お試しください。</Text>
        ) : null}
        {monthlyPackage ? (
          <PurchaseButton
            title={`月額プラン ${monthlyPrice}`}
            nextPackage={monthlyPackage}
            disabled={Boolean(isPlus) || Boolean(purchaseTarget)}
            loading={purchaseTarget === monthlyPackage.identifier}
            onPurchase={purchase}
          />
        ) : null}
        {annualPackage ? (
          <PurchaseButton
            title={`年額プラン ${annualPrice}`}
            nextPackage={annualPackage}
            disabled={Boolean(isPlus) || Boolean(purchaseTarget)}
            loading={purchaseTarget === annualPackage.identifier}
            onPurchase={purchase}
          />
        ) : null}
        {!loading && !monthlyPackage && !annualPackage ? (
          <Text style={styles.note}>
            予定価格は{plusMonthlyPriceLabel}、{plusAnnualPriceLabel}です。
          </Text>
        ) : null}
        {otherPackages?.map((nextPackage) => (
          <PurchaseButton
            key={nextPackage.identifier}
            title={`${nextPackage.product.title} ${nextPackage.product.priceString}`}
            nextPackage={nextPackage}
            disabled={Boolean(isPlus) || Boolean(purchaseTarget)}
            loading={purchaseTarget === nextPackage.identifier}
            onPurchase={purchase}
          />
        ))}
        <AppButton
          title={restoring ? '復元中...' : '購入を復元'}
          variant="secondary"
          loading={restoring}
          disabled={!hasRevenueCatApiKey() || Boolean(purchaseTarget)}
          onPress={() => void restore()}
        />
        {entitlement?.managementUrl ? (
          <AppButton
            title="サブスクリプションを管理"
            variant="ghost"
            onPress={() => void openManagementUrl()}
          />
        ) : null}
      </AppCard>
      <AppButton title="戻る" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

function PurchaseButton({
  title,
  nextPackage,
  disabled,
  loading,
  onPurchase,
}: {
  title: string;
  nextPackage: PurchasesPackage;
  disabled: boolean;
  loading: boolean;
  onPurchase: (nextPackage: PurchasesPackage) => Promise<void>;
}) {
  return (
    <AppButton
      title={title}
      disabled={disabled}
      loading={loading}
      onPress={() => {
        void onPurchase(nextPackage);
      }}
    />
  );
}

function PlanRow({ label }: { label: string }) {
  return (
    <View style={styles.planRow}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.planText}>{label}</Text>
    </View>
  );
}

function PricePill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pricePill}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={styles.priceValue}>{value.replace(`${label}`, '')}</Text>
    </View>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ja-JP');
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    padding: 18,
    paddingBottom: 40,
  },
  heroCard: {
    gap: 14,
  },
  priceStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pricePill: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 128,
    padding: 12,
  },
  priceLabel: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '800',
  },
  priceValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  card: {
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  lead: {
    color: colors.subText,
    fontSize: 15,
    lineHeight: 23,
  },
  note: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
  },
  warningText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  statusBox: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  statusText: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  planRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  check: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '900',
    width: 18,
  },
  planText: {
    color: colors.subText,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  footnote: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
});
