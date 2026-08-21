import type { EnvRecord } from '@kpn/config';
import { isWorkforceServiceKey, type WorkforceServiceKey } from '@kpn/contracts';
import type {
  OAuthAuthorizationRequestRecord,
  OAuthRepository,
  WorkforceAuthRepository,
} from '../repositories/types.js';
import { ApiError } from '../lib/errors.js';
import {
  authenticateWorkforcePin,
  issueWorkforceAccessToken,
  resolveWorkforceAccessToken,
} from './workforce-auth.js';
import {
  AUTHORIZATION_CODE_TTL_SECONDS,
  AUTHORIZATION_REQUEST_TTL_SECONDS,
  buildSuccessRedirect,
  expiryFromNow,
  generateOpaqueSecret,
  hashOpaqueSecret,
  inspectRedirectUri,
  isExpired,
  isRegisteredRedirectUri,
  isTokenUse,
  isValidCodeChallenge,
  isValidNonce,
  isValidState,
  verifyPkceS256,
} from './oauth-protocol.js';

/**
 * Authorization-code + PKCE orchestration for KpnAuth.
 *
 * Protocol rules and rationale live in docs/AUTH_FINAL_GUIDE.md. This module
 * enforces them; ./oauth-protocol.ts supplies the pure primitives.
 */

/** Refresh lifetime for a workforce shift. Access tokens stay far shorter. */
export const WORKFORCE_REFRESH_TTL_SECONDS = 12 * 60 * 60;

export interface CreateAuthorizationRequestInput {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  nonce: string;
  scope?: string;
  service?: string;
  tenantHint?: string;
}

export interface AuthorizationRequestView {
  requestId: string;
  clientName: string;
  serviceKey: WorkforceServiceKey | null;
  tenantHint: string | null;
  expiresAt: string;
}

/**
 * Validation order matters. Everything that could let an attacker choose where
 * the browser lands is checked before anything else, and a failure here is
 * never redirected — it is returned to the caller as an error.
 */
export async function createAuthorizationRequest(
  repository: OAuthRepository,
  input: CreateAuthorizationRequestInput,
): Promise<AuthorizationRequestView> {
  if (input.responseType !== 'code') {
    throw ApiError.validation('Only the authorization-code response type is supported.');
  }
  if (input.codeChallengeMethod !== 'S256') {
    throw ApiError.validation('Only the S256 PKCE challenge method is supported.');
  }
  if (!isValidCodeChallenge(input.codeChallenge)) {
    throw ApiError.validation('A valid S256 code challenge is required.');
  }
  if (!isValidState(input.state)) {
    throw ApiError.validation('A state value between 16 and 512 characters is required.');
  }
  if (!isValidNonce(input.nonce)) {
    throw ApiError.validation('A nonce between 16 and 512 characters is required.');
  }

  const client = await repository.findClientByClientId(input.clientId);
  // A missing and a suspended client produce the same response so that client
  // ids cannot be enumerated.
  if (!client || client.status !== 'active') {
    throw ApiError.unauthenticated('The sign-in request could not be started.');
  }

  const structural = inspectRedirectUri(input.redirectUri);
  if (structural) {
    throw ApiError.validation('The supplied redirect URI is not a permitted callback address.');
  }
  if (!isRegisteredRedirectUri(input.redirectUri, client.redirectUris)) {
    throw ApiError.validation('The supplied redirect URI is not registered for this client.');
  }

  const requestedTokenUse = input.service ? 'workforce' : 'consumer';
  if (!isTokenUse(requestedTokenUse) || !client.allowedTokenUses.includes(requestedTokenUse)) {
    throw ApiError.forbidden('This client may not request that kind of identity.');
  }

  let serviceKey: WorkforceServiceKey | null = null;
  if (input.service) {
    if (!isWorkforceServiceKey(input.service)) {
      throw ApiError.validation('An unknown service was requested.');
    }
    // A client registered for one product can never start a sign-in for another.
    if (client.serviceKey && client.serviceKey !== input.service) {
      throw ApiError.forbidden('This client may not sign in to that service.');
    }
    serviceKey = input.service;
  }

  const record = await repository.createAuthorizationRequest({
    clientId: client.id,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    state: input.state,
    nonce: input.nonce,
    scope: input.scope?.trim() ?? '',
    requestedTokenUse,
    serviceKey,
    tenantHint: input.tenantHint?.trim().toLowerCase() || null,
    expiresAt: expiryFromNow(AUTHORIZATION_REQUEST_TTL_SECONDS),
  });

  return {
    requestId: record.id,
    clientName: client.name,
    serviceKey,
    tenantHint: record.tenantHint,
    expiresAt: record.expiresAt,
  };
}

