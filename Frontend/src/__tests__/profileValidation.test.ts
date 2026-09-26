import {
  validateUsername,
  isPlaceholderUsername,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
} from '../lib/profile';

describe('Profile Validation Module', () => {
  describe('validateUsername', () => {
    it('rejects empty and whitespace username', () => {
      expect(validateUsername('')).toBe('Please choose a username.');
      expect(validateUsername('   ')).toBe('Please choose a username.');
    });

    it(`rejects usernames shorter than ${USERNAME_MIN_LENGTH} chars`, () => {
      expect(validateUsername('ab')).toContain(
        `Your username must be ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters long.`
      );
    });

    it(`rejects usernames longer than ${USERNAME_MAX_LENGTH} chars`, () => {
      expect(validateUsername('a'.repeat(21))).toContain(
        `Your username must be ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters long.`
      );
    });

    it('rejects special characters and spaces', () => {
      expect(validateUsername('agent 007')).toBe(
        'Use only letters, numbers and underscores (_), with no spaces.'
      );
      expect(validateUsername('agent-007')).toBe(
        'Use only letters, numbers and underscores (_), with no spaces.'
      );
      expect(validateUsername('agent@007')).toBe(
        'Use only letters, numbers and underscores (_), with no spaces.'
      );
    });

    it('rejects reserved placeholder patterns', () => {
      expect(validateUsername('Player_1a2b3c')).toBe(
        'That name is reserved. Please pick a different one.'
      );
    });

    it('accepts valid usernames', () => {
      expect(validateUsername('ShadowVito')).toBeNull();
      expect(validateUsername('Agent_007')).toBeNull();
      expect(validateUsername('player123')).toBeNull();
      expect(validateUsername('Godfather_')).toBeNull();
    });
  });

  describe('isPlaceholderUsername', () => {
    it('returns true for empty, null, or undefined', () => {
      expect(isPlaceholderUsername(null)).toBe(true);
      expect(isPlaceholderUsername(undefined)).toBe(true);
      expect(isPlaceholderUsername('')).toBe(true);
    });

    it('returns true for trigger-generated placeholder names', () => {
      expect(isPlaceholderUsername('Player_a1b2c3')).toBe(true);
      expect(isPlaceholderUsername('PLAYER_999999')).toBe(true);
    });

    it('returns false for custom usernames', () => {
      expect(isPlaceholderUsername('Godfather')).toBe(false);
      expect(isPlaceholderUsername('PlayerOne')).toBe(false);
      expect(isPlaceholderUsername('Agent_Smith')).toBe(false);
    });
  });
});
