import { describe, expect, it } from 'vitest';
import { resolvePlatformConfigState, readEnv, requireEnv, SetupRequiredError } from './env';

describe('resolvePlatformConfigState', () => {
  it('reports missing when no variables are set', () => {
    expect(resolvePlatformConfigState({})).toEqual({
      database: 'missing',
      kpnAuth: 'missing',
      stripe: 'missing',
    });
  });

  it('reports configured only when every required variable is present and non-empty', () => {
    expect(
      resolvePlatformConfigState({
        DATABASE_URL: 'postgres://localhost/kpn',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: '',
        STRIPE_SECRET_KEY: 'sk_test',
      }),
    ).toEqual({
      database: 'configured',
      kpnAuth: 'missing',
      stripe: 'configured',
    });
  });
});

describe('readEnv / requireEnv', () => {
  it('treats blank strings as unset', () => {
    expect(readEnv({ FOO: '   ' }, 'FOO')).toBeUndefined();
  });

  it('requireEnv throws SetupRequiredError with the missing variable name', () => {
    expect(() => requireEnv({}, 'DATABASE_URL')).toThrow(SetupRequiredError);
    try {
      requireEnv({}, 'DATABASE_URL');
      throw new Error('expected requireEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SetupRequiredError);
      expect((error as SetupRequiredError).missingVariable).toBe('DATABASE_URL');
    }
  });
});
