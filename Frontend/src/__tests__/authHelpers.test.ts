import {
  validateEmail,
  validateNewPassword,
  getFriendlyAuthError,
  getDisplayName,
  MIN_PASSWORD_LENGTH,
} from '../lib/authHelpers';
import type { User } from '@supabase/supabase-js';

describe('Auth Helpers & Validation Module', () => {
  describe('validateEmail', () => {
    it('rejects empty and whitespace-only email', () => {
      expect(validateEmail('')).toBe('Please enter your email address.');
      expect(validateEmail('   ')).toBe('Please enter your email address.');
    });

    it('rejects invalid email formats', () => {
      expect(validateEmail('plainaddress')).toBe('Please enter a valid email address.');
      expect(validateEmail('@missingusername.com')).toBe('Please enter a valid email address.');
      expect(validateEmail('username@.com')).toBe('Please enter a valid email address.');
      expect(validateEmail('username@domain')).toBe('Please enter a valid email address.');
    });

    it('accepts valid email formats', () => {
      expect(validateEmail('player@mafia.com')).toBeNull();
      expect(validateEmail('agent.007+game@domain.co.uk')).toBeNull();
      expect(validateEmail('  valid@test.com  ')).toBeNull();
    });
  });

  describe('validateNewPassword', () => {
    it('rejects empty password', () => {
      expect(validateNewPassword('')).toBe('Please enter a secret passcode.');
    });

    it(`rejects passwords shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
      expect(validateNewPassword('12345')).toBe(
        `Passcode must be at least ${MIN_PASSWORD_LENGTH} characters.`
      );
    });

    it('accepts valid passwords', () => {
      expect(validateNewPassword('secret123')).toBeNull();
      expect(validateNewPassword('longpasscode!@#')).toBeNull();
    });
  });

  describe('getFriendlyAuthError', () => {
    it('translates invalid credentials error', () => {
      const err = { message: 'Invalid login credentials' };
      expect(getFriendlyAuthError(err)).toBe('Incorrect email or passcode. Please try again.');
    });

    it('translates email already taken error', () => {
      const err = { message: 'User already registered' };
      expect(getFriendlyAuthError(err)).toBe(
        'An account with this email already exists. Try logging in instead.'
      );
    });

    it('translates rate limit error', () => {
      const err = { message: 'Email rate limit exceeded' };
      expect(getFriendlyAuthError(err)).toBe(
        'Too many attempts. Please wait a few minutes before trying again.'
      );
    });

    it('returns custom fallback if error is unknown', () => {
      const err = { message: 'Some esoteric internal error' };
      expect(getFriendlyAuthError(err, 'Custom fallback message')).toBe('Custom fallback message');
    });
  });

  describe('getDisplayName', () => {
    it('returns Agent for null or undefined user', () => {
      expect(getDisplayName(null)).toBe('Agent');
      expect(getDisplayName(undefined)).toBe('Agent');
    });

    it('prefers username in metadata', () => {
      const user = {
        user_metadata: { username: 'DonCorleone' },
      } as unknown as User;
      expect(getDisplayName(user)).toBe('DonCorleone');
    });

    it('falls back to full_name or email prefix', () => {
      const userWithFull = {
        user_metadata: { full_name: 'Vito Scaletta' },
      } as unknown as User;
      expect(getDisplayName(userWithFull)).toBe('Vito Scaletta');

      const userWithEmail = {
        email: 'detective@police.gov',
      } as unknown as User;
      expect(getDisplayName(userWithEmail)).toBe('detective');
    });
  });
});