async function loadPendingRequest(
  repository: OAuthRepository,
  requestId: string,
): Promise<OAuthAuthorizationRequestRecord> {
  const request = await repository.findAuthorizationRequest(requestId);
  if (!request) throw ApiError.notFound('This sign-in request is no longer available.');
  if (request.status !== 'pending') {
    throw ApiError.conflict('This sign-in request has already been completed.');
  }
  if (isExpired(request.expiresAt)) {
    await repository.markAuthorizationRequest(request.id, 'expired');
    throw ApiError.conflict('This sign-in request has expired. Start again.');
  }
  return request;
}

/** Safe, non-secret view for rendering the sign-in host. Never exposes state or nonce. */
export async function describeAuthorizationRequest(
  repository: OAuthRepository,
  requestId: string,
): Promise<AuthorizationRequestView> {
  const request = await repository.findAuthorizationRequest(requestId);
  if (!request || request.status !== 'pending' || isExpired(request.expiresAt)) {
    throw ApiError.notFound('This sign-in request is no longer available.');
  }
  return {
    requestId: request.id,
    clientName: '',
    serviceKey: request.serviceKey,
    tenantHint: request.tenantHint,
    expiresAt: request.expiresAt,
  };
}

/**
 * Authenticate a staff member inside a pending authorization request and hand
 * back a redirect carrying a single-use code. No token is produced here.
 */
export async function completeWorkforceAuthorization(
  env: EnvRecord,
  repositories: { oauth: OAuthRepository; workforceAuth: WorkforceAuthRepository },
  input: {
    requestId: string;
    tenantSlug: string;
    username: string;
    pin: string;
    httpRequestId: string;
  },
): Promise<{ redirectTo: string; mustRotateCredential: boolean }> {
  const request = await loadPendingRequest(repositories.oauth, input.requestId);
  if (!request.serviceKey) {
    throw ApiError.validation('This sign-in request is not a workforce request.');
  }

  const principal = await authenticateWorkforcePin(env, repositories.workforceAuth, {
    tenantSlug: input.tenantSlug,
    serviceKey: request.serviceKey,
    username: input.username,
    pin: input.pin,
    requestId: input.httpRequestId,
  });

  const code = generateOpaqueSecret();
  await repositories.oauth.createAuthorizationCode({
    codeHash: hashOpaqueSecret(code),
    requestId: request.id,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    nonce: request.nonce,
    tokenUse: 'workforce',
    workforceSessionId: principal.session.id,
    tenantId: principal.tenantId,
    installationId: principal.installationId,
    expiresAt: expiryFromNow(AUTHORIZATION_CODE_TTL_SECONDS),
  });
  await repositories.oauth.markAuthorizationRequest(request.id, 'authorized');

  return {
    redirectTo: buildSuccessRedirect(request.redirectUri, code, request.state),
    mustRotateCredential: principal.mustRotateCredential,
  };
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  serviceKey: WorkforceServiceKey;
  tenantId: string;
  installationId: string;
  serviceRole: string;
  mustRotateCredential: boolean;
}

/**
 * Exchange a single-use code for tokens.
 *
 * The code is consumed before any other check, so a failed exchange burns the
 * code rather than leaving it available for another attempt.
 */
export async function exchangeAuthorizationCode(
  env: EnvRecord,
  repositories: { oauth: OAuthRepository; workforceAuth: WorkforceAuthRepository },
  input: { code: string; codeVerifier: string; clientId: string; redirectUri: string },
): Promise<TokenResponse> {
  const client = await repositories.oauth.findClientByClientId(input.clientId);
  if (!client || client.status !== 'active') {
    throw ApiError.unauthenticated('The token request could not be completed.');
  }

  const record = await repositories.oauth.consumeAuthorizationCode(
    hashOpaqueSecret(input.code),
    'exchanged',
  );
  if (!record) {
    throw ApiError.unauthenticated('This authorization code is not valid.');
  }
  if (record.clientId !== client.id) {
    throw ApiError.unauthenticated('This authorization code was issued to another client.');
  }
  if (isExpired(record.expiresAt)) {
    throw ApiError.unauthenticated('This authorization code has expired.');
  }
  // The redirect URI must be byte-identical to the one bound at authorization.
  if (record.redirectUri !== input.redirectUri) {
    throw ApiError.unauthenticated('The redirect URI does not match the authorization request.');
  }
  if (!verifyPkceS256(input.codeVerifier, record.codeChallenge)) {
    throw ApiError.unauthenticated('The PKCE verifier does not match the authorization request.');
  }
  if (record.tokenUse !== 'workforce' || !record.workforceSessionId) {
    throw ApiError.validation('Only workforce authorization codes can be exchanged today.');
  }

  const serviceKey = client.serviceKey;
  if (!serviceKey) {
    throw ApiError.validation('This client is not bound to a workforce service.');
  }

  // Re-read the session so a revocation between authorization and exchange is
  // honoured. Claims alone are never sufficient (guide section 4).
  const session = await repositories.oauth.findWorkforceSessionById(record.workforceSessionId);
  // The session must still belong to exactly the tenant, installation, and
  // service the code was bound to. A mismatch means the code was crafted.
  if (
    !session ||
    session.tenantId !== record.tenantId ||
    session.installationId !== record.installationId ||
    session.serviceKey !== serviceKey
  ) {
    throw ApiError.unauthenticated('The staff session is no longer active.');
  }

  const accessToken = await issueWorkforceAccessToken(env, session, false);
  const refreshToken = generateOpaqueSecret();
  const familyId = await repositories.oauth.createRefreshFamily({
    clientId: client.id,
    tokenUse: 'workforce',
    workforceSessionId: session.id,
    tenantId: session.tenantId,
    installationId: session.installationId,
  });
  await repositories.oauth.issueRefreshToken({
    familyId,
    tokenHash: hashOpaqueSecret(refreshToken),
    generation: 1,
    expiresAt: expiryFromNow(WORKFORCE_REFRESH_TTL_SECONDS),
  });

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: Math.max(1, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)),
    serviceKey,
    tenantId: session.tenantId,
    installationId: session.installationId,
    serviceRole: session.serviceRole,
    mustRotateCredential: false,
  };
}

