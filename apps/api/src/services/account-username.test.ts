import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/errors.js';
import { createInMemoryPlatform, makeUser } from '../testing/in-memory-platform.js';
import {
  checkUsernameAvailability,
  claimAccountUsername,
  resolveExactlyOneAccount,
} from './account-username.js';

function platform(users = [makeUser({ id: 'user-1' })]) {
  const { db, store, repositories } = createInMemoryPlatform({ users });
  return { store, repos: repositories(db) };
}

describe('checkUsernameAvailability', () => {
  it('reports a free username as available', async () => {
    const { repos } = platform();
    await expect(checkUsernameAvailability(repos, 'mjcc-owner')).resolves.toMatchObject({
      normalized: 'mjcc-owner',
      available: true,
      reason: null,
    });
  });

  it('reports a taken username, ignoring case', async () => {
    const { repos } = platform([makeUser({ id: 'user-1', username: 'mjcc-owner' })]);
    const result = await checkUsernameAvailability(repos, 'MJCC-Owner');
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/already taken/i);
  });

  it('reports an invalid or reserved username without querying availability', async () => {
    const { repos } = platform();
    expect((await checkUsernameAvailability(repos, 'platform')).available).toBe(false);
    expect((await checkUsernameAvailability(repos, 'no')).reason).toMatch(/at least/i);
  });
});

describe('claimAccountUsername', () => {
  it('claims a username and records an audit entry', async () => {
    const { repos, store } = platform();
    const result = await claimAccountUsername(repos, 'user-1', 'MJCC_Owner');
    expect(result.changed).toBe(true);
    expect(result.user.username).toBe('mjcc_owner');
    expect(result.user.accountSetupState).toBe('complete');
    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]?.action).toBe('accounts.username.claimed');
  });

  it('is idempotent for the same normalized value', async () => {
    const { repos, store } = platform([makeUser({ id: 'user-1', username: 'mjcc_owner' })]);
    const result = await claimAccountUsername(repos, 'user-1', 'MJCC_Owner');
    expect(result.changed).toBe(false);
    expect(store.audit).toHaveLength(0);
  });

  it('refuses a rename rather than silently moving the identity', async () => {
    const { repos } = platform([makeUser({ id: 'user-1', username: 'mjcc_owner' })]);
    await expect(claimAccountUsername(repos, 'user-1', 'someone-else')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses a username another account already holds', async () => {
    const { repos } = platform([
      makeUser({ id: 'user-1' }),
      makeUser({ id: 'user-2', username: 'mjcc_owner' }),
    ]);
    await expect(claimAccountUsername(repos, 'user-1', 'mjcc_owner')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses an invalid or reserved username with a validation error', async () => {
    const { repos } = platform();
    await expect(claimAccountUsername(repos, 'user-1', 'platform')).rejects.toMatchObject({
      status: 422,
    });
    await expect(claimAccountUsername(repos, 'user-1', '-bad-')).rejects.toMatchObject({
      status: 422,
    });
  });

  it('refuses when the account does not exist', async () => {
    const { repos } = platform([]);
    await expect(claimAccountUsername(repos, 'ghost', 'someone')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('resolveExactlyOneAccount', () => {
  it('resolves by immutable account id', async () => {
    const { repos } = platform();
    await expect(resolveExactlyOneAccount(repos, { accountId: 'user-1' })).resolves.toMatchObject({
      id: 'user-1',
    });
  });

  it('resolves by exact normalized username', async () => {
    const { repos } = platform([makeUser({ id: 'user-1', username: 'mjcc_owner' })]);
    await expect(
      resolveExactlyOneAccount(repos, { username: '  MJCC_Owner ' }),
    ).resolves.toMatchObject({ id: 'user-1' });
  });

  it('refuses when both selectors are supplied', async () => {
    const { repos } = platform();
    await expect(
      resolveExactlyOneAccount(repos, { accountId: 'user-1', username: 'mjcc_owner' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses when neither selector is supplied', async () => {
    const { repos } = platform();
    await expect(resolveExactlyOneAccount(repos, {})).rejects.toMatchObject({ status: 422 });
    await expect(
      resolveExactlyOneAccount(repos, { accountId: '  ', username: '' }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuses an ambiguous username instead of choosing a row', async () => {
    // The unique index makes this impossible in PostgreSQL. The command refuses
    // anyway, so a future schema regression cannot become a silent misassignment.
    const { repos } = platform([
      makeUser({ id: 'user-1', username: 'mjcc_owner' }),
      makeUser({ id: 'user-2', username: 'mjcc_owner' }),
    ]);
    await expect(resolveExactlyOneAccount(repos, { username: 'mjcc_owner' })).rejects.toMatchObject(
      { status: 409 },
    );
  });

  it('refuses an unknown account or username', async () => {
    const { repos } = platform();
    await expect(resolveExactlyOneAccount(repos, { accountId: 'ghost' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(resolveExactlyOneAccount(repos, { username: 'nobody' })).rejects.toMatchObject({
      status: 404,
    });
  });
});
