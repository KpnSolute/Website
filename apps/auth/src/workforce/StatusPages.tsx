import { Alert, Button, Card } from '@kpn/design-system';
import { Shell } from './SignInPage';

/**
 * Post-redirect failure surface for auth.kpnsolute.com/workforce/callback-error.
 *
 * Products send a person here when their own callback could not complete — a
 * state mismatch, a spent code, or a failed exchange. The page reads only the
 * non-sensitive `error` and `error_description` parameters and offers a clean
 * restart rather than attempting to recover an untrusted request.
 */
export function WorkforceCallbackErrorPage() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get('error') ?? 'unknown_error';
  const description = query.get('error_description');
  const returnTo = query.get('return_to');

  const explanation: Record<string, string> = {
    state_mismatch:
      'The sign-in response did not match the request that started it. This protects you from a forged sign-in link.',
    invalid_code: 'The sign-in code was already used or has expired. Codes are valid only once.',
    access_denied: 'Your staff account is not permitted to use this application.',
    unknown_error: 'The sign-in could not be completed.',
  };

  return (
    <Shell>
      <Card title="Sign-in could not be completed">
        <Alert tone="danger" title="Something interrupted your sign-in">
          {explanation[code] ?? explanation.unknown_error}
        </Alert>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--kpn-color-text-muted)', marginTop: 12 }}>
            {description}
          </p>
        )}
        <div style={{ marginTop: 16 }}>
          {/* Only a same-origin or explicitly relative return target is offered;
              an absolute URL from the query string is never followed. */}
          {returnTo && returnTo.startsWith('/') ? (
            <Button onClick={() => window.location.assign(returnTo)}>Start again</Button>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--kpn-color-text-muted)' }}>
              Return to your application and sign in again.
            </p>
          )}
        </div>
      </Card>
    </Shell>
  );
}

/**
 * Recovery surface for auth.kpnsolute.com/workforce/recover.
 *
 * Staff credentials are owned by the tenant, not by KpnSolute, so this page
 * deliberately cannot reset anything. It explains the correct path instead of
 * offering a self-service reset that would let anyone claim a staff account.
 */
export function WorkforceRecoverPage() {
  const query = new URLSearchParams(window.location.search);
  const reason = query.get('reason');

  return (
    <Shell>
      <Card
        title="Get back into your staff account"
        description="Staff sign-in is managed by your organization."
      >
        {reason === 'locked' && (
          <Alert tone="warning" title="Sign-in is temporarily locked">
            Too many incorrect attempts were made. Sign-in unlocks automatically after a short wait.
            Your manager can also unlock it for you.
          </Alert>
        )}
        {reason === 'rotation_required' && (
          <Alert tone="warning" title="Your PIN must be changed">
            Your organization requires a new PIN before you can continue. Ask your manager to set a
            new one.
          </Alert>
        )}
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <p style={{ margin: 0 }}>
            KpnSolute cannot reset a staff PIN. Your organization&rsquo;s manager or administrator
            issues and resets staff credentials.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--kpn-color-text-muted)' }}>
            If you also have a personal KpnSolute account, that is a separate sign-in and can be
            recovered from your account settings.
          </p>
        </div>
      </Card>
    </Shell>
  );
}
