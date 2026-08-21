import { describe, expect, it } from 'vitest';
import {
  accountSetupStateFor,
  inspectUsername,
  isReservedUsername,
  isValidUsername,
  normalizeUsername,
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
} from './accounts';
import { RESERVED_SUBDOMAINS, RESERVED_WORKSPACE_SLUGS } from './registry';

describe('normalizeUsername', () => {
  it('compares case-insensitively so one name cannot exist twice', () => {
    expect(normalizeUsername('MJCCOwner')).toBe('mjccowner');
    expect(normalizeUsername('  Spaced  ')).toBe('spaced');
  });
});

describe('inspectUsername', () => {
  it('accepts ordinary usernames', () => {
    for (const value of ['mjcc-owner', 'ana_1', 'kim99', 'a-b']) {
      expect(inspectUsername(value), value).toBeNull();
    }
  });

  it('accepts a username that only differs by case', () => {
    expect(isValidUsername('MJCC_Owner')).toBe(true);
  });

  it('rejects an empty or blank username', () => {
    expect(inspectUsername('')?.code).toBe('empty');
    expect(inspectUsername('   ')?.code).toBe('empty');
  });

  it('enforces the length bounds', () => {
    expect(inspectUsername('ab')?.code).toBe('too_short');
    expect(inspectUsername('a'.repeat(USERNAME_MAX_LENGTH + 1))?.code).toBe('too_long');
    expect(inspectUsername('a'.repeat(USERNAME_MAX_LENGTH))).toBeNull();
  });

  it('rejects separators at the edges and characters outside the set', () => {
    for (const value of ['-lead', 'trail-', '_lead', 'trail_', 'has space', 'e@mail', 'dot.name']) {
      expect(inspectUsername(value)?.code, value).toBe('format');
    }
  });

  it('rejects every reserved platform hostname and workspace slug', () => {
    for (const value of [...RESERVED_SUBDOMAINS, ...RESERVED_WORKSPACE_SLUGS]) {
      if (value.length < 3) continue;
      expect(isReservedUsername(value), value).toBe(true);
      expect(inspectUsername(value)?.code, value).toBe('reserved');
    }
  });

  it('rejects a reserved name supplied in a different case', () => {
    expect(inspectUsername('Platform')?.code).toBe('reserved');
    expect(inspectUsername('KPNSOLUTE')?.code).toBe('reserved');
  });

  it('keeps the reserved list free of values it could never reject anyway', () => {
    // A reserved entry that cannot pass the format check is dead weight and
    // hides a real mismatch with the database constraint.
    for (const value of RESERVED_USERNAMES) {
      expect(normalizeUsername(value), value).toBe(value);
    }
  });
});

describe('accountSetupStateFor', () => {
  it('is awaiting_username until a username exists', () => {
    expect(accountSetupStateFor(null)).toBe('awaiting_username');
    expect(accountSetupStateFor(undefined)).toBe('awaiting_username');
    expect(accountSetupStateFor('')).toBe('awaiting_username');
    expect(accountSetupStateFor('mjcc-owner')).toBe('complete');
  });
});
