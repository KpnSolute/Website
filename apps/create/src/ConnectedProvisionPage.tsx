import { useCallback, useMemo } from 'react';
import { createCreateClient } from '@kpn/api-client';
import { useSession } from '@kpn/app-runtime';
import { ProvisionOrganizationPage } from './ProvisionOrganizationPage';

/**
 * Binds the provisioning flow to the authenticated KpnSolute API client. The
 * client attaches the current KpnAuth bearer token, so provisioning is
 * authorized by the session rather than by an ambient cookie.
 */
export function ConnectedProvisionPage({ presetServiceKey }: { presetServiceKey?: string }) {
  const { api } = useSession();
  const create = useMemo(() => createCreateClient(api), [api]);
  const loadServices = useCallback(() => create.services(), [create]);
  const provision = useCallback(
    (input: Parameters<typeof create.provision>[0]) => create.provision(input),
    [create],
  );

  return (
    <ProvisionOrganizationPage
      loadServices={loadServices}
      provision={provision}
      presetServiceKey={presetServiceKey}
    />
  );
}
