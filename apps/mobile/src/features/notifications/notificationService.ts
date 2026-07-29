import * as Notifications from 'expo-notifications';
import { addDays, compareAsc, isBefore, parseISO, set } from 'date-fns';
import { Alert, Platform } from 'react-native';

import { resolveEstimatedEndDate } from '@/features/inventory/inventoryLogic';
import { InventoryItem } from '@/features/inventory/inventoryTypes';
import { AppSettings } from '@/features/settings/settingsTypes';

const canUseNativeNotifications = Platform.OS !== 'web';
const inventoryNotificationPrefix = 'nyan-stock:inventory:';
const testNotificationPrefix = 'nyan-stock:test:';
const inventoryNotificationChannelId = 'inventory-reminders';
const maxScheduledInventoryNotifications = 60;

type InventoryNotificationPlan = {
  beforeDays: number;
  estimatedEndDate: string;
  identifier: string;
  item: InventoryItem;
  triggerDate: Date;
};

export type NotificationPermissionState = 'unsupported' | 'granted' | 'denied' | 'undetermined';

export type InventoryNotificationSummary = {
  enabled: boolean;
  permissionState: NotificationPermissionState;
  scheduledCount: number;
};

if (canUseNativeNotifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function isInventoryNotificationIdentifier(identifier: string): boolean {
  return identifier.startsWith(inventoryNotificationPrefix);
}

function sanitizeIdentifierPart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_');
}

function createInventoryNotificationIdentifier(
  itemId: string,
  beforeDays: number,
  triggerDate: Date,
): string {
  return `${inventoryNotificationPrefix}${sanitizeIdentifierPart(itemId)}:${beforeDays}:${triggerDate.getTime()}`;
}

function uniqueNotifyBeforeDays(item: InventoryItem): number[] {
  return Array.from(new Set([...item.notifyBeforeDays, 0]))
    .filter((day) => Number.isFinite(day) && day >= 0)
    .sort((a, b) => b - a);
}

function buildInventoryNotificationPlans(
  items: InventoryItem[],
  settings: AppSettings,
  now: Date = new Date(),
): InventoryNotificationPlan[] {
  return items
    .flatMap((item) => {
      const estimatedEndDate = resolveEstimatedEndDate(item);
      if (!estimatedEndDate) return [];

      return uniqueNotifyBeforeDays(item)
        .map((beforeDays) => {
          const targetDate = addDays(parseISO(estimatedEndDate), -beforeDays);
          const triggerDate = set(targetDate, {
            hours: settings.notificationHour,
            minutes: settings.notificationMinute,
            seconds: 0,
            milliseconds: 0,
          });
          if (isBefore(triggerDate, now)) return undefined;
          return {
            beforeDays,
            estimatedEndDate,
            identifier: createInventoryNotificationIdentifier(item.id, beforeDays, triggerDate),
            item,
            triggerDate,
          };
        })
        .filter((plan): plan is InventoryNotificationPlan => Boolean(plan));
    })
    .sort((a, b) => compareAsc(a.triggerDate, b.triggerDate))
    .slice(0, maxScheduledInventoryNotifications);
}

async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(inventoryNotificationChannelId, {
    name: '在庫リマインダー',
    description: 'ペット用品の在庫が少なくなる前にお知らせします。',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    showBadge: false,
    sound: null,
  });
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (!canUseNativeNotifications) return 'unsupported';

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (current.canAskAgain) return 'undetermined';
  return 'denied';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!canUseNativeNotifications) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  Alert.alert(
    '通知を使います',
    '在庫切れの前にお知らせするため、通知を使います。通知はいつでも設定からオフにできます。',
  );
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

export async function cancelAllInventoryNotifications(): Promise<void> {
  if (!canUseNativeNotifications) return;

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduledNotifications
      .filter((notification) => isInventoryNotificationIdentifier(notification.identifier))
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier),
      ),
  );
}

export async function getInventoryNotificationSummary(
  settings: AppSettings,
): Promise<InventoryNotificationSummary> {
  if (!canUseNativeNotifications) {
    return {
      enabled: settings.notificationsEnabled,
      permissionState: 'unsupported',
      scheduledCount: 0,
    };
  }

  const [permissionState, scheduledNotifications] = await Promise.all([
    getNotificationPermissionState(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  return {
    enabled: settings.notificationsEnabled,
    permissionState,
    scheduledCount: scheduledNotifications.filter((notification) =>
      isInventoryNotificationIdentifier(notification.identifier),
    ).length,
  };
}

export async function scheduleInventoryNotifications(
  items: InventoryItem[],
  settings: AppSettings,
): Promise<void> {
  if (!canUseNativeNotifications) return;

  await ensureNotificationChannel();

  if (!settings.notificationsEnabled) {
    await cancelAllInventoryNotifications();
    return;
  }

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) {
    await cancelAllInventoryNotifications();
    return;
  }

  const plans = buildInventoryNotificationPlans(items, settings);
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledInventoryIdentifiers = scheduledNotifications
    .filter((notification) => isInventoryNotificationIdentifier(notification.identifier))
    .map((notification) => notification.identifier);
  const plannedIdentifiers = new Set(plans.map((plan) => plan.identifier));

  await Promise.all(
    scheduledInventoryIdentifiers
      .filter((identifier) => !plannedIdentifiers.has(identifier))
      .map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)),
  );

  const alreadyScheduledIdentifiers = new Set(scheduledInventoryIdentifiers);
  await Promise.all(
    plans
      .filter((plan) => !alreadyScheduledIdentifiers.has(plan.identifier))
      .map((plan) => {
        const remainingText =
          plan.beforeDays === 0 ? '今日なくなる目安です' : `残り${plan.beforeDays}日くらいです`;
        return Notifications.scheduleNotificationAsync({
          identifier: plan.identifier,
          content: {
            title: 'にゃんストック',
            body: `${plan.item.name}が${remainingText}。いつもの商品を確認しましょう。`,
            data: {
              kind: 'inventory-reminder',
              inventoryItemId: plan.item.id,
              beforeDays: plan.beforeDays,
              estimatedEndDate: plan.estimatedEndDate,
            },
            sound: false,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: plan.triggerDate,
            channelId: inventoryNotificationChannelId,
          },
        });
      }),
  );
}

export async function scheduleTestInventoryNotification(item?: InventoryItem): Promise<boolean> {
  if (!canUseNativeNotifications) return false;

  await ensureNotificationChannel();
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return false;

  await Notifications.scheduleNotificationAsync({
    identifier: `${testNotificationPrefix}${Date.now()}`,
    content: {
      title: 'にゃんストック',
      body: item
        ? `${item.name}のテスト通知です。タップすると商品詳細を開きます。`
        : 'テスト通知です。通知が届けば端末側の許可は有効です。',
      data: item
        ? {
            kind: 'inventory-reminder',
            inventoryItemId: item.id,
            beforeDays: 0,
            estimatedEndDate: resolveEstimatedEndDate(item),
          }
        : { kind: 'notification-test' },
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: inventoryNotificationChannelId,
    },
  });
  return true;
}

export function getInventoryItemIdFromNotificationResponse(
  response: Notifications.NotificationResponse,
): string | undefined {
  const { data } = response.notification.request.content;
  if (data.kind !== 'inventory-reminder' || typeof data.inventoryItemId !== 'string')
    return undefined;
  return data.inventoryItemId;
}
