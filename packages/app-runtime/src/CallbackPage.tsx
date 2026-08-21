import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { completeSignIn } from '@kpn/api-client';
import { Alert, Spinner } from '@kpn/design-system';
import { useSession } from './SessionProvider';

export function CallbackPage({ successPath = '/' }: { successPath?: string }) {
  const { config, refresh } = useSession();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    completeSignIn(config, searchParams)
      .then(async () => {
        if (cancelled) return;
        await refresh();
        navigate(successPath, { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'KpnAuth sign-in failed.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <Alert tone="danger" title="Sign-in could not be completed">
        {error}
      </Alert>
    );
  }
  return <Spinner label="Completing sign-in" />;
}
