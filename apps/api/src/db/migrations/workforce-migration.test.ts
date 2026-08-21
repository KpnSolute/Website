import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./0007_tenant_workforce_auth.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('workforce auth migration security boundary', () => {
  it('scopes usernames to a tenant instead of making them globally unique', () => {
    expect(migration).toContain('unique (tenant_id, normalized_username)');
    expect(migration).not.toMatch(/unique\s*\(\s*normalized_username\s*\)/);
  });

  it('keeps credential, session, and audit records in the private schema', () => {
    expect(migration).toContain('create table private.workforce_credentials');
    expect(migration).toContain('create table private.workforce_sessions');
    expect(migration).toContain('create table private.workforce_auth_audit');
    expect(migration).toContain(
      'revoke all on private.workforce_credentials from public, anon, authenticated',
    );
  });

  it('enables RLS on every public workforce table and creates no permissive browser policy', () => {
    for (const table of [
      'workforce_staff_accounts',
      'tenant_workforce_auth_policies',
      'workforce_installation_assignments',
      'workforce_legacy_identity_links',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(`revoke all on ${table} from anon, authenticated`);
    }
    expect(migration).not.toMatch(
      /create policy[\s\S]+on workforce_staff_accounts[\s\S]+using \(true\)/,
    );
  });
});
