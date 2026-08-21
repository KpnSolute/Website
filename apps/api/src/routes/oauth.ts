import type { FastifyInstance } from 'fastify';
import { requestEnv, requestRepos } from '../lib/context.js';
import { sendData } from '../lib/reply.js';
import {
  authorizationRequestParamsSchema,
  refreshBodySchema,
  revokeBodySchema,
  tokenBodySchema,
  workforceAuthorizeBodySchema,
  workforceAuthorizePinBodySchema,
} from '../lib/schemas.js';
import {
  completeWorkforceAuthorization,
  createAuthorizationRequest,
  describeAuthorizationRequest,
  exchangeAuthorizationCode,
  refreshWorkforceTokens,
  revokeRefreshToken,
} from '../services/oauth.js';

/**
 * Authorization-code + PKCE endpoints.
 *
 * These live under `/auth/oauth` alongside every other auth internal. The
 * gateway preserves the `/auth` segment for services sharing the platform
 * origin, so each upstream path here is byte-for-byte the public path at
 * `https://api.kpnsolute.com/auth/oauth/...`.
 *
 * Every response here is `no-store`: these payloads carry codes and tokens and
 * must never be written to a shared cache.
 */
export function registerOAuthRoutes(app: FastifyInstance): void {
  app.post('/auth/oauth/authorize', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const body = workforceAuthorizeBodySchema.parse(req.body);
    const view = await createAuthorizationRequest(requestRepos(req).oauth, {
      clientId: body.clientId,
      redirectUri: body.redirectUri,
      responseType: body.responseType,
      codeChallenge: body.codeChallenge,
      codeChallengeMethod: body.codeChallengeMethod,
      state: body.state,
      nonce: body.nonce,
      scope: body.scope,
      service: body.service,
      tenantHint: body.tenantHint,
    });
    sendData(reply, view);
  });

  // Read-only context for rendering the sign-in host. Deliberately excludes
  // state, nonce, and the code challenge.
  app.get('/auth/oauth/authorize/:requestId', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const { requestId } = authorizationRequestParamsSchema.parse(req.params);
    sendData(reply, await describeAuthorizationRequest(requestRepos(req).oauth, requestId));
  });

  app.post('/auth/oauth/authorize/:requestId/workforce-pin', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const { requestId } = authorizationRequestParamsSchema.parse(req.params);
    const body = workforceAuthorizePinBodySchema.parse(req.body);
    const repos = requestRepos(req);
    const result = await completeWorkforceAuthorization(requestEnv(req), repos, {
      requestId,
      tenantSlug: body.tenantSlug,
      username: body.username,
      pin: body.pin,
      httpRequestId: req.id,
    });
    // The browser follows this itself; the API never issues a 302 here so the
    // sign-in host can show a rotation notice first when one is required.
    sendData(reply, result);
  });

  app.post('/auth/oauth/token', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const body = tokenBodySchema.parse(req.body);
    const repos = requestRepos(req);
    sendData(
      reply,
      await exchangeAuthorizationCode(requestEnv(req), repos, {
        code: body.code,
        codeVerifier: body.codeVerifier,
        clientId: body.clientId,
        redirectUri: body.redirectUri,
      }),
    );
  });

  app.post('/auth/oauth/refresh', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const body = refreshBodySchema.parse(req.body);
    const repos = requestRepos(req);
    sendData(
      reply,
      await refreshWorkforceTokens(requestEnv(req), repos, {
        refreshToken: body.refreshToken,
        clientId: body.clientId,
      }),
    );
  });

  app.post('/auth/oauth/revoke', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const body = revokeBodySchema.parse(req.body);
    await revokeRefreshToken(requestRepos(req), body.refreshToken);
    // Always 200: revocation must not disclose whether the token existed.
    sendData(reply, { revoked: true });
  });
}
