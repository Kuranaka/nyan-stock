import { ensureSupabaseSessionForSharing, getCurrentAuthSession } from '@/features/auth/supabaseAuth';
import { getHouseholdSyncState } from '@/features/sync/householdSyncStorage';
import { requireSupabaseClient } from '@/features/supabase/supabaseClient';

export type SubmitSupportInquiryInput = {
  message: string;
};

export async function submitSupportInquiry({ message }: SubmitSupportInquiryInput): Promise<void> {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    throw new Error('お問い合わせ内容を入力してください。');
  }

  await ensureSupabaseSessionForSharing();
  const [authSession, syncState] = await Promise.all([getCurrentAuthSession(), getHouseholdSyncState()]);
  const client = requireSupabaseClient();
  const { error } = await client.rpc('submit_support_inquiry', {
    p_message: trimmedMessage,
    p_provider: authSession?.provider,
    p_provider_user_id: authSession?.providerUserId,
    p_household_id: syncState?.householdId,
  });

  if (error) {
    throw new Error(error.message || 'お問い合わせを送信できませんでした。時間をおいてもう一度お試しください。');
  }
}
