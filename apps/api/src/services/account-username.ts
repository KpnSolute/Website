import { inspectUsername, normalizeUsername } from '@kpn/contracts';
import type { Id, User } from '@kpn/contracts';
import { ApiError } from '../lib/errors.js';
import type { Repositories } from '../repositories/types.js';

/**
 * Claiming and resolving the KpnSolute username.
 *
 * ADR-0007: the username is the stable, user-facing identifier and is
 * presentation/discovery only. Every call here is keyed by the immutable
 * account id supplied by the verified bearer token — the username is never an
 * input to an authorization decision, and is never read from a token's
 * user_metadata, which the account holder controls.
 */

export interface UsernameAvailability {
  requested: string;
  normalized: string;
  available: boolean;
  /** Why it is unavailable, or null when it can be claimed. */
  reason: string | null;
}

export async function checkUsernameAvailability(
  repos: Repositories,
  requested: string,
): Promise<UsernameAvailability> {
  const normalized = normalizeUsername(requested);
  const issue = inspectUsername(requested);
  if (issue) {
    return { requested, normalized, available: false, reason: issue.reason };
  }
  const existing = await repos.users.listByUsername(normalized);
  return {
    requested,
    normalized,
    available: existing.length === 0,
    reason: existing.length === 0 ? null : 'That username is already taken.',
  };
}

/**
 * Claims a username for the signed-in account. Idempotent for the same
 * normalized value; a different value is refused rather than applied, because
 * renaming has to preserve ownership and audit history and is not yet a
 * supported operation (ADR-0007 conditions).
 */
export async function claimAccountUsername(
  repos: Repositories,
  userId: Id,
  requested: string,
): Promise<{ user: User; changed: boolean }> {
  const issue = inspectUsername(requested);
  if (issue) throw ApiError.validation(issue.reason);
  const normalized = normalizeUsername(requested);

  const current = await repos.users.findById(userId);
  if (!current) throw ApiError.notFound('Account not found.');
  if (current.username) {
    if (current.username === normalized) return { user: current, changed: false };
    throw ApiError.conflict(
      'This account already has a KpnSolute username. Username changes are not enabled.',
    );
  }

  let claimed: User | null;
  try {
    claimed = await repos.users.claimUsername(userId, normalized);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw ApiError.conflict('That username is already taken.');
    }
    throw error;
  }

  if (!claimed) {
    // Another request for the same account won the race. Re-read rather than
    // assume, so the caller is told the truth about what the account now holds.
    const settled = await repos.users.findById(userId);
    if (settled?.username === normalized) return { user: settled, changed: false };
    throw ApiError.conflict(
      'This account already has a KpnSolute username. Username changes are not enabled.',
    );
  }

  await repos.audit.record({
    tenantId: null,
    actorUserId: userId,
    action: 'accounts.username.claimed',
    targetType: 'account_profile',
    targetId: userId,
    metadata: { username: normalized },
  });

  return { user: claimed, changed: true };
}

/**
 * Resolves exactly one account from an immutable id or an exact normalized
 * username. Refuses an ambiguous match instead of choosing a row: a unique
 * index makes two matches impossible, and if that ever stops being true, an
 * operator command must stop rather than guess.
 */
export async function resolveExactlyOneAccount(
  repos: Repositories,
  selector: { accountId?: string | null; username?: string | null },
): Promise<User> {
  const accountId = selector.accountId?.trim() || null;
  const username = selector.username?.trim() || null;

  if (accountId && username) {
    throw ApiError.validation('Supply either an account id or a username, not both.');
  }
  if (!accountId && !username) {
    throw ApiError.validation('Supply the account id or the exact KpnSolute username.');
  }

  if (accountId) {
    const user = await repos.users.findById(accountId);
    if (!user) throw ApiError.notFound(`No KpnSolute account has the id "${accountId}".`);
    return user;
  }

  const normalized = normalizeUsername(username as string);
  if (inspectUsername(normalized)) {
    throw ApiError.validation(`"${username}" is not a valid KpnSolute username.`);
  }
  const matches = await repos.users.listByUsername(normalized);
  if (matches.length === 0) {
    throw ApiError.notFound(`No KpnSolute account holds the username "${normalized}".`);
  }
  if (matches.length > 1) {
    throw ApiError.conflict(
      `The username "${normalized}" matches ${matches.length} accounts. Refusing to choose one; resolve the duplicate and re-run with an account id.`,
    );
  }
  return matches[0] as User;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
