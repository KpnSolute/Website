/**
 * Consumer OAuth consent screen for auth.kpnsolute.com.
 *
 * Unchanged by the workforce work: personal KpnSolute accounts remain owned by
 * Supabase Auth and follow their own authorization flow.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient, type OAuthAuthorizationDetails, type User } from '@supabase/supabase-js';
import { Alert, Button, Card, TextField } from '@kpn/design-system';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const authorizationId = new URLSearchParams(window.location.search).get('authorization_id');

export function ConsumerConsentApp() {
  const supabase = useMemo(
    () => (supabaseUrl && publishableKey ? createClient(supabaseUrl, publishableKey) : null),
    [],
  );
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const loadAuthorization = useCallback(async () => {
    if (!supabase || !authorizationId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    setUser(sessionData.session?.user ?? null);
    if (!sessionData.session) {
      setBusy(false);
      return;
    }
    const { data, error: detailsError } =
      await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (detailsError) throw detailsError;
    if ('redirect_url' in data) {
      window.location.assign(data.redirect_url);
      return;
    }
    setDetails(data);
    setBusy(false);
  }, [supabase]);

  useEffect(() => {
    void loadAuthorization().catch((reason: unknown) => {
      setError(
        reason instanceof Error ? reason.message : 'Unable to load the authorization request.',
      );
      setBusy(false);
    });
  }, [loadAuthorization]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName } },
          });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    if (!result.data.session) {
      setNotice('Check your email to confirm the account, then return to this sign-in request.');
      setBusy(false);
      return;
    }
    await loadAuthorization();
  }

  async function googleSignIn() {
    if (!supabase) return;
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
    }
  }

  async function decide(approved: boolean) {
    if (!supabase || !authorizationId) return;
    setBusy(true);
    const result = approved
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    window.location.assign(result.data.redirect_url);
  }

  if (!supabaseUrl || !publishableKey) {
    return (
      <main className="kpn-root" style={{ padding: 48 }}>
        <Alert tone="danger" title="KpnAuth is not configured">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
        </Alert>
      </main>
    );
  }
  if (!authorizationId) {
    // Consent needs an authorization request. Without one, this is a person who
    // navigated to auth.kpnsolute.com directly, so point them at the direct
    // account flows instead of leaving them at a dead end.
    return (
      <main className="kpn-root" style={{ padding: 48 }}>
        <Alert tone="info" title="No authorization request">
          This page approves access for a KpnSolute product and needs a request from one. To manage
          your own account, sign in directly.
        </Alert>
        <p style={{ marginTop: 16 }}>
          <a href="/login">Sign in to KpnSolute</a> &middot;{' '}
          <a href="/create">Create a KpnSolute account</a>
        </p>
      </main>
    );
  }

  return (
    <main className="kpn-root" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <p style={{ fontWeight: 700, fontSize: 18 }}>
          KpnSolute <span style={{ color: 'var(--kpn-color-text-muted)' }}>Auth</span>
        </p>
        <Card
          title={
            details
              ? `${details.client.name} wants access`
              : mode === 'login'
                ? 'Sign in'
                : 'Create your account'
          }
          description={
            details
              ? `Signed in as ${details.user.email}`
              : 'Use one KpnSolute account across every product.'
          }
        >
          {error && (
            <Alert tone="danger" title="Could not continue">
              {error}
            </Alert>
          )}
          {notice && (
            <Alert tone="info" title="Confirmation required">
              {notice}
            </Alert>
          )}
          {details && user ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <strong>Permissions requested</strong>
                <ul>
                  {details.scope
                    .split(' ')
                    .filter(Boolean)
                    .map((scope) => (
                      <li key={scope}>{scope}</li>
                    ))}
                </ul>
              </div>
              <Button disabled={busy} onClick={() => void decide(true)}>
                Continue
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => void decide(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
              {mode === 'register' && (
                <TextField
                  label="Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  autoComplete="name"
                />
              )}
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <Button type="submit" loading={busy}>
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void googleSignIn()}
              >
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? 'Create a KpnSolute account' : 'Use an existing account'}
              </Button>
            </form>
          )}
        </Card>
        <p style={{ fontSize: 13, color: 'var(--kpn-color-text-muted)' }}>
          Credentials and consent are handled by KpnAuth. Product applications receive scoped
          tokens, never passwords.
        </p>
      </div>
    </main>
  );
}
