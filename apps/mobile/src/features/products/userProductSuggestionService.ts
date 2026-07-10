import { ensureSupabaseSessionForSharing, getCurrentAuthSession } from '@/features/auth/supabaseAuth';
import { PurchaseLinks } from '@/features/inventory/inventoryTypes';
import { getHouseholdSyncState } from '@/features/sync/householdSyncStorage';
import { requireSupabaseClient } from '@/features/supabase/supabaseClient';

import { normalizeProductName } from './productMaster';
import { UserProductSuggestion } from './productTypes';
import { saveUserProductSuggestion } from './userProductSuggestionStorage';

type CollectUserProductSuggestionInput = {
  suggestion: UserProductSuggestion;
  inventoryItemId: string;
  purchaseLinks: PurchaseLinks;
};

const productMasterSuggestionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_PRODUCT_MASTER_SUGGESTIONS_TABLE ?? 'product_master_suggestions';

export async function collectUserProductSuggestion({
  suggestion,
  inventoryItemId,
  purchaseLinks,
}: CollectUserProductSuggestionInput): Promise<void> {
  await saveUserProductSuggestion(suggestion);
  void submitProductMasterSuggestion({ suggestion, inventoryItemId, purchaseLinks }).catch((error: unknown) => {
    console.warn('[productSuggestion] remote submit failed', error);
  });
}

async function submitProductMasterSuggestion({
  suggestion,
  inventoryItemId,
  purchaseLinks,
}: CollectUserProductSuggestionInput): Promise<void> {
  const supabaseSession = await ensureSupabaseSessionForSharing();
  const [authSession, syncState] = await Promise.all([getCurrentAuthSession(), getHouseholdSyncState()]);
  const client = requireSupabaseClient();
  const { error } = await client.from(productMasterSuggestionsTable).insert({
    user_id: supabaseSession.user.id,
    provider: authSession?.provider,
    provider_user_id: authSession?.providerUserId,
    user_email: authSession?.email,
    household_id: syncState?.householdId,
    inventory_item_id: inventoryItemId,
    product_name: suggestion.name,
    normalized_product_name: normalizeProductName(suggestion.name),
    category: suggestion.category,
    jan_code: suggestion.janCode,
    purchase_url: suggestion.purchaseUrl,
    image_url: suggestion.imageUrl,
    purchase_links: compactPurchaseLinks(purchaseLinks),
    status: suggestion.status,
  });

  if (error) {
    throw new Error(error.message);
  }
}

function compactPurchaseLinks(links: PurchaseLinks): PurchaseLinks {
  return {
    amazon: links.amazon,
    rakuten: links.rakuten,
    yahoo: links.yahoo,
    other: links.other,
  };
}
