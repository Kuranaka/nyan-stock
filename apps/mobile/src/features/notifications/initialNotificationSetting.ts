import { requestNotificationPermission } from '@/features/notifications/notificationService';
import { updateSettings } from '@/features/settings/settingsStorage';
import type { AppSettings } from '@/features/settings/settingsTypes';

type InitialNotificationContext = {
  onboardingJustCompleted?: boolean;
  settingsAlreadySaved: boolean;
};

export function shouldConfirmInitialNotificationSetting(
  currentSettings: AppSettings,
  context: InitialNotificationContext,
): boolean {
  if (currentSettings.notificationPermissionPrompted) return false;
  return context.onboardingJustCompleted === true || !context.settingsAlreadySaved;
}

export async function confirmInitialNotificationSetting(
  currentSettings: AppSettings,
  context: InitialNotificationContext,
): Promise<AppSettings> {
  if (!shouldConfirmInitialNotificationSetting(currentSettings, context)) {
    return currentSettings;
  }

  let notificationsEnabled = false;
  try {
    notificationsEnabled = await requestNotificationPermission();
  } catch (error) {
    console.warn('[notifications] initial permission request failed', error);
  }

  return updateSettings({
    notificationPermissionPrompted: true,
    notificationsEnabled,
  });
}
