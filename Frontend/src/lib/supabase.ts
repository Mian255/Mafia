import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { Database } from '../types/database';

// EXPO_PUBLIC_* vars are inlined at build time, so they must be referenced directly.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
    !supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ]
    .filter(Boolean)
    .join(', ');
  throw new Error(
    `[supabase] Missing environment variable(s): ${missing}. ` +
      'Copy Frontend/.env.example to Frontend/.env, fill in your Supabase project URL and anon key, ' +
      'then restart Metro with a cleared cache (npx expo start -c).'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On native, persist the session in AsyncStorage so users stay logged in across restarts.
    // On web, supabase-js falls back to localStorage by default.
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Recommended by Supabase for React Native: only refresh tokens while the app is in the
// foreground. When the app comes back, startAutoRefresh() refreshes an expired token or
// emits SIGNED_OUT if the session can no longer be refreshed.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
