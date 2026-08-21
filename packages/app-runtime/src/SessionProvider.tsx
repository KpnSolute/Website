import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ApiRequestError,
  beginSignIn,
  clearOAuthSession,
  createApiClient,
  createAuthClient,
  currentAccessToken,
  readOAuthSession,
  refreshOAuthSession,
} from '@kpn/api-client';
import type { ApiClient, SessionUser } from '@kpn/api-client';

export interface AppRuntimeConfig {
  /** e.g. http://localhost:4000 locally, https://api.kpnsolute.com in production. */
  apiBaseUrl: string;
  /** KpnAuth Supabase project origin used for OAuth 2.1 endpoints. */
  authAppOrigin: string;
  /** Registered KpnAuth OAuth client id for this app. */
  clientId: string;
  /** This app's own /auth/callback URL. */
  redirectUri: string;
}

export type SessionStatus = 'loading' | 'signed-out' | 'signed-in' | 'setup-required' | 'error';

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  error: string | null;
  api: ApiClient;
  config: AppRuntimeConfig;
  signIn: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({
  config,
  children,
}: {
  config: AppRuntimeConfig;
  children: ReactNode;
}) {
  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiBaseUrl,
        accessToken: async () => {
          const current = currentAccessToken();
          if (current) return current;
          return (await refreshOAuthSession(config))?.accessToken ?? null;
        },
      }),
    [config],
  );
  const authClient = useMemo(() => createAuthClient(api), [api]);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    if (!readOAuthSession()) {
      setUser(null);
      setStatus('signed-out');
      setError(null);
      return;
    }
    try {
      const result = await authClient.session();
      setUser(result.user);
      setStatus('signed-in');
      setError(null);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.isSetupRequired) {
          setStatus('setup-required');
          setError(err.message);
          return;
        }
        if (err.status === 401) {
          setStatus('signed-out');
          setError(null);
          return;
        }
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to resolve the current session.');
    }
  }, [authClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(() => {
    void beginSignIn({
      authAppOrigin: config.authAppOrigin,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
    });
  }, [config.authAppOrigin, config.clientId, config.redirectUri]);

  const signOut = useCallback(async () => {
    clearOAuthSession();
    setUser(null);
    setStatus('signed-out');
  }, []);

  const value: SessionState = { status, user, error, api, config, signIn, signOut, refresh };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider.');
  }
  return context;
}
