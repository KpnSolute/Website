import { describe, expect, it, vi } from 'vitest';

/**
 * auth.kpnsolute.com must serve useful direct account flows at /login, /create,
 * and /verify without an OAuth `authorization_id`, while leaving the consent
 * screen at `/` intact.
 *
 * The page components are stubbed: this asserts the route contract, not the
 * rendering of each screen.
 */

vi.mock('./consumer/ConsentApp', () => ({
  ConsumerConsentApp: () => null,
}));
vi.mock('./account/AccountAuthPage', () => ({
  AccountAuthPage: ({ mode }: { mode: string }) => null,
}));
vi.mock('./account/AccountVerifyPage', () => ({ AccountVerifyPage: () => null }));
vi.mock('./workforce/SignInPage', () => ({ WorkforceSignInPage: () => null }));
vi.mock('./workforce/StatusPages', () => ({
  WorkforceCallbackErrorPage: () => null,
  WorkforceRecoverPage: () => null,
}));
vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: () => undefined, unmount: () => undefined }),
}));

const { resolveRoute } = await import('./main');

function componentName(pathname: string): string | undefined {
  const element = resolveRoute(pathname) as { type?: { name?: string } };
  return element.type?.name;
}

function modeFor(pathname: string): unknown {
  const element = resolveRoute(pathname) as { props?: { mode?: unknown } };
  return element.props?.mode;
}

describe('auth.kpnsolute.com routes', () => {
  it('renders direct account flows without an OAuth authorization request', () => {
    expect(componentName('/login')).toBe('AccountAuthPage');
    expect(modeFor('/login')).toBe('login');
    expect(componentName('/create')).toBe('AccountAuthPage');
    expect(modeFor('/create')).toBe('create');
    expect(componentName('/verify')).toBe('AccountVerifyPage');
  });

  it('tolerates a trailing slash on every direct route', () => {
    expect(componentName('/login/')).toBe('AccountAuthPage');
    expect(componentName('/create//')).toBe('AccountAuthPage');
    expect(componentName('/verify/')).toBe('AccountVerifyPage');
  });

  it('keeps the OAuth consent screen at the root', () => {
    expect(componentName('/')).toBe('ConsumerConsentApp');
    expect(componentName('')).toBe('ConsumerConsentApp');
  });

  it('keeps tenant workforce sign-in on its own separate routes', () => {
    expect(componentName('/workforce/sign-in')).toBe('WorkforceSignInPage');
    expect(componentName('/workforce/recover')).toBe('WorkforceRecoverPage');
    expect(componentName('/workforce/callback-error')).toBe('WorkforceCallbackErrorPage');
  });

  it('does not fall back to a credential form on an unknown path', () => {
    for (const unknown of ['/nope', '/login/extra', '/workforce', '/create/account']) {
      expect(componentName(unknown), unknown).toBe('NotFound');
    }
  });
});
