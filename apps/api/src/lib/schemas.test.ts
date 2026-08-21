import { describe, expect, it } from 'vitest';
import { claimUsernameBodySchema, createTenantBodySchema } from './schemas.js';

/**
 * The wire contract for corporate tenant provisioning. The routing rules
 * themselves live in packages/contracts/src/tenancy.ts and are re-checked in
 * the service and in the database; this bounds the request shape so a
 * malformed body is rejected before it reaches either.
 */
describe('createTenantBodySchema', () => {
  const base = { name: 'Acme Co', slug: 'acme', serviceKey: 'compute', planKey: 'starter' };

  it('defaults to a slug-addressed organization', () => {
    const parsed = createTenantBodySchema.parse(base);
    expect(parsed.tenantClass).toBe('organization');
    expect(parsed.subdomain).toBeUndefined();
  });

  it('accepts a corporation with a subdomain and normalizes both identifiers', () => {
    const parsed = createTenantBodySchema.parse({
      ...base,
      name: '  MJCC  ',
      slug: ' MJCC ',
      tenantClass: 'corporation',
      subdomain: ' MJCC ',
    });
    expect(parsed).toMatchObject({
      name: 'MJCC',
      slug: 'mjcc',
      tenantClass: 'corporation',
      subdomain: 'mjcc',
    });
  });

  it('refuses a corporation without a subdomain', () => {
    const result = createTenantBodySchema.safeParse({ ...base, tenantClass: 'corporation' });
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/requires a dedicated subdomain/i);
  });

  it('refuses a subdomain on a standard organization', () => {
    const result = createTenantBodySchema.safeParse({
      ...base,
      tenantClass: 'organization',
      subdomain: 'acme',
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/only a corporation/i);
  });

  it('refuses a tenant class that is not one of the two commercial classes', () => {
    for (const tenantClass of ['school', 'team', 'personal', 'Corporation']) {
      expect(createTenantBodySchema.safeParse({ ...base, tenantClass }).success, tenantClass).toBe(
        false,
      );
    }
  });

  it('bounds the identifiers to hostname-sized values', () => {
    expect(createTenantBodySchema.safeParse({ ...base, slug: 'a'.repeat(64) }).success).toBe(false);
    expect(
      createTenantBodySchema.safeParse({
        ...base,
        tenantClass: 'corporation',
        subdomain: 'a'.repeat(64),
      }).success,
    ).toBe(false);
  });
});

describe('claimUsernameBodySchema', () => {
  it('trims and bounds the requested username', () => {
    expect(claimUsernameBodySchema.parse({ username: '  mjcc_owner ' }).username).toBe(
      'mjcc_owner',
    );
    expect(claimUsernameBodySchema.safeParse({ username: '' }).success).toBe(false);
    expect(claimUsernameBodySchema.safeParse({ username: 'a'.repeat(65) }).success).toBe(false);
    expect(claimUsernameBodySchema.safeParse({}).success).toBe(false);
  });
});
