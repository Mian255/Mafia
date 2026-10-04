import { rateLimiter } from '../lib/rateLimit';

describe('AuthRateLimiter Module', () => {
  beforeEach(() => {
    rateLimiter.clearAll();
  });

  it('allows initial requests within limit', () => {
    const check1 = rateLimiter.checkLimit('login', 'user1@test.com');
    expect(check1.allowed).toBe(true);
    expect(check1.waitSeconds).toBe(0);
  });

  it('throttles when maximum failed attempts are reached', () => {
    const user = 'hacker@test.com';

    // 5 attempts are allowed
    for (let i = 0; i < 4; i++) {
      const res = rateLimiter.recordAttempt('login', user);
      expect(res.allowed).toBe(true);
    }

    // 5th failed attempt triggers cooldown
    const fifthAttempt = rateLimiter.recordAttempt('login', user);
    expect(fifthAttempt.allowed).toBe(false);
    expect(fifthAttempt.waitSeconds).toBeGreaterThan(0);
    expect(fifthAttempt.message).toContain('Too many attempts');

    // Subsequent checks are blocked
    const subsequentCheck = rateLimiter.checkLimit('login', user);
    expect(subsequentCheck.allowed).toBe(false);
    expect(subsequentCheck.waitSeconds).toBeGreaterThan(0);
  });

  it('resets rate limit upon successful login', () => {
    const user = 'gooduser@test.com';

    // Record some failures
    rateLimiter.recordAttempt('login', user);
    rateLimiter.recordAttempt('login', user);

    // Reset on success
    rateLimiter.reset('login', user);

    const check = rateLimiter.checkLimit('login', user);
    expect(check.allowed).toBe(true);
    expect(check.waitSeconds).toBe(0);
  });

  it('isolates rate limits between different users and actions', () => {
    const userA = 'userA@test.com';
    const userB = 'userB@test.com';

    // Block userA
    for (let i = 0; i < 5; i++) {
      rateLimiter.recordAttempt('login', userA);
    }

    expect(rateLimiter.checkLimit('login', userA).allowed).toBe(false);
    // userB should still be allowed
    expect(rateLimiter.checkLimit('login', userB).allowed).toBe(true);
    // userA should still be allowed for forgotPassword action
    expect(rateLimiter.checkLimit('forgotPassword', userA).allowed).toBe(true);
  });
});
