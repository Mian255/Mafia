import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // Ignored in headless/initial contexts
}

/**
 * Collects the parameters from both the query string and the fragment of an OAuth redirect URL.
 * Supabase returns tokens in the fragment (implicit flow) and `code`/`error` in the query (PKCE).
 * Parsed by hand because React Native's URL/URLSearchParams support is incomplete.
 */
export function parseRedirectParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  for (const part of [query, fragment]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const eqIndex = pair.indexOf('=');
      const rawKey = eqIndex >= 0 ? pair.slice(0, eqIndex) : pair;
      const rawValue = eqIndex >= 0 ? pair.slice(eqIndex + 1) : '';
      try {
        params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
      } catch {
        // Skip malformed pairs instead of failing the whole sign-in.
      }
    }
  }
  return params;
}

export async function createSessionFromUrl(url: string): Promise<Session | null> {
  const params = parseRedirectParams(url);

  if (params.error || params.error_code) {
    throw new Error(params.error_description || params.error || params.error_code);
  }

  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return data.session;
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return data.session;
  }

  return null;
}

/**
 * Opens the Google OAuth flow in an in-app browser and returns the resulting Supabase session,
 * or null if the user cancelled / closed the browser.
 */
export async function signInWithGoogle(): Promise<Session | null> {
  const redirectUrl = makeRedirectUri({
    scheme: 'mafia',
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
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
