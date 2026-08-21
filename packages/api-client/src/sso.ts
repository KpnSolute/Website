import { generateCodeChallenge, generateCodeVerifier, randomOpaqueValue } from './pkce';

/** Browser-side OAuth 2.1 authorization-code + PKCE flow backed by Supabase Auth. */
export interface SsoConfig {
  /** KpnAuth Supabase project origin, never a service-role endpoint. */
  authAppOrigin: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
}

const PENDING_KEY = 'kpnsolute.oauth.pending';
const SESSION_KEY = 'kpnsolute.oauth.session';

interface PendingAuthorization {
  codeVerifier: string;
  state: string;
}

export interface OAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
}

export interface SessionUser {
  id: string;
  primaryEmail: string;
  displayName: string;
}

function authBase(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/auth/v1`;
}

export async function beginSignIn(config: SsoConfig): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = randomOpaqueValue();
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ codeVerifier, state }));

  const url = new URL(`${authBase(config.authAppOrigin)}/oauth/authorize`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', config.scope ?? 'openid email profile');
  window.location.assign(url.toString());
}

export function readOAuthSession(): OAuthSession | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearOAuthSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(PENDING_KEY);
}

export function currentAccessToken(): string | null {
  const session = readOAuthSession();
  return session && session.expiresAt > Date.now() + 10_000 ? session.accessToken : null;
}

export async function refreshOAuthSession(
  config: Pick<SsoConfig, 'authAppOrigin' | 'clientId'>,
): Promise<OAuthSession | null> {
  const current = readOAuthSession();
  if (!current?.refreshToken) return null;
  const response = await fetch(`${authBase(config.authAppOrigin)}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: config.clientId,
    }),
  });
  if (!response.ok) {
    clearOAuthSession();
    return null;
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const session = tokenPayloadToSession(payload, current.refreshToken);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function tokenPayloadToSession(
  payload: Record<string, unknown>,
  fallbackRefreshToken = '',
): OAuthSession {
  if (typeof payload.access_token !== 'string' || typeof payload.expires_in !== 'number') {
    throw new Error('KpnAuth returned an invalid token response.');
  }
  return {
    accessToken: payload.access_token,
    refreshToken:
      typeof payload.refresh_token === 'string' ? payload.refresh_token : fallbackRefreshToken,
    expiresAt: Date.now() + payload.expires_in * 1000,
    tokenType: typeof payload.token_type === 'string' ? payload.token_type : 'Bearer',
  };
}

export async function completeSignIn(
  config: Pick<SsoConfig, 'authAppOrigin' | 'clientId' | 'redirectUri'>,
  queryParams: URLSearchParams,
): Promise<OAuthSession> {
  const returnedError = queryParams.get('error');
  if (returnedError) {
    window.sessionStorage.removeItem(PENDING_KEY);
    throw new Error(`KpnAuth returned an error: ${returnedError}`);
  }
  const code = queryParams.get('code');
  const returnedState = queryParams.get('state');
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  window.sessionStorage.removeItem(PENDING_KEY);
  const pending = raw ? (JSON.parse(raw) as PendingAuthorization) : null;
  if (!code || !returnedState || !pending) throw new Error('The KpnAuth callback is incomplete.');
  if (pending.state !== returnedState)
    throw new Error('The KpnAuth state parameter did not match.');

  const response = await fetch(`${authBase(config.authAppOrigin)}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.codeVerifier,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
    }),
  });
  if (!response.ok) throw new Error('KpnAuth could not exchange the authorization code.');
  const session = tokenPayloadToSession((await response.json()) as Record<string, unknown>);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
