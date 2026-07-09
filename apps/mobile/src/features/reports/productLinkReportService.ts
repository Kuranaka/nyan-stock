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

const productLinkReportsTable =
  process.env.EXPO_PUBLIC_SUPABASE_PRODUCT_LINK_REPORTS_TABLE ?? 'product_link_reports';

export async function submitProductLinkReport({
  item,
  issueType,
  message,
}: SubmitProductLinkReportInput): Promise<void> {
  const supabaseSession = await ensureSupabaseSessionForSharing();
  const [authSession, syncState] = await Promise.all([getCurrentAuthSession(), getHouseholdSyncState()]);
  const client = requireSupabaseClient();
  const { error } = await client.from(productLinkReportsTable).insert({
    user_id: supabaseSession.user.id,
    provider: authSession?.provider,
    provider_user_id: authSession?.providerUserId,
    user_email: authSession?.email,
    household_id: syncState?.householdId,
    inventory_item_id: item.id,
    product_master_id: item.productMasterId,
    product_name: item.name,
    issue_type: issueType,
    message: message?.trim() || undefined,
    image_url: item.imageUrl,
    purchase_links: compactPurchaseLinks(item.purchaseLinks),
  });

  if (error) {
    throw new Error('お問い合わせを送信できませんでした。時間をおいてもう一度お試しください。');
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
