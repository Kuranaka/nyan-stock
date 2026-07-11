export type SubscriptionPlan = 'free' | 'plus';

export type AppSettings = {
  onboardingCompleted: boolean;
  notificationsEnabled: boolean;
  notificationPermissionPrompted: boolean;
  notificationHour: number;
  notificationMinute: number;
  subscriptionPlan: SubscriptionPlan;
  selectedCatId?: string;
};

export const defaultSettings: AppSettings = {
  onboardingCompleted: false,
  notificationsEnabled: false,
  notificationPermissionPrompted: false,
  notificationHour: 9,
  notificationMinute: 0,
  subscriptionPlan: 'free',
};
