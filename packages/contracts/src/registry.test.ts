import { describe, expect, it } from 'vitest';
import {
  apiServicePath,
  isReservedSubdomain,
  isReservedWorkspaceSlug,
  isServiceKey,
  managementPath,
  newTenantPath,
  resolveHostContext,
} from './registry';

describe('isServiceKey / isReservedSubdomain / isReservedWorkspaceSlug', () => {
  it('accepts only the fixed lowercase registry keys', () => {
    expect(isServiceKey('platform')).toBe(true);
    expect(isServiceKey('PLATFORM')).toBe(false);
    expect(isServiceKey('unknown')).toBe(false);
  });

  it('flags reserved first-level subdomains', () => {
    expect(isReservedSubdomain('api')).toBe(true);
    expect(isReservedSubdomain('API')).toBe(true);
    expect(isReservedSubdomain('mjcc')).toBe(false);
  });

  it('flags reserved workspace path slugs', () => {
    expect(isReservedWorkspaceSlug('admin')).toBe(true);
    expect(isReservedWorkspaceSlug('new')).toBe(true);
    expect(isReservedWorkspaceSlug('mjcc')).toBe(false);
  });
});

describe('resolveHostContext', () => {
  it('resolves a known app host directly', () => {
    expect(resolveHostContext('accounts.kpnsolute.com')).toEqual({
      app: 'accounts',
      hostname: 'accounts.kpnsolute.com',
      isLocalOverride: false,
    });
  });

  it('prefers an explicit override app key', () => {
    expect(resolveHostContext('localhost', { overrideAppKey: 'platform' })).toEqual({
      app: 'platform',
      hostname: 'localhost',
      isLocalOverride: true,
    });
  });

  it('falls back to a local /__app/{key} path override on unknown hosts', () => {
    expect(resolveHostContext('localhost', { pathname: '/__app/billing/tenants/mjcc' })).toEqual({
      app: 'billing',
      hostname: 'localhost',
      isLocalOverride: true,
    });
  });

  it('does not treat an invalid /__app path segment as an override', () => {
    expect(resolveHostContext('localhost', { pathname: '/__app/not-a-real-app' })).toEqual({
      app: null,
      hostname: 'localhost',
      isLocalOverride: false,
    });
  });

  it('returns a null app for an unrecognized hostname with no override', () => {
    expect(resolveHostContext('example.com')).toEqual({
      app: null,
      hostname: 'example.com',
      isLocalOverride: false,
    });
  });
});

describe('path builders', () => {
  it('builds the canonical shared-management and provisioning paths', () => {
    expect(managementPath('platform', 'mjcc')).toBe('/platform/mjcc');
    expect(newTenantPath('create')).toBe('/create/new');
  });

  it('builds api service paths, trimming leading slashes', () => {
    expect(apiServicePath('compute')).toBe('/compute');
    expect(apiServicePath('compute', 'workspaces/mjcc')).toBe('/compute/workspaces/mjcc');
    expect(apiServicePath('compute', '/workspaces/mjcc')).toBe('/compute/workspaces/mjcc');
  });
});
