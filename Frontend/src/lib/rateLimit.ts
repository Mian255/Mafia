/**
 * In-memory client-side rate limiting and throttling manager.
 * Guards against rapid spamming, brute-force credential stuffing,
 * and excessive API calls on authentication endpoints.
 */

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  lockoutDurationMs: number;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  login: {
    maxAttempts: 5,
    windowMs: 60 * 1000, // 1 minute window
    lockoutDurationMs: 60 * 1000, // 60s cooldown if max reached
  },
  signup: {
    maxAttempts: 4,
    windowMs: 60 * 1000,
    lockoutDurationMs: 60 * 1000,
  },
  forgotPassword: {
    maxAttempts: 3,
    windowMs: 60 * 1000,
    lockoutDurationMs: 90 * 1000,
  },
  usernameCheck: {
    maxAttempts: 15,
    windowMs: 30 * 1000,
    lockoutDurationMs: 15 * 1000,
  },
};

interface AttemptRecord {
  timestamps: number[];
  lockedUntil: number | null;
}

class AuthRateLimiter {
  private records: Map<string, AttemptRecord> = new Map();

  /**
   * Checks if an action is currently throttled/rate-limited.
   * Returns `{ allowed: boolean, waitSeconds?: number, message?: string }`.
   */
  public checkLimit(action: string, customKey?: string): { allowed: boolean; waitSeconds: number; message?: string } {
    const key = customKey ? `${action}:${customKey}` : action;
    const config = DEFAULT_CONFIGS[action] || {
      maxAttempts: 5,
      windowMs: 60 * 1000,
      lockoutDurationMs: 60 * 1000,
    };

    const now = Date.now();
    const record = this.records.get(key) || { timestamps: [], lockedUntil: null };

    // Check if currently in lockout period
    if (record.lockedUntil && now < record.lockedUntil) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return {
        allowed: false,
        waitSeconds: remainingSeconds,
        message: `Too many attempts. Please wait ${remainingSeconds}s before trying again.`,
      };
    }

    // Filter out attempts outside the sliding window
    const recentAttempts = record.timestamps.filter((ts) => now - ts < config.windowMs);

    if (recentAttempts.length >= config.maxAttempts) {
      const lockUntil = now + config.lockoutDurationMs;
      this.records.set(key, {
        timestamps: recentAttempts,
        lockedUntil: lockUntil,
      });
      const remainingSeconds = Math.ceil(config.lockoutDurationMs / 1000);
      return {
        allowed: false,
        waitSeconds: remainingSeconds,
        message: `Too many attempts. Please wait ${remainingSeconds}s before trying again.`,
      };
    }

    return { allowed: true, waitSeconds: 0 };
  }

  /**
   * Records a failed attempt for an action.
   */
  public recordAttempt(action: string, customKey?: string): { allowed: boolean; waitSeconds: number; message?: string } {
    const key = customKey ? `${action}:${customKey}` : action;
    const config = DEFAULT_CONFIGS[action] || {
      maxAttempts: 5,
      windowMs: 60 * 1000,
      lockoutDurationMs: 60 * 1000,
    };

    const now = Date.now();
    const record = this.records.get(key) || { timestamps: [], lockedUntil: null };
    const recentAttempts = record.timestamps.filter((ts) => now - ts < config.windowMs);
    recentAttempts.push(now);

    let lockedUntil: number | null = null;
    if (recentAttempts.length >= config.maxAttempts) {
      lockedUntil = now + config.lockoutDurationMs;
    }

    this.records.set(key, {
      timestamps: recentAttempts,
      lockedUntil,
    });

    if (lockedUntil) {
      const remainingSeconds = Math.ceil(config.lockoutDurationMs / 1000);
      return {
        allowed: false,
        waitSeconds: remainingSeconds,
        message: `Too many attempts. Please wait ${remainingSeconds}s before trying again.`,
      };
    }

    return { allowed: true, waitSeconds: 0 };
  }

  /**
   * Resets rate limit for an action upon successful authentication.
   */
  public reset(action: string, customKey?: string): void {
    const key = customKey ? `${action}:${customKey}` : action;
    this.records.delete(key);
  }

  /**
   * Clears all rate limiting history (for testing or sign out).
   */
  public clearAll(): void {
    this.records.clear();
  }
}

export const rateLimiter = new AuthRateLimiter();
