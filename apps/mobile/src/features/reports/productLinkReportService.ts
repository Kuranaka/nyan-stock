import { ensureSupabaseSessionForSharing, getCurrentAuthSession } from '@/features/auth/supabaseAuth';
import { InventoryItem, PurchaseLinks } from '@/features/inventory/inventoryTypes';
import { getHouseholdSyncState } from '@/features/sync/householdSyncStorage';
import { requireSupabaseClient } from '@/features/supabase/supabaseClient';

export type ProductLinkIssueType = 'purchase_link' | 'image' | 'variant' | 'other';

export type SubmitProductLinkReportInput = {
  item: InventoryItem;
  issueType: ProductLinkIssueType;
  message?: string;
};

export async function submitProductLinkReport({
  item,
  issueType,
  message,
}: SubmitProductLinkReportInput): Promise<void> {
  await ensureSupabaseSessionForSharing();
  const [authSession, syncState] = await Promise.all([getCurrentAuthSession(), getHouseholdSyncState()]);
  const client = requireSupabaseClient();
  const { error } = await client.rpc('submit_product_link_report', {
    p_inventory_item_id: item.id,
    p_product_master_id: item.productMasterId,
    p_product_name: item.name,
    p_issue_type: issueType,
    p_message: message?.trim() || undefined,
    p_image_url: item.imageUrl,
    p_purchase_links: compactPurchaseLinks(item.purchaseLinks),
    p_provider: authSession?.provider,
    p_provider_user_id: authSession?.providerUserId,
    p_household_id: syncState?.householdId,
  });

  if (error) {
    throw new Error(error.message || 'お問い合わせを送信できませんでした。時間をおいてもう一度お試しください。');
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
