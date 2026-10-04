import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDisplayName, isBrandNewAccount } from '../lib/authHelpers';
import { isPlaceholderUsername } from '../lib/profile';
import type { User } from '@supabase/supabase-js';

describe('User Session & State Preservation Module', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists and retrieves session tokens in local storage', async () => {
    const mockSessionKey = 'supabase.auth.token';
    const mockSessionPayload = JSON.stringify({
      currentSession: {
        access_token: 'fake-jwt-token',
        refresh_token: 'fake-refresh-token',
        user: { id: 'user-123', email: 'vito@mafia.com' },
      },
    });

    await AsyncStorage.setItem(mockSessionKey, mockSessionPayload);

    const stored = await AsyncStorage.getItem(mockSessionKey);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.currentSession.access_token).toBe('fake-jwt-token');
    expect(parsed.currentSession.user.email).toBe('vito@mafia.com');
  });

  it('correctly detects returning users vs brand-new registrations', () => {
    const now = Date.now();

    // Brand new user (created 2 seconds ago)
    const newUser = {
      id: 'new-user-1',
      created_at: new Date(now - 2000).toISOString(),
      last_sign_in_at: new Date(now).toISOString(),
    } as unknown as User;

    expect(isBrandNewAccount(newUser)).toBe(true);

    // Returning user (created 3 days ago)
    const returningUser = {
      id: 'old-user-1',
      created_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      last_sign_in_at: new Date(now).toISOString(),
    } as unknown as User;

    expect(isBrandNewAccount(returningUser)).toBe(false);
  });

  it('correctly resolves username vs placeholder for navigation destination', () => {
    // User who hasn't chosen a username (e.g. initial Google OAuth)
    const oauthUserWithoutName: Partial<User> = {
      id: 'user-oauth-1',
      user_metadata: {},
    };
    expect(isPlaceholderUsername(oauthUserWithoutName.user_metadata?.username)).toBe(true);

    // User with generated placeholder name
    expect(isPlaceholderUsername('Player_12ab34')).toBe(true);

    // Returning user with chosen name
    const returningUser: Partial<User> = {
      id: 'user-returning',
      user_metadata: { username: 'DonCorleone' },
    };
    expect(isPlaceholderUsername(returningUser.user_metadata?.username)).toBe(false);
    expect(getDisplayName(returningUser as User)).toBe('DonCorleone');
  });

  it('clears storage properly on sign out', async () => {
    await AsyncStorage.setItem('supabase.auth.token', 'active-token');
    expect(await AsyncStorage.getItem('supabase.auth.token')).toBe('active-token');

    await AsyncStorage.removeItem('supabase.auth.token');
    expect(await AsyncStorage.getItem('supabase.auth.token')).toBeNull();
  });
});
