import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RESERVED_USERNAMES } from '@kpn/contracts';

const migration = readFileSync(
  new URL('./0010_account_username_profile.sql', import.meta.url),
  'utf8',
);
const lower = migration.toLowerCase();

describe('account username migration', () => {
  it('adds the username additively and nullable, so existing rows migrate', () => {
    expect(lower).toContain('add column if not exists username text');
    expect(lower).not.toMatch(/username text not null/);
    expect(lower).not.toMatch(/drop table|truncate|delete from/);
  });

  it('enforces case-insensitive uniqueness', () => {
    expect(lower).toContain('create unique index if not exists account_profiles_username_unique');
    expect(lower).toContain('on account_profiles (lower(username))');
    expect(lower).toContain('where username is not null');
  });

  it('constrains the username format in lockstep with the contract', () => {
    expect(lower).toContain('account_profiles_username_format');
    // Same pattern as USERNAME_PATTERN in packages/contracts/src/accounts.ts.
    expect(migration).toContain("'^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$'");
  });

  it('refuses exactly the reserved usernames the contract refuses', () => {
    const clause = migration.slice(
      migration.indexOf('account_profiles_username_not_reserved check'),
    );
    const listed = new Set(
      Array.from(clause.slice(0, clause.indexOf(');')).matchAll(/'([a-z0-9-]+)'/g)).map(
        (match) => match[1] as string,
      ),
    );
    // Set equality in both directions: a name reserved in only one layer is a
    // value that is valid in the application and rejected by the database, or
    // the reverse.
    expect([...listed].sort()).toEqual([...RESERVED_USERNAMES].sort());
  });

  it('derives the account setup state instead of storing a column that can drift', () => {
    expect(lower).toContain('account_setup_state');
    expect(lower).toContain('generated always as');
    expect(lower).toContain("'awaiting_username'");
    expect(lower).toContain("'complete'");
  });

  it('denies browser roles direct control of the username column', () => {
    expect(lower).toContain('revoke update (username, username_claimed_at) on account_profiles');
    expect(lower).toContain('from anon, authenticated');
  });

  it('keeps the compatibility users view faithful without reordering its columns', () => {
    const view = lower.slice(lower.indexOf('create or replace view users'));
    const order = ['id', 'primary_email', 'display_name', 'status', 'created_at', 'updated_at'];
    let cursor = 0;
    for (const column of order) {
      const at = view.indexOf(column, cursor);
      expect(at, column).toBeGreaterThan(-1);
      cursor = at;
    }
    expect(view.indexOf('username', cursor)).toBeGreaterThan(-1);
  });

  it('documents a rollback', () => {
    expect(lower).toContain('rollback:');
    expect(lower).toContain('drop column if exists username');
  });
});
