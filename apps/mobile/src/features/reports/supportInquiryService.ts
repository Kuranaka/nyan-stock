import { ensureSupabaseSessionForSharing, getCurrentAuthSession } from '@/features/auth/supabaseAuth';
import { getHouseholdSyncState } from '@/features/sync/householdSyncStorage';
import { requireSupabaseClient } from '@/features/supabase/supabaseClient';

export type SubmitSupportInquiryInput = {
  message: string;
};

const supportInquiriesTable = process.env.EXPO_PUBLIC_SUPABASE_SUPPORT_INQUIRIES_TABLE ?? 'support_inquiries';

export async function submitSupportInquiry({ message }: SubmitSupportInquiryInput): Promise<void> {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    throw new Error('お問い合わせ内容を入力してください。');
  }

  const supabaseSession = await ensureSupabaseSessionForSharing();
  const [authSession, syncState] = await Promise.all([getCurrentAuthSession(), getHouseholdSyncState()]);
  const client = requireSupabaseClient();
  const { error } = await client.from(supportInquiriesTable).insert({
    user_id: supabaseSession.user.id,
    provider: authSession?.provider,
    provider_user_id: authSession?.providerUserId,
    household_id: syncState?.householdId,
    message: trimmedMessage,
  });

  if (error) {
    throw new Error('お問い合わせを送信できませんでした。時間をおいてもう一度お試しください。');
  }
}
