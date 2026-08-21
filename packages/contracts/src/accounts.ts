import { RESERVED_SUBDOMAINS, RESERVED_WORKSPACE_SLUGS } from './registry';

/**
 * The KpnSolute username contract.
 *
 * ADR-0007 "Account enrollment and ownership contract": enrollment collects a
 * verified email address, the person's name, and one globally unique KpnSolute
 * username. The username is the stable, user-facing identifier — it is
 * presentation and discovery only.
 *
 * Ownership records, memberships, service principals, billing customers, audit
 * entries, and every authorization decision reference the immutable KpnSolute
 * account id (the auth user id), never the username, the email address, or any
 * user-controlled metadata claim.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/**
 * Lowercase letters, digits, hyphen, and underscore; must start and end with a
 * letter or digit. Kept in lockstep with the `account_profiles_username_format`
 * constraint in migration 0010 so a value can never be valid in one layer and
 * invalid in the other.
 */
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;

/**
 * Names a person may never claim. Reserved platform hostnames and reserved
 * workspace slugs are included so a username can never be mistaken for a
 * KpnSolute-operated identity in a URL, an email local part, or a support
 * conversation.
 */
export const RESERVED_USERNAMES: readonly string[] = Array.from(
  new Set<string>([
    ...RESERVED_SUBDOMAINS,
    ...RESERVED_WORKSPACE_SLUGS,
    'abuse',
    'administrator',
    'billing-support',
    'help',
    'hostmaster',
    'kpn',
    'kpnauth',
    'kpndream',
    'kpnsolute',
    'mail',
    'moderator',
    'noreply',
    'no-reply',
    'official',
    'operator',
    'owner',
    'postmaster',
    'root',
    'security',
    'staff',
    'superuser',
    'system',
    'webmaster',
  ]),
).sort();

const RESERVED_USERNAME_SET = new Set(RESERVED_USERNAMES);

/**
 * The single normalization used everywhere a username is compared or stored.
 * Comparison is case-insensitive, so `MJCCOwner` and `mjccowner` are one name
 * and only one of them can exist.
 */
export function normalizeUsername(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export type UsernameIssueCode = 'empty' | 'too_short' | 'too_long' | 'format' | 'reserved';

export interface UsernameIssue {
  code: UsernameIssueCode;
  reason: string;
}

/** Returns the first problem with a proposed username, or null when it is usable. */
export function inspectUsername(value: string): UsernameIssue | null {
  const normalized = normalizeUsername(value);
  if (!normalized) {
    return { code: 'empty', reason: 'Choose a username.' };
  }
  if (normalized.length < USERNAME_MIN_LENGTH) {
    return {
      code: 'too_short',
      reason: `Usernames need at least ${USERNAME_MIN_LENGTH} characters.`,
    };
  }
  if (normalized.length > USERNAME_MAX_LENGTH) {
    return {
      code: 'too_long',
      reason: `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.`,
    };
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      code: 'format',
      reason:
        'Use lowercase letters, numbers, hyphens, and underscores, starting and ending with a letter or number.',
    };
  }
  if (RESERVED_USERNAME_SET.has(normalized)) {
    return { code: 'reserved', reason: 'That username is reserved by KpnSolute.' };
  }
  return null;
}

export function isValidUsername(value: string): boolean {
  return inspectUsername(value) === null;
}

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAME_SET.has(normalizeUsername(value));
}

/**
 * Whether an account has finished the enrollment contract.
 *
 * This is a presentation state that decides whether the person is sent to
 * "finish account setup". It is never an authorization input: an account with
 * `awaiting_username` is a real, fully authenticated account.
 */
export type AccountSetupState = 'awaiting_username' | 'complete';

export const ACCOUNT_SETUP_STATES: readonly AccountSetupState[] = ['awaiting_username', 'complete'];

export function isAccountSetupState(value: string): value is AccountSetupState {
  return (ACCOUNT_SETUP_STATES as readonly string[]).includes(value);
}

/** Derived in exactly one place, mirroring the generated column in migration 0010. */
export function accountSetupStateFor(username: string | null | undefined): AccountSetupState {
  return username ? 'complete' : 'awaiting_username';
}
