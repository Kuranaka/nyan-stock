export type AuthProvider = 'guest' | 'google' | 'apple';

export type AuthSession = {
  provider: AuthProvider;
  providerUserId: string;
  supabaseUserId?: string;
  email?: string;
  name?: string;
  photoUrl?: string;
  signedInAt: string;
};
