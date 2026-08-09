import * as StoreReview from 'expo-store-review';
import { Alert } from 'react-native';

import type { StorageSchema } from '@/features/persistence/storageCodec';
import {
  readVersionedStorage,
  removeVersionedStorage,
  writeVersionedStorage,
} from '@/features/persistence/versionedStorage';
import { storageKeys } from '@/features/storageKeys';

type ReviewPromptState = {
  replenishSaveCount: number;
  promptedAt?: string;
};

type ReviewEligibleAction = 'replenish_save';

const reviewPromptThreshold = 3;
const reviewPromptStorageSchema: StorageSchema<ReviewPromptState> = {
  currentVersion: 1,
  fallback: () => ({ replenishSaveCount: 0 }),
  migrate: normalizeReviewPromptState,
  validate: isReviewPromptState,
};

export async function recordReviewEligibleAction(action: ReviewEligibleAction): Promise<void> {
  try {
    const current = await getReviewPromptState();
    if (current.promptedAt) return;

    const next: ReviewPromptState = {
      replenishSaveCount: current.replenishSaveCount + 1,
    };
    await writeVersionedStorage(storageKeys.reviewPrompt, next, reviewPromptStorageSchema);

    if (next.replenishSaveCount >= reviewPromptThreshold) {
      showReviewPromptSoon();
      await writeVersionedStorage(
        storageKeys.reviewPrompt,
        {
          ...next,
          promptedAt: new Date().toISOString(),
        },
        reviewPromptStorageSchema,
      );
    }
  } catch {
    // Review prompts should never block purchase or replenish flows.
  }
}

export async function resetReviewPromptState(): Promise<void> {
  await removeVersionedStorage(storageKeys.reviewPrompt);
}

export function showReviewPromptForDebug(): void {
  showReviewPrompt();
}

async function getReviewPromptState(): Promise<ReviewPromptState> {
  return readVersionedStorage(storageKeys.reviewPrompt, reviewPromptStorageSchema);
}

function normalizeReviewPromptState(value: unknown): ReviewPromptState {
  if (!value || typeof value !== 'object') return { replenishSaveCount: 0 };
  const state = value as Partial<ReviewPromptState>;
  return {
    replenishSaveCount:
      typeof state.replenishSaveCount === 'number' && Number.isFinite(state.replenishSaveCount)
        ? Math.max(0, Math.floor(state.replenishSaveCount))
        : 0,
    promptedAt: typeof state.promptedAt === 'string' ? state.promptedAt : undefined,
  };
}

function isReviewPromptState(value: unknown): value is ReviewPromptState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ReviewPromptState>;
  return (
    typeof state.replenishSaveCount === 'number' &&
    Number.isInteger(state.replenishSaveCount) &&
    state.replenishSaveCount >= 0 &&
    (state.promptedAt === undefined || typeof state.promptedAt === 'string')
  );
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
