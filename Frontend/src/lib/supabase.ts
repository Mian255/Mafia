import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { Database } from '../types/database';

const DEFAULT_SUPABASE_URL = 'https://cfutaueuomfqkmqystkk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmdXRhdWV1b21mcWttcXlzdGtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTk0MzEsImV4cCI6MjEwNTQ3NTQzMX0.KzvfC5dnEDe3II-5O3PMmEWDII83T-dEJ6nbpNX2Qo0';

// EXPO_PUBLIC_* vars are inlined at build time, so they must be referenced directly.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On native, persist the session in AsyncStorage so users stay logged in across restarts.
    // On web, supabase-js falls back to localStorage by default.
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // PKCE for OAuth: the code verifier is persisted by the storage adapter above (AsyncStorage
    // on native) and consumed by exchangeCodeForSession() in auth.ts when the `code` redirect
    // param comes back. Safer than the implicit flow for native/mobile redirects.
    flowType: 'pkce',
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
