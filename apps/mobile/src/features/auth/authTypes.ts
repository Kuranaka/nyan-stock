export type AuthProvider = 'google' | 'apple';

export type AuthSession = {
  provider: AuthProvider;
  providerUserId: string;
  email?: string;
  name?: string;
  photoUrl?: string;
  signedInAt: string;
};
