import { describe, expect, it } from 'vitest';
import { crossAppUrl } from './links';

describe('crossAppUrl', () => {
  it('builds local dev URLs from the fixed port map', () => {
    expect(crossAppUrl('platform', '/compute/mjcc', true)).toBe(
      'http://localhost:5175/compute/mjcc',
    );
  });

  it('builds production URLs from the registered app hosts', () => {
    expect(crossAppUrl('billing', '/compute/mjcc', false)).toBe(
      'https://billing.kpnsolute.com/compute/mjcc',
    );
  });

  it('normalizes a missing leading slash', () => {
    expect(crossAppUrl('create', 'compute/new', false)).toBe(
      'https://create.kpnsolute.com/compute/new',
    );
  });
});
