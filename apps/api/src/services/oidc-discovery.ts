import type { EnvRecord } from '@kpn/config';
import { readEnv } from '@kpn/config';
import { kpnAuthSigner } from './workforce-auth.js';

/**
 * OpenID Provider metadata for KpnAuth consumer sign-in.
 *
 * The issuer is the KpnAuth signing issuer (WORKFORCE_JWT_ISSUER, default
 * https://auth.kpnsolute.com). Endpoints live on the platform API origin
 * (KPNAUTH_API_BASE, default https://api.kpnsolute.com) under /auth, and the
 * person-facing approval page lives on the sign-in host (KPNAUTH_SIGNIN_URL).
 * Tokens: authorization code + PKCE S256 for public clients, ES256 ID tokens.
 */
export async function openIdConfiguration(env: EnvRecord) {
  const signer = await kpnAuthSigner(env);
  const api = (readEnv(env, 'KPNAUTH_API_BASE') ?? 'https://api.kpnsolute.com').replace(/\/+$/, '');
  const signIn =
    readEnv(env, 'KPNAUTH_SIGNIN_URL') ?? `${signer.issuer.replace(/\/+$/, '')}/authorize`;
  return {
    issuer: signer.issuer,
    authorization_endpoint: signIn,
    token_endpoint: `${api}/auth/oauth/token`,
    revocation_endpoint: `${api}/auth/oauth/revoke`,
    jwks_uri: `${api}/auth/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [signer.algorithm],
    scopes_supported: ['openid', 'email', 'profile'],
    claims_supported: [
      'iss',
      'sub',
      'aud',
      'exp',
      'iat',
      'nonce',
      'email',
      'email_verified',
      'name',
      'picture',
    ],
  };
}
