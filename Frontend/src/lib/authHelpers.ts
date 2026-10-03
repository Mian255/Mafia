import { isAuthError, isAuthRetryableFetchError, type User } from '@supabase/supabase-js';

/**
 * Minimum password length enforced client-side. Kept >= the Supabase Auth "Minimum password
 * length" setting so the server never rejects a password the UI accepted.
 */
export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an error message for the given (already trimmed) email, or null if it looks valid. */
export function validateEmail(email: string): string | null {
  if (!email) return 'Please enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'Please enter a valid email address.';
  return null;
}

/** Returns an error message for a new password, or null if it meets the policy. */
export function validateNewPassword(password: string): string | null {
  if (!password) return 'Please enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

/** Best display name for a signed-in user, used for the in-app alias. */
export function getDisplayName(user: User | null | undefined): string {
  if (!user) return 'Agent';
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromMetadata = [metadata.username, metadata.full_name, metadata.name].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  if (fromMetadata) return fromMetadata.trim();
  if (user.email) return user.email.split('@')[0];
  if (user.is_anonymous) return `Guest_${user.id.substring(0, 4).toUpperCase()}`;
  return 'Operative';
}

/**
 * How close `created_at` and `last_sign_in_at` must be for a user to count as "created by this
 * very sign-in". Both timestamps come from the Supabase server, so device clock skew doesn't matter.
 */
export const NEW_ACCOUNT_WINDOW_MS = 15_000;

/**
 * True when this sign-in just created the auth user (e.g. Google OAuth on the Login screen for
 * someone who never signed up). Supabase always creates users on first OAuth sign-in, so this is
 * the client-side way to tell "existing account" from "brand-new account" without a schema change.
 */
export function isBrandNewAccount(user: User): boolean {
  if (!user.created_at || !user.last_sign_in_at) return false;
  const createdAt = Date.parse(user.created_at);
  const lastSignInAt = Date.parse(user.last_sign_in_at);
  if (!Number.isFinite(createdAt) || !Number.isFinite(lastSignInAt)) return false;
  const gap = lastSignInAt - createdAt;
  return gap >= 0 && gap < NEW_ACCOUNT_WINDOW_MS;
}

const CONNECTION_MESSAGE =
  "We can't reach the server. Check your internet connection and try again.";

/** True for fetch/network failures (no connection, timeout, DNS, ...). */
export function isNetworkError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  return /network request failed|failed to fetch|network error|timed? ?out|timeout/i.test(message);
}

/**
 * Maps Supabase / network errors to short, plain-language messages. Unknown errors never show
 * the raw technical message; they fall back to `fallback`.
 */
export function getFriendlyAuthError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (isNetworkError(error)) return CONNECTION_MESSAGE;

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : typeof error === 'string'
          ? error
          : '';

  if (/request path invalid|requested path is invalid/i.test(rawMessage)) {
    return 'Google sign-in was unable to complete the redirect. Please verify your Google account or sign up with email.';
  }

  if (/access_denied|cancelled|user canceled/i.test(rawMessage)) {
    return 'Google sign-in was cancelled.';
  }

  if (/invalid_request|invalid_grant/i.test(rawMessage)) {
    return 'Authentication request was not recognized by Google. Please try again or use email.';
  }

  if (isAuthError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return "That email and password don't match an account. Check them and try again, or sign up.";
      case 'email_not_confirmed':
        return 'Please confirm your email first. Check your inbox for the confirmation link.';
      case 'user_already_exists':
      case 'email_exists':
      case 'identity_already_exists':
        return 'An account with this email already exists. Try logging in instead.';
      case 'weak_password':
        return `Please choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`;
      case 'same_password':
        return 'Your new password must be different from your old one.';
      case 'email_address_invalid':
        return 'Please enter a valid email address.';
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return 'Too many attempts. Please wait a minute and try again.';
      case 'signup_disabled':
      case 'email_provider_disabled':
        return 'New sign-ups are closed right now. Please try again later.';
      case 'provider_disabled':
      case 'oauth_provider_not_supported':
        return "Google sign-in isn't available right now. Please use your email instead.";
      case 'anonymous_provider_disabled':
        return "Guest play isn't available right now. Please log in or sign up.";
      case 'user_banned':
        return 'This account has been suspended.';
      case 'session_expired':
      case 'session_not_found':
      case 'refresh_token_not_found':
      case 'refresh_token_already_used':
        return 'Your session has ended. Please log in again.';
      default:
        break;
    }
    // Legacy: the profile trigger fails on a duplicate username (profiles.username is UNIQUE).
    if (/database error saving new user/i.test(error.message)) {
      return "We couldn't create your account right now. Please try again.";
    }
  }

  // Unmapped errors: never surface raw internal / Postgres text to the user — the mapped-code
  // branches above cover everything we translate, so anything reaching here gets the generic
  // fallback. (Network errors are already handled at the top.)
  return fallback;
}
