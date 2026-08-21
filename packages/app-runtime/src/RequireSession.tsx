import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Alert, SetupRequiredAlert, Spinner } from '@kpn/design-system';
import { useSession } from './SessionProvider';

export function RequireSession({ children }: { children: ReactNode }) {
  const { status, error, signIn } = useSession();

  useEffect(() => {
    if (status === 'signed-out') {
      signIn();
    }
  }, [status, signIn]);

  if (status === 'loading' || status === 'signed-out') {
    return <Spinner label="Resolving your KpnAuth session" />;
  }
  if (status === 'setup-required') {
    return <SetupRequiredAlert what="The KpnSolute API and database" />;
  }
  if (status === 'error') {
    return (
      <Alert tone="danger" title="Could not resolve your session">
        {error}
      </Alert>
    );
  }
  return <>{children}</>;
}
