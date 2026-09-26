import { isAuthError, isAuthRetryableFetchError, type User } from '@supabase/supabase-js';

/** Must match the Supabase Auth "Minimum password length" setting (Supabase default: 6). */
export const MIN_PASSWORD_LENGTH = 6;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an error message for the given (already trimmed) email, or null if it looks valid. */
export function validateEmail(email: string): string | null {
  if (!email) return 'Please enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'Please enter a valid email address.';
  return null;
}

/** Returns an error message for a new password, or null if it meets the minimum length. */
export function validateNewPassword(password: string): string | null {
  if (!password) return 'Please enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
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

  return fallback;
}
