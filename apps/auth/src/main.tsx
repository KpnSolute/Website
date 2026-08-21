import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConsumerConsentApp } from './consumer/ConsentApp';
import { AccountAuthPage } from './account/AccountAuthPage';
import { AccountVerifyPage } from './account/AccountVerifyPage';
import { WorkforceSignInPage } from './workforce/SignInPage';
import { WorkforceCallbackErrorPage, WorkforceRecoverPage } from './workforce/StatusPages';

/**
 * Entry point for auth.kpnsolute.com.
 *
 * Three audiences share this host and must never be conflated:
 *
 *   /                          consumer OAuth consent (needs authorization_id)
 *   /login                     direct KpnSolute account sign-in
 *   /create                    direct KpnSolute account enrollment
 *   /verify                    email/Google landing and "finish account setup"
 *   /workforce/sign-in         tenant staff sign-in host
 *   /workforce/callback-error  post-redirect failure surface
 *   /workforce/recover         locked or rotation-required guidance
 *
 * The direct account routes render without an OAuth authorization request
 * (ADR-0007 "Account enrollment and ownership contract"). The consent screen at
 * `/` still owns the authorization round trip and is unchanged by them.
 *
 * Routing is a plain path switch rather than a router dependency: this app has
 * a handful of static routes and no nested layouts.
 */
function resolveRoute(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  switch (path) {
    case '/login':
      return <AccountAuthPage mode="login" />;
    case '/create':
      return <AccountAuthPage mode="create" />;
    case '/verify':
      return <AccountVerifyPage />;
    case '/workforce/sign-in':
      return <WorkforceSignInPage />;
    case '/workforce/callback-error':
      return <WorkforceCallbackErrorPage />;
    case '/workforce/recover':
      return <WorkforceRecoverPage />;
    case '/':
      return <ConsumerConsentApp />;
    default:
      return <NotFound />;
  }
}

function NotFound() {
  return (
    <main className="kpn-root" style={{ display: 'grid', placeItems: 'center', padding: 48 }}>
      <div style={{ maxWidth: 460 }}>
        <p style={{ fontWeight: 700, fontSize: 18 }}>
          KpnSolute <span style={{ color: 'var(--kpn-color-text-muted)' }}>Auth</span>
        </p>
        <p>That sign-in page does not exist. Start from the application you were using.</p>
        <p>
          <a href="/login">Sign in to KpnSolute</a>
        </p>
      </div>
    </main>
  );
}

export { resolveRoute };

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{resolveRoute(window.location.pathname)}</React.StrictMode>,
);
