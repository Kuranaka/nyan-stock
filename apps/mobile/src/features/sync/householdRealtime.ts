import { getSupabaseSession } from '@/features/auth/supabaseAuth';
import { supabase } from '@/features/supabase/supabaseClient';
import { getHouseholdSyncState } from './householdSyncStorage';
import { isHouseholdSyncConfigured, pullCurrentHouseholdSnapshot } from './householdSyncService';

const householdCatsTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_CATS_TABLE ?? 'household_cats';
const householdInventoryItemsTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_INVENTORY_ITEMS_TABLE ?? 'household_inventory_items';
const householdPurchaseHistoryTable = process.env.EXPO_PUBLIC_SUPABASE_HOUSEHOLD_PURCHASE_HISTORY_TABLE ?? 'household_purchase_history';

export const householdRealtimeEventName = 'nyan-stock:household-realtime-update';
export const householdRealtimeResubscribeEventName = 'nyan-stock:household-realtime-resubscribe';

export async function subscribeToHouseholdRealtime(onUpdate: () => void): Promise<() => void> {
  const state = await getHouseholdSyncState();
  if (!state || !supabase || !isHouseholdSyncConfigured()) {
    return () => undefined;
  }
  const client = supabase;
  const session = await getSupabaseSession();
  if (!session) {
    return () => undefined;
  }
  client.realtime.setAuth(session.access_token);

  const filter = `household_id=eq.${state.householdId}`;
  const channel = client
    .channel(`household-sync:${state.householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: householdCatsTable, filter }, () => {
      void pullCurrentHouseholdSnapshot().then(onUpdate).catch(() => undefined);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: householdInventoryItemsTable, filter }, () => {
      void pullCurrentHouseholdSnapshot().then(onUpdate).catch(() => undefined);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: householdPurchaseHistoryTable, filter }, () => {
      void pullCurrentHouseholdSnapshot().then(onUpdate).catch(() => undefined);
    });

  channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
