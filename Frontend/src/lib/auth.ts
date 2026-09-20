import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // Ignored in headless/initial contexts
}

function extractParam(url: string, param: string): string | null {
  const regex = new RegExp(`[#?&]${param}=([^&#]*)`);
  const match = url.match(regex);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function signInWithGoogle() {
  const redirectUrl = makeRedirectUri({
    scheme: 'mafia',
    path: 'auth/callback',
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    throw error;
  }

  if (data?.url) {
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    if (res.type === 'success' && res.url) {
      const accessToken = extractParam(res.url, 'access_token');
      const refreshToken = extractParam(res.url, 'refresh_token');

      if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
        return sessionData;
      }
    }
  }

  return null;
}

