import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Spinner, TextField } from '@kpn/design-system';
import {
  createAuthorizationRequest,
  discoverMethods,
  submitPin,
  WorkforceApiError,
  type AuthorizeResult,
} from './api';

/**
 * Workforce sign-in host for auth.kpnsolute.com/workforce/sign-in.
 *
 * The page is reached only as the target of a product's authorization request.
 * It never receives, stores, or forwards a token: on success it navigates to a
 * server-verified redirect URL carrying a single-use code.
 */

type Phase = 'starting' | 'ready' | 'submitting' | 'rotate' | 'redirecting' | 'failed';

interface StartupError {
  title: string;
  message: string;
  /** Recoverable errors let the user retry; protocol errors do not. */
  retryable: boolean;
}

function readParams(search: string) {
  const query = new URLSearchParams(search);
  return {
    clientId: query.get('client_id') ?? '',
    redirectUri: query.get('redirect_uri') ?? '',
    codeChallenge: query.get('code_challenge') ?? '',
    codeChallengeMethod: query.get('code_challenge_method') ?? '',
    state: query.get('state') ?? '',
    nonce: query.get('nonce') ?? '',
    service: query.get('service') ?? '',
    scope: query.get('scope') ?? '',
    tenantHint: query.get('tenant_hint'),
  };
}

export function WorkforceSignInPage() {
  const params = useMemo(() => readParams(window.location.search), []);
  const [phase, setPhase] = useState<Phase>('starting');
  const [startupError, setStartupError] = useState<StartupError | null>(null);
  const [authorization, setAuthorization] = useState<AuthorizeResult | null>(null);
  const [methods, setMethods] = useState<string[] | null>(null);

  const [tenantSlug, setTenantSlug] = useState(params.tenantHint ?? '');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase('starting');
    setStartupError(null);

    // Fail before contacting the server when the request is structurally wrong,
    // so a malformed link cannot be mistaken for a service outage.
    const missing = (
      [
        ['client_id', params.clientId],
        ['redirect_uri', params.redirectUri],
        ['code_challenge', params.codeChallenge],
        ['state', params.state],
        ['nonce', params.nonce],
        ['service', params.service],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      setStartupError({
        title: 'This sign-in link is incomplete',
        message: `Start again from your application. Missing: ${missing.join(', ')}.`,
        retryable: false,
      });
      setPhase('failed');
      return;
    }
    if (params.codeChallengeMethod !== 'S256') {
      setStartupError({
        title: 'This sign-in link is not supported',
        message: 'Only the S256 challenge method is accepted. Start again from your application.',
        retryable: false,
      });
      setPhase('failed');
      return;
    }

    try {
      const result = await createAuthorizationRequest(params);
      setAuthorization(result);
      setPhase('ready');
    } catch (error) {
      const apiError = error instanceof WorkforceApiError ? error : null;
      setStartupError({
        title: 'Sign-in could not be started',
        message: apiError?.message ?? 'An unexpected error occurred.',
        retryable: apiError?.code === 'network_error',
      });
      setPhase('failed');
    }
  }, [params]);

  useEffect(() => {
    void start();
  }, [start]);

  // Method discovery is advisory: it tells the user which methods a tenant has
  // enabled. A failure here must not block sign-in.
  useEffect(() => {
    const slug = tenantSlug.trim().toLowerCase();
    if (phase !== 'ready' || !slug || !authorization) return;
    let cancelled = false;
    discoverMethods(slug, authorization.serviceKey)
      .then((result) => {
        if (!cancelled) setMethods(result.methods);
      })
      .catch(() => {
        if (!cancelled) setMethods(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, phase, authorization]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authorization) return;
    setFormError(null);
    setPhase('submitting');
    try {
      const result = await submitPin(authorization.requestId, {
        tenantSlug: tenantSlug.trim().toLowerCase(),
        username: username.trim(),
        pin,
      });
      setRedirectTo(result.redirectTo);
      if (result.mustRotateCredential) {
        // The product still completes sign-in, but the person is told first that
        // their PIN must be changed.
        setPhase('rotate');
        return;
      }
      setPhase('redirecting');
      window.location.assign(result.redirectTo);
    } catch (error) {
      const apiError = error instanceof WorkforceApiError ? error : null;
      // The server returns a uniform message for unknown user and wrong PIN, so
      // this surface cannot be used to discover which usernames exist.
      setFormError(apiError?.message ?? 'Sign-in could not be completed.');
      setPin('');
      setPhase(apiError?.code === 'conflict' ? 'failed' : 'ready');
      if (apiError?.code === 'conflict') {
        setStartupError({
          title: 'This sign-in request has expired',
          message: 'Return to your application and start again.',
          retryable: false,
        });
      }
    }
  }

  if (phase === 'starting') {
    return (
      <Shell>
        <Card title="Preparing sign-in" description="Verifying the request from your application.">
          <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
            <Spinner />
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === 'failed' && startupError) {
    return (
      <Shell>
        <Card title={startupError.title}>
          <Alert tone="danger" title="Sign-in cannot continue">
            {startupError.message}
          </Alert>
          {startupError.retryable && (
            <div style={{ marginTop: 16 }}>
              <Button onClick={() => void start()}>Try again</Button>
            </div>
          )}
        </Card>
      </Shell>
    );
  }

  if (phase === 'rotate' && redirectTo) {
    return (
      <Shell>
        <Card
          title="Your PIN must be changed"
          description="You can continue now, but this PIN is weak or was set for you."
        >
          <Alert tone="warning" title="Change your PIN after signing in">
            Your organization requires a new PIN. Continue to finish signing in, then update it in
            your account settings.
          </Alert>
          <div style={{ marginTop: 16 }}>
            <Button onClick={() => window.location.assign(redirectTo)}>Continue</Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === 'redirecting') {
    return (
      <Shell>
        <Card title="Signing you in" description="Returning you to your application.">
          <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
            <Spinner />
          </div>
        </Card>
      </Shell>
    );
  }

  const busy = phase === 'submitting';
  const pinDisabled = methods !== null && !methods.includes('pin');

  return (
    <Shell>
      <Card
        title="Staff sign-in"
        description={
          authorization?.clientName
            ? `Continue to ${authorization.clientName}.`
            : 'Sign in with your organization staff account.'
        }
      >
        {formError && (
          <Alert tone="danger" title="Could not sign in">
            {formError}
          </Alert>
        )}
        {pinDisabled && (
          <Alert tone="info" title="PIN sign-in is not enabled">
            This organization has not enabled PIN sign-in for this application. Contact your
            manager.
          </Alert>
        )}
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
          <TextField
            label="Organization"
            value={tenantSlug}
            onChange={(event) => setTenantSlug(event.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            hint="The short name your manager gave you, for example mjcc."
            disabled={busy}
          />
          <TextField
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
          />
          <TextField
            label="PIN"
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            required
            inputMode="numeric"
            pattern="\d{4,12}"
            autoComplete="current-password"
            disabled={busy || pinDisabled}
          />
          <Button type="submit" loading={busy} disabled={pinDisabled}>
            Sign in
          </Button>
        </form>
        <p
          style={{
            fontSize: 13,
            color: 'var(--kpn-color-text-muted)',
            marginTop: 16,
          }}
        >
          Staff accounts are managed by your organization. They are separate from a personal
          KpnSolute account.
        </p>
      </Card>
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="kpn-root" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <p style={{ fontWeight: 700, fontSize: 18 }}>
          KpnSolute <span style={{ color: 'var(--kpn-color-text-muted)' }}>Auth</span>
        </p>
        {children}
      </div>
    </main>
  );
}
