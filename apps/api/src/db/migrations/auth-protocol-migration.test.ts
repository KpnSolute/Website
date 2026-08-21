import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./0008_auth_protocol_foundation.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('auth protocol migration security boundary', () => {
  it('keeps every credential-bearing table in the private schema', () => {
    for (const table of [
      'private.oauth_client_secrets',
      'private.oauth_authorization_requests',
      'private.oauth_authorization_codes',
      'private.oauth_refresh_families',
      'private.oauth_refresh_tokens',
      'private.device_credentials',
      'private.service_account_credentials',
    ]) {
      expect(migration).toContain(`create table ${table}`);
      expect(migration).toContain(`revoke all on ${table} from public, anon, authenticated`);
    }
  });

  it('stores authorization codes and refresh tokens only as fixed-length hashes', () => {
    expect(migration).toContain(
      'code_hash text not null unique check (char_length(code_hash) = 64)',
    );
    expect(migration).toContain(
      'token_hash text not null unique check (char_length(token_hash) = 64)',
    );
    // No column may hold the secret itself.
    expect(migration).not.toMatch(/\bcode_plaintext\b|\brefresh_token text\b|\bsecret text\b/);
  });

  it('accepts only the S256 PKCE method at the schema level', () => {
    expect(migration).toContain("code_challenge_method text not null default 's256'");
    expect(migration).toContain("check (code_challenge_method = 's256')");
    expect(migration).not.toContain("'plain'");
  });

  it('refuses to register a redirect URI that is insecure or carries a fragment', () => {
    expect(migration).toContain("redirect_uri like 'https://%'");
    expect(migration).toContain("position('#' in redirect_uri) = 0");
    // No wildcard column may exist: an open redirect is the highest-value attack.
    expect(migration).not.toMatch(/redirect_uri_pattern|redirect_wildcard|allow_any_redirect/);
  });

  it('gives authorization codes a single-use consumption column', () => {
    expect(migration).toContain('consumed_at timestamptz');
    expect(migration).toContain(
      "consumed_outcome text check (consumed_outcome in ('exchanged', 'rejected'))",
    );
  });

  it('models refresh tokens as families so reuse can revoke every sibling', () => {
    expect(migration).toContain('create table private.oauth_refresh_families');
    expect(migration).toContain('family_id uuid not null');
    expect(migration).toContain('replaced_by_id uuid references private.oauth_refresh_tokens(id)');
  });

  it('enables RLS and denies browser roles on every new public table', () => {
    for (const table of [
      'oauth_clients',
      'oauth_client_redirect_uris',
      'device_identities',
      'service_accounts',
      'workforce_identity_import_mappings',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(`revoke all on ${table} from anon, authenticated`);
    }
  });

  it('creates only restrictive deny policies, never a permissive browser policy', () => {
    const policies = migration.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toContain('as restrictive');
      expect(policy).toContain('using (false)');
      expect(policy).not.toContain('using (true)');
    }
  });

  it('binds devices and service accounts to one tenant through a composite key', () => {
    // The composite foreign key is what proves an installation and its tenant
    // cannot be mixed across tenants.
    const composite = 'references product_installations(id, tenant_id) on delete cascade';
    expect(migration.split(composite).length - 1).toBeGreaterThanOrEqual(3);
  });

  it('makes the workforce import mapping idempotent per source row', () => {
    expect(migration).toContain(
      'unique (source_service, source_table, source_row_id, installation_id)',
    );
    expect(migration).toContain('requires_credential_rotation boolean not null default false');
  });

  it('adds the corporation tenant type without dropping the existing types', () => {
    for (const type of ['personal', 'organization', 'school', 'team', 'corporation']) {
      expect(migration).toContain(`'${type}'`);
    }
  });

  it('is additive: it drops no table and no column', () => {
    expect(migration).not.toMatch(/drop table|drop column|truncate|delete from/);
  });
});
