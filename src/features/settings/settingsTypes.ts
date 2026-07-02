export type AppSettings = {
  onboardingCompleted: boolean;
  notificationsEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
};

export const defaultSettings: AppSettings = {
  onboardingCompleted: false,
  notificationsEnabled: false,
  notificationHour: 9,
  notificationMinute: 0,
};
