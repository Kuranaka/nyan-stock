export type AppSettings = {
  onboardingCompleted: boolean;
  notificationsEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
  selectedCatId?: string;
};

export const defaultSettings: AppSettings = {
  onboardingCompleted: false,
  notificationsEnabled: false,
  notificationHour: 9,
  notificationMinute: 0,
};
