export type AppSettings = {
  onboardingCompleted: boolean;
  notificationsEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
  selectedCatId?: string;
  rakutenApplicationId?: string;
  rakutenAccessKey?: string;
  rakutenAffiliateId?: string;
};

export const defaultSettings: AppSettings = {
  onboardingCompleted: false,
  notificationsEnabled: false,
  notificationHour: 9,
  notificationMinute: 0,
};
