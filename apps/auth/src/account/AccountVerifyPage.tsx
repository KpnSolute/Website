import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Spinner, TextField } from '@kpn/design-system';
import { inspectUsername, normalizeUsername, type User } from '@kpn/contracts';
import { accountsApi, authConfigState, currentAccessToken, kpnAuthClient } from './config';
import { completionTarget, verifyPath, withReturn } from './destinations';
import { AuthLayout } from './AuthLayout';

/**
 * auth.kpnsolute.com/verify — the step that completes an account.
 *
 * It is the landing target for a Google enrollment and for an email
 * confirmation link, and it is where an account in the `awaiting_username`
 * state finishes setup. A Google enrollment links a provider identity to the
 * same KpnSolute account rather than manufacturing a second one, so the only
 * thing that can still be missing is the username.
 *
 * `awaiting_username` is a presentation state. The person is fully
 * authenticated while they are in it; nothing here is an authorization gate.
 *
 * This page ends the flow, so its destination is resolved with
 * `completionTarget`: a `return_to` naming this host is dropped, and with no
 * usable hint the person lands on their account home. "Continue" can therefore
 * never navigate back to /verify.
 *
 * The signed-out branch is the one place that deliberately points back here:
 * it sends the person to `/login` with a *relative* hop through `/verify`, so
 * an account that still needs a username finishes setup on the way. That hop is
 * what `returnTarget` accepts and `completionTarget` refuses, which is why it
 * cannot become a loop.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'awaiting-username'; user: User }
  | { kind: 'complete'; user: User };

export function AccountVerifyPage() {
  const config = authConfigState();
  const supabase = kpnAuthClient();
  const destination = useMemo(() => completionTarget(window.location.search), []);
  const accounts = useMemo(() => accountsApi(currentAccessToken), []);

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [username, setUsername] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setState({ kind: 'loading' });
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setState({ kind: 'signed-out' });
      return;
    }
    try {
      const user = await accounts.me();
      setState(user.username ? { kind: 'complete', user } : { kind: 'awaiting-username', user });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not load your account.',
      });
    }
  }, [accounts, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const usernameIssue = useMemo(() => (username ? inspectUsername(username) : null), [username]);

  if (!config.configured || !supabase) {
    return (
      <AuthLayout title="KpnAuth is not configured">
        <Alert tone="danger" title="Account setup is unavailable">
          This deployment is missing {config.missing.join(', ')}.
        </Alert>
      </AuthLayout>
    );
  }

  async function claim(event: FormEvent) {
    event.preventDefault();
    const issue = inspectUsername(username);
    if (issue) {
      setFormError(issue.reason);
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const user = await accounts.claimUsername(normalizeUsername(username));
      setState({ kind: 'complete', user });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not reserve that username.');
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <AuthLayout title="Finishing sign-in">
        <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
          <Spinner />
        </div>
      </AuthLayout>
    );
  }

  if (state.kind === 'signed-out') {
    return (
      <AuthLayout
        title="Verify your KpnSolute account"
        description="Confirm your email from the message we sent, then sign in to finish setup."
      >
        <Card>
          <p style={{ marginTop: 0 }}>
            This page completes an account after email confirmation or a Google sign-in. There is no
            active KpnAuth session in this browser yet.
          </p>
          <Button
            onClick={() => window.location.assign(withReturn('/login', verifyPath(destination)))}
          >
            Go to sign in
          </Button>
        </Card>
      </AuthLayout>
    );
  }

  if (state.kind === 'error') {
    return (
      <AuthLayout title="Verify your KpnSolute account">
        <Card>
          <Alert tone="danger" title="Could not load your account">
            {state.message}
          </Alert>
          <div style={{ marginTop: 16 }}>
            <Button onClick={() => void load()}>Try again</Button>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  if (state.kind === 'awaiting-username') {
    return (
      <AuthLayout
        title="Finish account setup"
        description="Your KpnSolute account is ready. Choose the username people will see."
      >
        <Card
          title={state.user.displayName}
          description={`Signed in as ${state.user.primaryEmail}`}
        >
          {formError && (
            <Alert tone="danger" title="Could not reserve that username">
              {formError}
            </Alert>
          )}
          <form onSubmit={claim} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            <TextField
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="username"
              hint="Lowercase letters, numbers, hyphens, and underscores. This is how you appear across KpnSolute."
              error={usernameIssue?.reason}
            />
            <Button type="submit" loading={busy} disabled={Boolean(usernameIssue)}>
              Save username
            </Button>
          </form>
          <p style={{ fontSize: 13, color: 'var(--kpn-color-text-muted)' }}>
            Your username identifies you to other people. Ownership, membership, and billing records
            always use your account id, so this never changes what you can access.
          </p>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Your account is ready" description={`Signed in as @${state.user.username}`}>
      <Card title={state.user.displayName} description={state.user.primaryEmail}>
        <p style={{ marginTop: 0 }}>
          Account setup is complete. Continue to where you were headed, or manage your organizations
          in Platform.
        </p>
        <Button onClick={() => window.location.assign(destination)}>Continue</Button>
      </Card>
    </AuthLayout>
  );
}