/**
 * Rotate a refresh token.
 *
 * Presenting an already-consumed token means the token was captured, so the
 * entire family is revoked rather than just refusing the request.
 */
export async function refreshWorkforceTokens(
  env: EnvRecord,
  repositories: { oauth: OAuthRepository; workforceAuth: WorkforceAuthRepository },
  input: { refreshToken: string; clientId: string },
): Promise<TokenResponse> {
  const client = await repositories.oauth.findClientByClientId(input.clientId);
  if (!client || client.status !== 'active' || !client.serviceKey) {
    throw ApiError.unauthenticated('The refresh request could not be completed.');
  }

  const tokenHash = hashOpaqueSecret(input.refreshToken);
  const existing = await repositories.oauth.findRefreshToken(tokenHash);
  if (!existing) throw ApiError.unauthenticated('This refresh token is not valid.');

  if (existing.consumedAt) {
    // Reuse detection: assume compromise and end every session in the family.
    await repositories.oauth.revokeRefreshFamily(existing.familyId, 'refresh_token_reuse');
    if (existing.workforceSessionId) {
      await repositories.workforceAuth.revokeSession(
        existing.workforceSessionId,
        'refresh_token_reuse',
      );
    }
    throw ApiError.unauthenticated('This refresh token has already been used.');
  }
  if (existing.familyStatus !== 'active') {
    throw ApiError.unauthenticated('This refresh token has been revoked.');
  }
  if (isExpired(existing.expiresAt)) {
    throw ApiError.unauthenticated('This refresh token has expired.');
  }

  const consumed = await repositories.oauth.consumeRefreshToken(tokenHash);
  if (!consumed) throw ApiError.unauthenticated('This refresh token is not valid.');

  const session = existing.workforceSessionId
    ? await repositories.oauth.findWorkforceSessionById(existing.workforceSessionId)
    : null;
  if (!session || session.serviceKey !== client.serviceKey) {
    await repositories.oauth.revokeRefreshFamily(existing.familyId, 'session_inactive');
    throw ApiError.unauthenticated('The staff session is no longer active.');
  }

  const accessToken = await issueWorkforceAccessToken(env, session, false);
  const nextRefresh = generateOpaqueSecret();
  await repositories.oauth.issueRefreshToken({
    familyId: existing.familyId,
    tokenHash: hashOpaqueSecret(nextRefresh),
    generation: existing.generation + 1,
    expiresAt: expiryFromNow(WORKFORCE_REFRESH_TTL_SECONDS),
    replacesId: existing.id,
  });

  return {
    accessToken,
    refreshToken: nextRefresh,
    tokenType: 'Bearer',
    expiresIn: Math.max(1, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)),
    serviceKey: client.serviceKey,
    tenantId: session.tenantId,
    installationId: session.installationId,
    serviceRole: session.serviceRole,
    mustRotateCredential: false,
  };
}

/** Revoke a presented refresh token's whole family, plus its central session. */
export async function revokeRefreshToken(
  repositories: { oauth: OAuthRepository; workforceAuth: WorkforceAuthRepository },
  refreshToken: string,
): Promise<void> {
  const existing = await repositories.oauth.findRefreshToken(hashOpaqueSecret(refreshToken));
  // Revocation is idempotent and never reveals whether the token existed.
  if (!existing) return;
  await repositories.oauth.revokeRefreshFamily(existing.familyId, 'client_revocation');
  if (existing.workforceSessionId) {
    await repositories.workforceAuth.revokeSession(
      existing.workforceSessionId,
      'client_revocation',
    );
  }
}

export { resolveWorkforceAccessToken };
