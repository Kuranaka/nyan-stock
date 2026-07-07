import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';

import { storageKeys } from '@/features/storageKeys';

type ReviewPromptState = {
  purchaseOpenCount: number;
  replenishSaveCount: number;
  promptedAt?: string;
};

type ReviewEligibleAction = 'purchase_open' | 'replenish_save';

const reviewPromptThreshold = 3;
const iosAppStoreId = process.env.EXPO_PUBLIC_IOS_APP_STORE_ID;
const appReviewUrl = process.env.EXPO_PUBLIC_APP_REVIEW_URL;

export async function recordReviewEligibleAction(action: ReviewEligibleAction): Promise<void> {
  try {
    const current = await getReviewPromptState();
    if (current.promptedAt) return;

    const next: ReviewPromptState = {
      purchaseOpenCount: current.purchaseOpenCount + (action === 'purchase_open' ? 1 : 0),
      replenishSaveCount: current.replenishSaveCount + (action === 'replenish_save' ? 1 : 0),
    };
    await AsyncStorage.setItem(storageKeys.reviewPrompt, JSON.stringify(next));

    if (next.purchaseOpenCount >= reviewPromptThreshold && next.replenishSaveCount >= reviewPromptThreshold) {
      showReviewPromptSoon();
      await AsyncStorage.setItem(
        storageKeys.reviewPrompt,
        JSON.stringify({
          ...next,
          promptedAt: new Date().toISOString(),
        }),
      );
    }
  } catch {
    // Review prompts should never block purchase or replenish flows.
  }
}

export async function resetReviewPromptState(): Promise<void> {
  await AsyncStorage.removeItem(storageKeys.reviewPrompt);
}

export function showReviewPromptForDebug(): void {
  showReviewPrompt();
}

async function getReviewPromptState(): Promise<ReviewPromptState> {
  const raw = await AsyncStorage.getItem(storageKeys.reviewPrompt);
  if (!raw) return { purchaseOpenCount: 0, replenishSaveCount: 0 };

  try {
    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
    return {
      purchaseOpenCount: typeof parsed.purchaseOpenCount === 'number' ? parsed.purchaseOpenCount : 0,
      replenishSaveCount: typeof parsed.replenishSaveCount === 'number' ? parsed.replenishSaveCount : 0,
      promptedAt: parsed.promptedAt,
    };
  } catch {
    return { purchaseOpenCount: 0, replenishSaveCount: 0 };
  }
}

function showReviewPromptSoon() {
  setTimeout(showReviewPrompt, 450);
}

function showReviewPrompt() {
  Alert.alert(
    'レビューのお願い',
    '商品の購入や補充記録に使っていただきありがとうございます。ストアでレビューしていただけると励みになります。',
    [
      { text: '今はしない', style: 'cancel' },
      { text: 'レビューする', onPress: () => void openReviewPage() },
    ],
  );
}

async function openReviewPage(): Promise<void> {
  const url = getReviewUrl();
  if (!url) {
    Alert.alert('レビュー先が未設定です', 'ストア公開後にレビューURLを設定すると、ここからレビュー画面を開けます。');
    return;
  }

  try {
    if (Platform.OS === 'android' && url.startsWith('market://') && !(await Linking.canOpenURL(url))) {
      await Linking.openURL('https://play.google.com/store/apps/details?id=com.nyanstock.app');
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('レビュー画面を開けませんでした', '時間をおいてもう一度お試しください。');
  }
}

function getReviewUrl(): string | undefined {
  if (appReviewUrl) return appReviewUrl;
  if (Platform.OS === 'ios' && iosAppStoreId) {
    return `itms-apps://itunes.apple.com/app/id${iosAppStoreId}?action=write-review`;
  }
  if (Platform.OS === 'android') {
    return 'market://details?id=com.nyanstock.app';
  }
  return undefined;
}
