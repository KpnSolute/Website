import { useMemo } from 'react';
import { useSession } from '@kpn/app-runtime';
import { createAccountsClient } from '@kpn/api-client';

/** Memoized accounts API client, rebuilt only when the underlying api client changes. */
export function useAccountsClient() {
  const { api } = useSession();
  return useMemo(() => createAccountsClient(api), [api]);
}
