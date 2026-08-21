import { describe, expect, it } from 'vitest';
import {
  inspectTenantRouting,
  isAvailableCorporateSubdomain,
  isTenantClass,
  isValidTenantSlug,
  resolveTenantFromRequest,
  tenantCompatibilityUrls,
  tenantManagementUrl,
  tenantRuntimeUrl,
  type TenantRouting,
} from './tenancy';

const org: TenantRouting = { tenantClass: 'organization', slug: 'acme' };
const corp: TenantRouting = { tenantClass: 'corporation', slug: 'mjcc', subdomain: 'mjcc' };

describe('tenant classes', () => {
  it('recognises exactly two classes', () => {
    expect(isTenantClass('organization')).toBe(true);
    expect(isTenantClass('corporation')).toBe(true);
    expect(isTenantClass('school')).toBe(false);
  });
});

describe('runtime addressing', () => {
  it('addresses an organization by slug path', () => {
    expect(tenantRuntimeUrl('compute', org)).toBe('https://compute.kpnsolute.com/workspaces/acme');
  });

  it('addresses a corporation by its own subdomain', () => {
    expect(tenantRuntimeUrl('compute', corp)).toBe('https://mjcc.kpnsolute.com');
  });

  it('prefers a verified custom domain for a corporation', () => {
    expect(tenantRuntimeUrl('compute', { ...corp, customDomain: 'ops.mjcc.example' })).toBe(
      'https://ops.mjcc.example',
    );
  });

  it('refuses to build a corporate URL with no subdomain or custom domain', () => {
    expect(() =>
      tenantRuntimeUrl('compute', { tenantClass: 'corporation', slug: 'mjcc' }),
    ).toThrow();
  });

  it('always administers through Platform regardless of class', () => {
    expect(tenantManagementUrl('compute', org)).toBe('https://platform.kpnsolute.com/compute/acme');
    expect(tenantManagementUrl('compute', corp)).toBe(
      'https://platform.kpnsolute.com/compute/mjcc',
    );
  });
});

describe('compatibility addressing', () => {
  it('lists the canonical URL first for a corporation', () => {
    const urls = tenantCompatibilityUrls('compute', corp);
    expect(urls[0]).toBe('https://mjcc.kpnsolute.com');
    expect(urls).toContain('https://compute.kpnsolute.com/workspaces/mjcc');
    expect(urls).toContain('https://compute.kpnsolute.com/mjcc');
  });

  it('lists the canonical path first for an organization', () => {
    const urls = tenantCompatibilityUrls('compute', org);
    expect(urls[0]).toBe('https://compute.kpnsolute.com/workspaces/acme');
  });

  it('does not duplicate entries', () => {
    const urls = tenantCompatibilityUrls('compute', corp);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('routing validation', () => {
  it('accepts a well-formed organization and corporation', () => {
    expect(inspectTenantRouting(org)).toEqual([]);
    expect(inspectTenantRouting(corp)).toEqual([]);
  });

  it('requires a corporation to have a subdomain', () => {
    const issues = inspectTenantRouting({ tenantClass: 'corporation', slug: 'mjcc' });
    expect(issues.some((i) => i.field === 'subdomain')).toBe(true);
  });

  it('refuses to give an organization a subdomain or custom domain', () => {
    expect(
      inspectTenantRouting({ ...org, subdomain: 'acme' }).some((i) => i.field === 'subdomain'),
    ).toBe(true);
    expect(
      inspectTenantRouting({ ...org, customDomain: 'acme.example' }).some(
        (i) => i.field === 'customDomain',
      ),
    ).toBe(true);
  });

  it('refuses reserved platform hostnames as corporate subdomains', () => {
    for (const reserved of ['api', 'auth', 'billing', 'compute', 'platform', 'workforce', 'www']) {
      expect(isAvailableCorporateSubdomain(reserved)).toBe(false);
      expect(
        inspectTenantRouting({ tenantClass: 'corporation', slug: 'x', subdomain: reserved }).some(
          (i) => i.field === 'subdomain',
        ),
      ).toBe(true);
    }
  });

  it('rejects malformed slugs', () => {
    for (const bad of ['', '-acme', 'acme-', 'Acme', 'a b', 'a'.repeat(64)]) {
      expect(isValidTenantSlug(bad)).toBe(false);
    }
    expect(isValidTenantSlug('a')).toBe(true);
    expect(isValidTenantSlug('a-b-1')).toBe(true);
  });
});

describe('request resolution', () => {
  it('resolves a corporation from its subdomain', () => {
    expect(resolveTenantFromRequest('mjcc.kpnsolute.com', '/')).toEqual({
      by: 'subdomain',
      value: 'mjcc',
    });
  });

  it('never resolves a reserved host as a tenant', () => {
    for (const host of ['api.kpnsolute.com', 'auth.kpnsolute.com', 'compute.kpnsolute.com']) {
      expect(resolveTenantFromRequest(host, '/')).toBeNull();
    }
  });

  it('resolves an organization from the canonical path', () => {
    expect(resolveTenantFromRequest('compute.kpnsolute.com', '/workspaces/acme')).toEqual({
      by: 'path',
      value: 'acme',
    });
    expect(resolveTenantFromRequest('compute.kpnsolute.com', '/workspaces/acme/console')).toEqual({
      by: 'path',
      value: 'acme',
    });
  });

  it('prefers the subdomain when both are present', () => {
    expect(resolveTenantFromRequest('mjcc.kpnsolute.com', '/workspaces/acme')).toEqual({
      by: 'subdomain',
      value: 'mjcc',
    });
  });

  it('returns null when neither identifies a tenant', () => {
    expect(resolveTenantFromRequest('compute.kpnsolute.com', '/')).toBeNull();
    expect(resolveTenantFromRequest('kpnsolute.com', '/pricing')).toBeNull();
  });
});
