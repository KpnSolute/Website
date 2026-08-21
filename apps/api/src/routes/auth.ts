import type { FastifyInstance } from 'fastify';
import { resolvePlatformConfigState } from '@kpn/config';
import { requestEnv, requestRepos } from '../lib/context.js';
import { sendData } from '../lib/reply.js';
import { requireSession } from '../middleware/session.js';
import { authDiscovery } from '../services/auth.js';
import {
  discoverWorkforceMethods,
  loginWithWorkforcePin,
  resolveWorkforceAccessToken,
  workforcePublicJwks,
} from '../services/workforce-auth.js';
import {
  workforceAuthRouteParamsSchema,
  workforcePinLoginBodySchema,
  workforceServiceRouteParamsSchema,
} from '../lib/schemas.js';
import { ApiError } from '../lib/errors.js';

/**
 * Consumer KpnAuth credentials, OAuth grants, and refresh sessions are owned by
 * Supabase Auth and are never duplicated here. Tenant workforce routes accept
 * an ephemeral staff PIN for verification and mint only short-lived,
 * installation-scoped workforce tokens backed by revocable central sessions.
 *
 * Every route in this file lives under `/auth`, including the workforce and
 * JWKS routes. `auth` shares one origin with accounts, platform, create, and
 * billing, so the gateway preserves the `/auth` segment rather than stripping
 * it: upstream `/auth/X` is exactly public `https://api.kpnsolute.com/auth/X`.
 */
export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/auth/.well-known/jwks.json', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=300, must-revalidate');
    reply.send(await workforcePublicJwks(requestEnv(req)));
  });

  app.get('/auth/config-state', async (req, reply) => {
    sendData(reply, resolvePlatformConfigState(requestEnv(req)));
  });

  app.get('/auth/discovery', async (req, reply) => {
    sendData(reply, authDiscovery(requestEnv(req)));
  });

  app.get('/auth/session', async (req, reply) => {
    const session = await requireSession(req);
    sendData(reply, { user: session.user });
  });

  app.post('/auth/logout', async (_req, reply) => {
    sendData(reply, {
      signedOut: false,
      clientActionRequired: true,
      message: 'Revoke the Supabase Auth session at the KpnAuth client, then clear local tokens.',
    });
  });

  app.get('/auth/workforce/:tenantSlug/:serviceKey/methods', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const params = workforceAuthRouteParamsSchema.parse(req.params);
    const methods = await discoverWorkforceMethods(
      requestRepos(req).workforceAuth,
      params.tenantSlug,
      params.serviceKey,
    );
    sendData(reply, methods);
  });

  app.post('/auth/workforce/:tenantSlug/:serviceKey/pin', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const params = workforceAuthRouteParamsSchema.parse(req.params);
    const body = workforcePinLoginBodySchema.parse(req.body);
    const result = await loginWithWorkforcePin(requestEnv(req), requestRepos(req).workforceAuth, {
      ...params,
      ...body,
      requestId: req.id,
    });
    sendData(reply, result);
  });

  app.get('/auth/workforce/:serviceKey/session', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const { serviceKey } = workforceServiceRouteParamsSchema.parse(req.params);
    const session = await resolveWorkforceAccessToken(
      requestEnv(req),
      requestRepos(req).workforceAuth,
      req.headers.authorization,
      serviceKey,
    );
    if (!session) throw ApiError.unauthenticated('No active workforce session was supplied.');
    sendData(reply, {
      tenantId: session.session.tenantId,
      staffAccountId: session.session.staffAccountId,
      installationId: session.session.installationId,
      serviceKey: session.session.serviceKey,
      serviceRole: session.session.serviceRole,
      expiresAt: session.session.expiresAt,
      mustRotateCredential: session.mustRotateCredential,
    });
  });

  app.post('/auth/workforce/:serviceKey/logout', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const { serviceKey } = workforceServiceRouteParamsSchema.parse(req.params);
    const repository = requestRepos(req).workforceAuth;
    const session = await resolveWorkforceAccessToken(
      requestEnv(req),
      repository,
      req.headers.authorization,
      serviceKey,
    );
    if (!session) throw ApiError.unauthenticated('No active workforce session was supplied.');
    await repository.revokeSession(session.session.id, 'staff_logout');
    sendData(reply, { signedOut: true });
  });
}
