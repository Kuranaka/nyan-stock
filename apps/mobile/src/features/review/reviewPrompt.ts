import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Alert } from 'react-native';

import { storageKeys } from '@/features/storageKeys';

type ReviewPromptState = {
  replenishSaveCount: number;
  promptedAt?: string;
};

type ReviewEligibleAction = 'replenish_save';

const reviewPromptThreshold = 3;

export async function recordReviewEligibleAction(action: ReviewEligibleAction): Promise<void> {
  try {
    const current = await getReviewPromptState();
    if (current.promptedAt) return;

    const next: ReviewPromptState = {
      replenishSaveCount: current.replenishSaveCount + 1,
    };
    await AsyncStorage.setItem(storageKeys.reviewPrompt, JSON.stringify(next));

    if (next.replenishSaveCount >= reviewPromptThreshold) {
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
  if (!raw) return { replenishSaveCount: 0 };

  try {
    const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
    return {
      replenishSaveCount: typeof parsed.replenishSaveCount === 'number' ? parsed.replenishSaveCount : 0,
      promptedAt: parsed.promptedAt,
    };
  } catch {
    return { replenishSaveCount: 0 };
  }
}

function showReviewPromptSoon() {
  setTimeout(showReviewPrompt, 450);
}

function showReviewPrompt() {
  Alert.alert(
    'レビューのお願い',
    'にゃんストックをお使いいただきありがとうございます。よろしければ評価やレビューをお願いします。',
    [
      { text: '今はしない', style: 'cancel' },
      { text: '評価をつける', onPress: () => void requestInAppReview() },
    ],
  );
}

async function requestInAppReview(): Promise<void> {
  try {
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
    await StoreReview.requestReview();
  } catch {
    // A review request must never interrupt the inventory workflow.
  }
}
