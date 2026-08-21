import { describe, expect, it } from 'vitest';
import { APP_HOSTS } from '@kpn/contracts';

describe('Accounts routing contract', () => {
  it('uses the governed account hostname', () => {
    expect(APP_HOSTS.accounts).toBe('accounts.kpnsolute.com');
  });
});
