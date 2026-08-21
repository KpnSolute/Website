import { useCallback, useMemo } from 'react';
import { createPlatformClient } from '@kpn/api-client';
import { crossAppUrl, useSession } from '@kpn/app-runtime';
import { OrganizationsPage } from './OrganizationsPage';

/**
 * Binds the organization surface to the authenticated KpnSolute API client.
 *
 * The client attaches the current KpnAuth bearer token and targets the shared
 * `api.kpnsolute.com/platform` namespace, replacing the earlier cookie-only
 * fetch. Creation links to the real Create flow rather than duplicating a
 * provisioning form here.
 */
export function ConnectedOrganizationsPage() {
  const { api } = useSession();
  const platform = useMemo(() => createPlatformClient(api), [api]);
  const loadOverview = useCallback(() => platform.overview(), [platform]);
  const createHref = useMemo(() => crossAppUrl('create', '/', import.meta.env.DEV), []);

  return <OrganizationsPage loadOverview={loadOverview} createHref={createHref} />;
}
