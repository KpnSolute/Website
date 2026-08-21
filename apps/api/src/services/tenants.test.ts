import { describe, expect, it } from 'vitest';
import { createInMemoryPlatform, makeTenant, makeUser } from '../testing/in-memory-platform.js';
import {
  assertAddressableTenant,
  assertValidSlug,
  createTenantWithOwner,
  tenantTypeForClass,
} from './tenants.js';

describe('assertValidSlug', () => {
  it('accepts lowercase alphanumeric-with-hyphen slugs', () => {
    expect(() => assertValidSlug('mjcc')).not.toThrow();
    expect(() => assertValidSlug('north-cafe-2')).not.toThrow();
  });

  it('rejects reserved workspace slugs', () => {
    expect(() => assertValidSlug('admin')).toThrow();
    expect(() => assertValidSlug('api')).toThrow();
    expect(() => assertValidSlug('new')).toThrow();
  });

  it('rejects slugs with invalid characters or shape', () => {
    expect(() => assertValidSlug('Has-Caps')).toThrow();
    expect(() => assertValidSlug('-leading-hyphen')).toThrow();
    expect(() => assertValidSlug('trailing-hyphen-')).toThrow();
    expect(() => assertValidSlug('has space')).toThrow();
  });
});

describe('tenantTypeForClass', () => {
  it('maps the routing class onto the stored tenant type', () => {
    expect(tenantTypeForClass('corporation')).toBe('corporation');
    expect(tenantTypeForClass('organization')).toBe('organization');
  });
});

describe('assertAddressableTenant', () => {
  it('accepts a slug-addressed organization with no hostname', () => {
    expect(() =>
      assertAddressableTenant({ tenantClass: 'organization', slug: 'acme', subdomain: null }),
    ).not.toThrow();
  });

  it('requires a corporation to have a subdomain', () => {
    expect(() =>
      assertAddressableTenant({ tenantClass: 'corporation', slug: 'mjcc', subdomain: null }),
    ).toThrow(/requires a dedicated subdomain/i);
  });

  it('refuses a subdomain on a standard organization', () => {
    expect(() =>
      assertAddressableTenant({ tenantClass: 'organization', slug: 'acme', subdomain: 'acme' }),
    ).toThrow(/only a corporation/i);
  });

  it('refuses a reserved platform hostname as a corporate subdomain', () => {
    for (const reserved of ['api', 'auth', 'platform', 'compute', 'www']) {
      expect(
        () =>
          assertAddressableTenant({
            tenantClass: 'corporation',
            slug: 'acme',
            subdomain: reserved,
          }),
        reserved,
      ).toThrow(/reserved/i);
    }
  });
});

function platform(seed: Parameters<typeof createInMemoryPlatform>[0] = {}) {
  const instance = createInMemoryPlatform({ users: [makeUser({ id: 'owner-1' })], ...seed });
  return { ...instance, repos: instance.repositories(instance.db) };
}

describe('createTenantWithOwner', () => {
  it('creates a slug-addressed organization with built-in roles and an active owner', async () => {
    const { db, repos, store } = platform();
    const tenant = await createTenantWithOwner(db, repos, {
      tenantClass: 'organization',
      name: 'Acme Co',
      slug: 'acme',
      ownerUserId: 'owner-1',
    });

    expect(tenant.type).toBe('organization');
    expect(tenant.tenantClass).toBe('organization');
    expect(tenant.subdomain).toBeNull();
    expect(
      store.roles.filter((role) => role.tenantId === tenant.id).map((role) => role.key),
    ).toEqual(['owner', 'admin', 'member']);
    const membership = store.memberships.find((entry) => entry.tenantId === tenant.id);
    expect(membership?.status).toBe('active');
    expect(membership?.userId).toBe('owner-1');
  });

  it('creates a corporation addressed at its own subdomain', async () => {
    const { db, repos } = platform();
    const tenant = await createTenantWithOwner(db, repos, {
      tenantClass: 'corporation',
      name: 'MJCC',
      slug: 'mjcc',
      subdomain: 'MJCC',
      ownerUserId: 'owner-1',
    });

    expect(tenant.type).toBe('corporation');
    expect(tenant.tenantClass).toBe('corporation');
    expect(tenant.subdomain).toBe('mjcc');
  });

  it('refuses a corporation without a subdomain', async () => {
    const { db, repos } = platform();
    await expect(
      createTenantWithOwner(db, repos, {
        tenantClass: 'corporation',
        name: 'MJCC',
        slug: 'mjcc',
        ownerUserId: 'owner-1',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuses a subdomain on a standard organization', async () => {
    const { db, repos } = platform();
    await expect(
      createTenantWithOwner(db, repos, {
        tenantClass: 'organization',
        name: 'Acme',
        slug: 'acme',
        subdomain: 'acme',
        ownerUserId: 'owner-1',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuses a subdomain already assigned to another tenant', async () => {
    const { db, repos } = platform({
      tenants: [makeTenant({ id: 't-1', slug: 'other', type: 'corporation', subdomain: 'mjcc' })],
    });
    await expect(
      createTenantWithOwner(db, repos, {
        tenantClass: 'corporation',
        name: 'MJCC',
        slug: 'mjcc',
        subdomain: 'mjcc',
        ownerUserId: 'owner-1',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a slug already taken', async () => {
    const { db, repos } = platform({ tenants: [makeTenant({ id: 't-1', slug: 'acme' })] });
    await expect(
      createTenantWithOwner(db, repos, {
        tenantClass: 'organization',
        name: 'Acme',
        slug: 'acme',
        ownerUserId: 'owner-1',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('leaves nothing behind when provisioning fails', async () => {
    const { db, repos, store } = platform({
      tenants: [makeTenant({ id: 't-1', slug: 'other', type: 'corporation', subdomain: 'mjcc' })],
    });
    await expect(
      createTenantWithOwner(db, repos, {
        tenantClass: 'corporation',
        name: 'MJCC',
        slug: 'mjcc',
        subdomain: 'mjcc',
        ownerUserId: 'owner-1',
      }),
    ).rejects.toThrow();
    expect(store.tenants).toHaveLength(1);
    expect(store.memberships).toHaveLength(0);
    expect(store.roles).toHaveLength(0);
  });
});
