import { useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Card, TextField } from '@kpn/design-system';
import { inspectUsername, normalizeUsername } from '@kpn/contracts';
import { accountsApi, authConfigState, currentAccessToken, kpnAuthClient } from './config';
import { callbackUrl, returnTarget, withReturn } from './destinations';
import { AuthLayout } from './AuthLayout';

/**
 * Direct KpnSolute account sign-in and enrollment.
 *
 *   auth.kpnsolute.com/login    authenticate, or resume an existing session
 *   auth.kpnsolute.com/create   create a KpnSolute account
 *
 * Both render without an OAuth `authorization_id`. The consent screen at `/`
 * still owns the authorization round trip; these pages own the account itself.
 *
 * Enrollment collects a verified email address, the person's name, and one
 * globally unique KpnSolute username (ADR-0007). The username is claimed
 * through the authenticated Accounts API against the immutable account id — it
 * is never written into user_metadata, which the account holder controls and
 * which the platform must never authorize from.
 *
 * `destination` is where the person ends up once authentication succeeds. With
 * no `return_to`, that is the default completion destination — their account
 * home — never another KpnAuth page. An enrollment still travels through
 * `/verify` because `callbackUrl` routes the provider/email redirect there and
 * carries this destination along.
 */

export type AccountAuthMode = 'login' | 'create';

export function AccountAuthPage({ mode }: { mode: AccountAuthMode }) {
  const config = authConfigState();
  const supabase = kpnAuthClient();
  const destination = useMemo(() => returnTarget(window.location.search), []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usernameIssue = useMemo(
    () => (mode === 'create' && username ? inspectUsername(username) : null),
    [mode, username],
  );

  if (!config.configured || !supabase) {
    return (
      <AuthLayout title="KpnAuth is not configured">
        <Alert tone="danger" title="Sign-in is unavailable">
          This deployment is missing {config.missing.join(', ')}. KpnAuth fails closed rather than
          presenting a sign-in form that cannot work.
        </Alert>
      </AuthLayout>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setError(null);
    setNotice(null);

    if (mode === 'create') {
      const issue = inspectUsername(username);
      if (issue) {
        setError(issue.reason);
        return;
      }
    }

    setBusy(true);
    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            // display_name is presentation metadata only; the platform reads the
            // profile row, never a metadata claim, for anything that matters.
            options: {
              data: { display_name: displayName },
              emailRedirectTo: callbackUrl(destination),
            },
          });

    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    if (!result.data.session) {
      // Email confirmation is pending. The preferred username cannot be claimed
      // without a session, so it is collected again on /verify rather than
      // parked somewhere it could be tampered with.
      setNotice(
        'Check your email to confirm this address, then return here to finish setting up your account.',
      );
      setBusy(false);
      return;
    }

    if (mode === 'create') {
      const claimed = await claimUsername(username);
      if (claimed) {
        setError(claimed);
        setBusy(false);
        return;
      }
    }

    window.location.assign(destination);
  }

  /** Returns an error message, or null on success. */
  async function claimUsername(value: string): Promise<string | null> {
    try {
      await accountsApi(currentAccessToken).claimUsername(normalizeUsername(value));
      return null;
    } catch (reason) {
      return reason instanceof Error
        ? `Your account was created, but the username could not be reserved: ${reason.message}`
        : 'Your account was created, but the username could not be reserved.';
    }
  }

  async function continueWithGoogle() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    // One Google configuration lives in KpnAuth. Products never create their own
    // Google identity silo, and a returning Google user is the same KpnSolute
    // account rather than a second one.
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(destination) },
    });
    if (googleError) {
      setError(googleError.message);
      setBusy(false);
    }
  }

  const isCreate = mode === 'create';

  return (
    <AuthLayout
      title={isCreate ? 'Create your KpnSolute account' : 'Sign in to KpnSolute'}
      description={
        isCreate
          ? 'One account for Platform, Accounts, Billing, and every KpnSolute product.'
          : 'Use your KpnSolute account. Tenant staff sign in inside their own workspace instead.'
      }
    >
      <Card>
        {error && (
          <Alert tone="danger" title="Could not continue">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert tone="info" title="Confirm your email">
            {notice}
          </Alert>
        )}
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
          {isCreate && (
            <TextField
              label="Full name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              maxLength={120}
              autoComplete="name"
            />
          )}
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
          {isCreate && (
            <TextField
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="username"
              hint="Your public KpnSolute name. Lowercase letters, numbers, hyphens, and underscores."
              error={usernameIssue?.reason}
            />
          )}
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={12}
            autoComplete={isCreate ? 'new-password' : 'current-password'}
          />
          <Button type="submit" loading={busy} disabled={Boolean(usernameIssue)}>
            {isCreate ? 'Create account' : 'Sign in'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void continueWithGoogle()}
          >
            Continue with Google
          </Button>
        </form>
      </Card>
      <p style={{ fontSize: 13, marginTop: 16 }}>
        {isCreate ? (
          <a href={withReturn('/login', destination)}>Already have a KpnSolute account? Sign in</a>
        ) : (
          <a href={withReturn('/create', destination)}>Create a KpnSolute account</a>
        )}
      </p>
      <p style={{ fontSize: 13, color: 'var(--kpn-color-text-muted)' }}>
        Credentials are handled by KpnAuth. Applications receive scoped tokens, never passwords.
      </p>
    </AuthLayout>
  );
}
