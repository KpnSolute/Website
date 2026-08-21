import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./0009_tenant_routing_classes.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('tenant routing migration', () => {
  it('adds subdomain and custom domain additively', () => {
    expect(migration).toContain('add column if not exists subdomain text');
    expect(migration).toContain('add column if not exists custom_domain text');
    expect(migration).not.toMatch(/drop table|drop column subdomain|truncate|delete from/);
  });

  it('enforces case-insensitive uniqueness on both hostnames', () => {
    expect(migration).toContain('create unique index if not exists tenants_subdomain_unique');
    expect(migration).toContain('on tenants (lower(subdomain))');
    expect(migration).toContain('on tenants (lower(custom_domain))');
  });

  it('permits a dedicated hostname only for a corporation', () => {
    expect(migration).toContain('tenants_corporate_addressing_check');
    expect(migration).toContain("(type = 'corporation')");
    expect(migration).toContain('subdomain is null and custom_domain is null');
  });

  it('refuses every reserved platform hostname as a tenant subdomain', () => {
    for (const reserved of [
      'accounts',
      'api',
      'auth',
      'billing',
      'compute',
      'platform',
      'scena',
      'lunchvoice',
      'tradora',
      'workforce',
      'www',
    ]) {
      expect(migration).toContain(`'${reserved}'`);
    }
    expect(migration).toContain('tenants_subdomain_not_reserved_check');
  });

  it('constrains a subdomain to one valid hostname label', () => {
    expect(migration).toContain('tenants_subdomain_format_check');
    expect(migration).toContain('[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?');
  });

  it('documents a rollback', () => {
    expect(migration).toContain('rollback:');
    expect(migration).toContain('drop column if exists subdomain');
  });
});
