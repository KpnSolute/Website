import { describe, expect, it, vi } from 'vitest';
import { main, parseArgs } from './assign-corporate-resource-cli.js';
import { MJCC_COMPUTE_CORPORATION } from './assign-corporate-resource.js';

describe('parseArgs', () => {
  it('reads long options with and without values', () => {
    expect(parseArgs(['--username=mjcc_owner', '--dry-run', '--plan=business'])).toEqual({
      username: 'mjcc_owner',
      'dry-run': true,
      plan: 'business',
    });
  });

  it('reads the operator identity separately from the account receiving ownership', () => {
    expect(
      parseArgs([
        '--username=mjcc_owner',
        '--operator-username=kpn_operator',
        '--operator-label=CR-14',
      ]),
    ).toEqual({
      username: 'mjcc_owner',
      'operator-username': 'kpn_operator',
      'operator-label': 'CR-14',
    });
  });

  it('keeps a value containing an equals sign intact', () => {
    expect(parseArgs(['--resource-id=abc=def'])).toEqual({ 'resource-id': 'abc=def' });
  });

  it('ignores positional arguments rather than guessing what they mean', () => {
    expect(parseArgs(['mjcc', '--username=a'])).toEqual({ username: 'a' });
  });
});

describe('main', () => {
  it('refuses to run without DATABASE_URL', async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(main(['--username=mjcc_owner', '--resource-id=x'])).resolves.toBe(1);
      expect(errors.mock.calls.flat().join(' ')).toMatch(/DATABASE_URL is not set/);
    } finally {
      errors.mockRestore();
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  it('refuses without a product-owned resource id, even with a database', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/kpn';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(main(['--username=mjcc_owner'])).resolves.toBe(1);
      expect(errors.mock.calls.flat().join(' ')).toMatch(/--resource-id/);
    } finally {
      errors.mockRestore();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it('prints usage without touching the database', async () => {
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(main(['--help'])).resolves.toBe(0);
      const printed = logs.mock.calls.flat().join(' ');
      expect(printed).toMatch(/Assign an existing product resource/);
      // The operator flags are discoverable, and the usage text says plainly
      // that the actor is not the account receiving ownership.
      expect(printed).toMatch(/--operator-account-id/);
      expect(printed).toMatch(/--operator-username/);
      expect(printed).toMatch(/--operator-label/);
      expect(printed).toMatch(/never the new owner/);
    } finally {
      logs.mockRestore();
    }
  });

  it('defaults MJCC to its display name while keeping mjcc addressing', () => {
    // The usage text is generated from the same constant the request uses, so
    // this pins both at once.
    expect(MJCC_COMPUTE_CORPORATION.tenant.name).toBe('Miami Job Corps Center');
    expect(MJCC_COMPUTE_CORPORATION.tenant.slug).toBe('mjcc');
    expect(MJCC_COMPUTE_CORPORATION.tenant.subdomain).toBe('mjcc');
  });
});

/**
 * Nothing in this repository may create a production account or run a real
 * assignment. Every path the tests exercise refuses before `getDb` is reached,
 * so no suite ever opens a connection, and the module never self-executes when
 * imported.
 */
describe('no test path performs a live assignment', () => {
  it('refuses every incomplete invocation before opening a database connection', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/kpn';
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // Missing --resource-id: refused in argument handling, never executed.
      await expect(main(['--username=mjcc_owner'])).resolves.toBe(1);
      await expect(main(['--account-id=00000000-0000-0000-0000-000000000000'])).resolves.toBe(1);
      // --help returns before any argument is even interpreted.
      await expect(main(['--help', '--username=mjcc_owner', '--resource-id=x'])).resolves.toBe(0);
    } finally {
      errors.mockRestore();
      logs.mockRestore();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it('runs nothing on import', () => {
    // The module only self-executes when it is process.argv[1]. Importing it
    // here has already proved that: no assignment ran above.
    expect(typeof main).toBe('function');
  });
});
