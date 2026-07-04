import * as Notifications from 'expo-notifications';
import { addDays, isBefore, parseISO, set } from 'date-fns';
import { Alert, Platform } from 'react-native';

import { calculateEstimatedEndDate } from '@/features/inventory/inventoryLogic';
import { InventoryItem } from '@/features/inventory/inventoryTypes';
import { AppSettings } from '@/features/settings/settingsTypes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  Alert.alert(
    '通知を使います',
    '在庫切れの前にお知らせするため、通知を使います。通知はいつでも設定からオフにできます。',
  );
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

export async function cancelAllInventoryNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleInventoryNotifications(
  items: InventoryItem[],
  settings: AppSettings,
): Promise<void> {
  await cancelAllInventoryNotifications();
  if (!settings.notificationsEnabled) return;
  if (Platform.OS === 'web') return;

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  const now = new Date();
  await Promise.all(
    items.flatMap((item) => {
      const estimatedEndDate = item.estimatedEndDate || calculateEstimatedEndDate(item);
      if (!estimatedEndDate) return [];
      const notifyDays = Array.from(new Set([...item.notifyBeforeDays, 0]));
      return notifyDays
        .map((beforeDays) => {
          const targetDate = addDays(parseISO(estimatedEndDate), -beforeDays);
          const triggerDate = set(targetDate, {
            hours: settings.notificationHour,
            minutes: settings.notificationMinute,
            seconds: 0,
            milliseconds: 0,
          });
          if (isBefore(triggerDate, now)) return undefined;
          const remainingText = beforeDays === 0 ? '今日なくなる目安です' : `残り${beforeDays}日くらいです`;
          return Notifications.scheduleNotificationAsync({
            content: {
              title: 'にゃんストック',
              body: `${item.name}が${remainingText}。いつもの商品を確認しましょう。`,
              data: { inventoryItemId: item.id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: triggerDate,
            },
          });
        })
        .filter((promise): promise is Promise<string> => Boolean(promise));
    }),
  );
}
