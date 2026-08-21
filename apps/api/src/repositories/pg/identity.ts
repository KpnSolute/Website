import { accountSetupStateFor, normalizeUsername, type User } from '@kpn/contracts';
import { requireRow, type Db } from '../../db/pool.js';
import type { UserRepository } from '../types.js';

interface UserRow {
  id: string;
  primary_email: string;
  display_name: string;
  username: string | null;
  account_setup_state: string | null;
  status: 'active' | 'suspended' | 'deleted';
  created_at: string;
  updated_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    primaryEmail: row.primary_email,
    displayName: row.display_name,
    username: row.username ?? null,
    // The database generates this column, but it is re-derived here from the
    // same single source so the API shape is correct even against a database
    // that has not yet applied migration 0010.
    accountSetupState: accountSetupStateFor(row.username),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Profile data only. Credentials, identities and sessions remain in auth.*. */
export function createUserRepository(db: Db): UserRepository {
  return {
    async upsertFromAuth(input) {
      // Deliberately never writes `username`. A username is claimed through the
      // validated Accounts route; taking it from a token's user_metadata would
      // let a user pick their own presentation identity without validation.
      const rows = await db.query<UserRow>(
        `insert into account_profiles (id, primary_email, display_name)
         values ($1, lower($2), $3)
         on conflict (id) do update
           set primary_email = excluded.primary_email,
               updated_at = now()
         returning *`,
        [input.id, input.primaryEmail, input.displayName],
      );
      return toUser(requireRow(rows));
    },
    async findByEmail(email) {
      const rows = await db.query<UserRow>(
        `select * from account_profiles where primary_email = lower($1)`,
        [email],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },
    async findById(id) {
      const rows = await db.query<UserRow>(`select * from account_profiles where id = $1`, [id]);
      return rows[0] ? toUser(rows[0]) : null;
    },
    async listByUsername(username) {
      // Returns every match rather than one row on purpose: an operator command
      // that resolves a person by name must be able to refuse an ambiguous
      // result instead of silently picking the first.
      const rows = await db.query<UserRow>(
        `select * from account_profiles where lower(username) = $1 order by created_at asc`,
        [normalizeUsername(username)],
      );
      return rows.map(toUser);
    },
    async claimUsername(id, username) {
      const normalized = normalizeUsername(username);
      // `where username is null` makes the claim fail closed: a second claim
      // never silently renames an account, and a concurrent claim loses rather
      // than overwriting.
      const rows = await db.query<UserRow>(
        `update account_profiles
         set username = $2, username_claimed_at = now(), updated_at = now()
         where id = $1 and username is null
         returning *`,
        [id, normalized],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },
    async update(id, patch) {
      const rows = await db.query<UserRow>(
        `update account_profiles
         set display_name = coalesce($2, display_name), updated_at = now()
         where id = $1 returning *`,
        [id, patch.displayName ?? null],
      );
      return toUser(requireRow(rows));
    },
  };
}
