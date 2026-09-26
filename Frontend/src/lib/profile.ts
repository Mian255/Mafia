import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;
/** Default name given by the `handle_new_user` trigger when sign-up metadata has no username. */
const PLACEHOLDER_USERNAME_PATTERN = /^Player_[0-9a-f]{6}$/i;
const PROFILE_TIMEOUT_MS = 6000;

/** Returns a plain-language error for the (trimmed) username, or null if it is valid. */
export function validateUsername(raw: string): string | null {
  const name = raw.trim();
  if (!name) return 'Please choose a username.';
  if (name.length < USERNAME_MIN_LENGTH || name.length > USERNAME_MAX_LENGTH) {
    return `Your username must be ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters long.`;
  }
  if (!USERNAME_PATTERN.test(name)) {
    return 'Use only letters, numbers and underscores (_), with no spaces.';
  }
  if (PLACEHOLDER_USERNAME_PATTERN.test(name)) {
    return 'That name is reserved. Please pick a different one.';
  }
  return null;
}

/** True when the profile still has no username chosen by the user. */
export function isPlaceholderUsername(username: string | null | undefined): boolean {
  return !username || PLACEHOLDER_USERNAME_PATTERN.test(username);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export interface UsernameStatus {
  /** True when the user must pick a username before entering the app. */
  needsSetup: boolean;
  /** The chosen username, when there is one. */
  username: string | null;
}

/**
 * Decides whether a signed-in user still has to choose a username.
 * Source of truth is `profiles.username` (placeholder `Player_xxxxxx` = not chosen yet).
 * If the profile can't be loaded (offline / slow network) it falls back to the
 * `username_set` / `username` values in the auth user metadata.
 * Guests (anonymous users) never need a username.
 */
export async function getUsernameStatus(user: User): Promise<UsernameStatus> {
  if (user.is_anonymous) return { needsSetup: false, username: null };

  try {
    const { data, error } = await withTimeout(
      supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
      PROFILE_TIMEOUT_MS
    );
    if (error) throw error;
    const username = data?.username ?? null;
    return isPlaceholderUsername(username)
      ? { needsSetup: true, username: null }
      : { needsSetup: false, username };
  } catch {
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const metaUsername = typeof metadata.username === 'string' ? metadata.username : null;
    const isSet =
      metadata.username_set === true || (!!metaUsername && !isPlaceholderUsername(metaUsername));
    return isSet
      ? { needsSetup: false, username: metaUsername }
      : { needsSetup: true, username: null };
  }
}

/** Escapes LIKE wildcards so `ilike` does an exact, case-insensitive comparison. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Checks whether a username is free (case-insensitive, ignoring the user's own row).
 * Uses the public "Profiles are viewable by everyone" SELECT policy.
 */
export async function isUsernameAvailable(username: string, userId: string): Promise<boolean> {
  const { data, error } = await withTimeout(
    supabase
      .from('profiles')
      .select('id')
      .ilike('username', escapeLikePattern(username))
      .neq('id', userId)
      .limit(1),
    PROFILE_TIMEOUT_MS
  );
  if (error) throw error;
  return (data ?? []).length === 0;
}

export type SaveUsernameResult = 'saved' | 'taken';

function isUniqueUsernameViolation(error: { code?: string; message?: string; details?: string }) {
  if (error.code !== '23505') return false;
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  // Only the username constraint means "taken"; a duplicate id means the row already exists.
  return /username/i.test(text) || !/profiles_pkey|\(id\)/i.test(text);
}

/**
 * Saves the chosen username to `profiles` (RLS: "Users can update their own profile") and marks
 * it as chosen in the auth user metadata. Returns 'taken' if someone else owns the name.
 */
export async function saveUsername(user: User, username: string): Promise<SaveUsernameResult> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ username, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id');

  if (error) {
    if (isUniqueUsernameViolation(error)) return 'taken';
    throw error;
  }

  if (!data || data.length === 0) {
    // No profile row yet (the sign-up trigger normally creates it): create it.
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({ id: user.id, username });
    if (insertError) {
      if (isUniqueUsernameViolation(insertError)) return 'taken';
      throw insertError;
    }
  }

  // Best effort: keeps the display name and the offline fallback in sync. The profile row above
  // is the source of truth, so a failure here is not shown to the user.
  try {
    await supabase.auth.updateUser({ data: { username, username_set: true } });
  } catch {
    // ignore
  }

  return 'saved';
}
