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

/** Maps Supabase / network errors to short, user-facing messages. */
export function getFriendlyAuthError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isAuthRetryableFetchError(error)) {
    return "Can't reach the server. Check your internet connection and try again.";
  }

  if (isAuthError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
        return 'Incorrect email or password.';
      case 'email_not_confirmed':
        return 'Please confirm your email first. Check your inbox for the confirmation link.';
      case 'user_already_exists':
      case 'email_exists':
        return 'An account with this email already exists. Try logging in instead.';
      case 'weak_password':
        return error.message || `Password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      case 'email_address_invalid':
        return 'Please enter a valid email address.';
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return 'Too many attempts. Please wait a minute and try again.';
      case 'signup_disabled':
      case 'email_provider_disabled':
        return 'New sign-ups are currently disabled.';
      case 'anonymous_provider_disabled':
        return 'Guest play is currently unavailable. Please log in or sign up.';
      case 'user_banned':
        return 'This account has been suspended.';
      default:
        break;
    }
    // The profile trigger fails on a duplicate username (profiles.username is UNIQUE).
    if (/database error saving new user/i.test(error.message)) {
      return 'That alias may already be taken. Please choose a different one.';
    }
    return error.message || fallback;
  }

  if (error instanceof Error) {
    if (/network request failed|failed to fetch/i.test(error.message)) {
      return "Can't reach the server. Check your internet connection and try again.";
    }
    return error.message || fallback;
  }

  return fallback;
}
