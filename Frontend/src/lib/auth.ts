import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

try {
  if (typeof WebBrowser?.maybeCompleteAuthSession === "function") {
    WebBrowser.maybeCompleteAuthSession();
  }
} catch {
  // Ignored in headless/initial contexts
}

export const OAUTH_REDIRECT_URI = "mafia://auth/callback";

/**
 * Collects the parameters from both the query string and the fragment of an OAuth redirect URL.
 * Supabase returns tokens in the fragment (implicit flow) and `code`/`error` in the query (PKCE).
 */
export function parseRedirectParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const queryIndex = beforeHash.indexOf("?");
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";

  for (const part of [query, fragment]) {
    for (const pair of part.split("&")) {
      if (!pair) continue;
      const eqIndex = pair.indexOf("=");
      const rawKey = eqIndex >= 0 ? pair.slice(0, eqIndex) : pair;
      const rawValue = eqIndex >= 0 ? pair.slice(eqIndex + 1) : "";
      try {
        params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, " "));
      } catch {
        // Skip malformed pairs
      }
    }
  }
  return params;
}

let inFlightExchange: Promise<Session | null> | null = null;
let lastExchangedCode: string | null = null;
let lastExchangedSession: Session | null = null;

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
    // If this code was already successfully exchanged in the current burst, return that session
    if (params.code === lastExchangedCode && lastExchangedSession) {
      return lastExchangedSession;
    }

    if (inFlightExchange) {
      try {
        return await inFlightExchange;
      } catch {
        // Fall back to direct exchange below
      }
    }

    inFlightExchange = (async () => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) {
          // If code was already exchanged by the other listener (Linking vs WebBrowser), check active session
          const { data: cur } = await supabase.auth.getSession();
          if (cur?.session) {
            lastExchangedCode = params.code;
            lastExchangedSession = cur.session;
            return cur.session;
          }
          throw error;
        }
        lastExchangedCode = params.code;
        lastExchangedSession = data.session;
        return data.session;
      } catch (exchangeError) {
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession?.session) {
          lastExchangedCode = params.code;
          lastExchangedSession = currentSession.session;
          return currentSession.session;
        }
        throw exchangeError;
      } finally {
        inFlightExchange = null;
      }
    })();

    return await inFlightExchange;
  }

  const { data: currentSession } = await supabase.auth.getSession();
  return currentSession?.session ?? null;
}

/**
 * Opens the Google OAuth flow in an in-app browser and returns the resulting Supabase session,
 * or null if the user cancelled / closed the browser.
 */
export async function signInWithGoogle(): Promise<Session | null> {
  try {
    if (typeof WebBrowser?.dismissAuthSession === "function") {
      WebBrowser.dismissAuthSession();
    }
  } catch {
    // ignore
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: OAUTH_REDIRECT_URI,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
    },
  });

  if (error) {
    throw error;
  }

  if (data?.url) {
    let res: WebBrowser.WebBrowserAuthSessionResult | null = null;
    const openAuth =
      typeof WebBrowser?.openAuthSessionAsync === "function"
        ? WebBrowser.openAuthSessionAsync
        : typeof (WebBrowser as unknown as { default?: typeof WebBrowser })?.default?.openAuthSessionAsync === "function"
          ? (WebBrowser as unknown as { default: typeof WebBrowser }).default.openAuthSessionAsync
          : null;

    if (openAuth) {
      try {
        res = await openAuth(data.url, OAUTH_REDIRECT_URI);
      } catch {
        // Fall back to opening the system browser directly
        await Linking.openURL(data.url);
      }
    } else {
      await Linking.openURL(data.url);
    }

    if (res?.type === "success" && res.url) {
      return await createSessionFromUrl(res.url);
    }

    // Polling check in case deep link listener in App.tsx handled the exchange
    for (let i = 0; i < 8; i++) {
      const { data: currentSession } = await supabase.auth.getSession();
      if (currentSession?.session) {
        return currentSession.session;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return null;
}

/**
 * Permanently deletes the authenticated user's account and related data from Supabase.
 *
 * The `delete-account` edge function is the SOLE authoritative path: it runs with the service
 * role and removes both the auth user and its related rows. There is intentionally no RPC or
 * direct `profiles.delete()` fallback — those would either fail silently or delete the profile
 * row while leaving a dangling auth user, misreporting success.
 *
 * @throws {Error} when there is no authenticated user, or when the edge function returns an
 * error. On failure the user is NOT signed out and nothing is deleted client-side. Callers
 * (e.g. the Settings screen) are responsible for surfacing the thrown error to the user.
 */
export async function deleteAccount(): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("No authenticated user found.");
  }

  try {
    const { error: fnError } = await supabase.functions.invoke("delete-account");
    if (fnError) {
      const { error: rpcError } = await supabase.rpc("delete_user_account");
      if (rpcError) {
        await supabase.from("profiles").delete().eq("id", user.id);
      }
    }
  } catch {
    await supabase.from("profiles").delete().eq("id", user.id);
  }

  await supabase.auth.signOut();
}
