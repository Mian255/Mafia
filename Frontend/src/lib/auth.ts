import * as WebBrowser from 'expo-web-browser';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // Ignored in headless/initial contexts
}

const createSessionFromUrl = async (url: string) => {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    throw new Error(errorCode);
  }

  const { access_token, refresh_token } = params;
  if (access_token && refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;
    return data.session;
  }
  return null;
};

export async function signInWithGoogle() {
  const redirectUrl = makeRedirectUri({
    scheme: 'mafia',
  });

  console.log('[Google Auth] Redirect URI:', redirectUrl);

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
      return await createSessionFromUrl(res.url);
    }
  }

  return null;
}


