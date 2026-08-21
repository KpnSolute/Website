import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { EnvRecord } from '@kpn/config';
import { readEnv, requireEnv } from '@kpn/config';
import type { Repositories } from '../repositories/types.js';
import { ApiError } from '../lib/errors.js';

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  user: { id: string; primaryEmail: string; displayName: string };
  claims: JWTPayload;
}

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function jwtConfig(env: EnvRecord) {
  // A presented token cannot be verified without the issuer configuration.
  // Surface that as an explicit 503 setup_required rather than letting
  // SetupRequiredError escape as an opaque 500.
  const configured = readEnv(env, 'SUPABASE_URL');
  if (!configured) {
    throw ApiError.setupRequired('The KpnAuth identity provider');
  }
  const supabaseUrl = configured.replace(/\/+$/, '');
  return {
    issuer: readEnv(env, 'SUPABASE_JWT_ISSUER') ?? `${supabaseUrl}/auth/v1`,
    jwksUrl: readEnv(env, 'SUPABASE_JWKS_URL') ?? `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    audience: readEnv(env, 'SUPABASE_JWT_AUDIENCE') ?? 'authenticated',
  };
}

function displayNameFromClaims(claims: JWTPayload, email: string): string {
  const metadata = claims.user_metadata;
  if (metadata && typeof metadata === 'object') {
    const record = metadata as Record<string, unknown>;
    for (const key of ['display_name', 'full_name', 'name']) {
      if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
    }
  }
  return email.split('@')[0] || 'KpnSolute user';
}

export async function resolveAccessToken(
  env: EnvRecord,
  repos: Repositories,
  authorizationHeader: string | undefined,
): Promise<AuthenticatedSession | null> {
  const token = bearerToken(authorizationHeader);
  if (!token) return null;
  const config = jwtConfig(env);
  let jwks = jwksByUrl.get(config.jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.jwksUrl));
    jwksByUrl.set(config.jwksUrl, jwks);
  }

  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256', 'ES256'],
    }));
  } catch {
    return null;
  }
  if (!claims.sub || typeof claims.email !== 'string') return null;

  const user = await repos.users.upsertFromAuth({
    id: claims.sub,
    primaryEmail: claims.email,
    displayName: displayNameFromClaims(claims, claims.email),
  });
  return {
    sessionId: typeof claims.session_id === 'string' ? claims.session_id : claims.sub,
    userId: user.id,
    user: { id: user.id, primaryEmail: user.primaryEmail, displayName: user.displayName },
    claims,
  };
}

export function requireKpnAuthConfig(env: EnvRecord): void {
  if (!readEnv(env, 'SUPABASE_URL') || !readEnv(env, 'SUPABASE_PUBLISHABLE_KEY')) {
    throw ApiError.setupRequired('KpnAuth Supabase URL and publishable key');
  }
}

export function authDiscovery(env: EnvRecord) {
  requireKpnAuthConfig(env);
  const base = requireEnv(env, 'SUPABASE_URL').replace(/\/+$/, '');
  return {
    issuer: readEnv(env, 'SUPABASE_JWT_ISSUER') ?? `${base}/auth/v1`,
    authorizationEndpoint: `${base}/auth/v1/oauth/authorize`,
    tokenEndpoint: `${base}/auth/v1/oauth/token`,
    jwksUri: readEnv(env, 'SUPABASE_JWKS_URL') ?? `${base}/auth/v1/.well-known/jwks.json`,
    discoveryEndpoint: `${base}/.well-known/oauth-authorization-server/auth/v1`,
  };
}

export function unauthenticated(): ApiError {
  return ApiError.unauthenticated('No valid KpnAuth bearer token was supplied.');
}
