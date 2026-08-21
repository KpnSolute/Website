import type { FastifyInstance } from 'fastify';
import { requestRepos } from '../lib/context.js';
import { sendData } from '../lib/reply.js';
import { ApiError } from '../lib/errors.js';
import {
  claimUsernameBodySchema,
  updateProfileBodySchema,
  usernameAvailabilityQuerySchema,
} from '../lib/schemas.js';
import { requireSession } from '../middleware/session.js';
import { checkUsernameAvailability, claimAccountUsername } from '../services/account-username.js';

export function registerAccountsRoutes(app: FastifyInstance): void {
  app.get('/accounts/me', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    const user = await repos.users.findById(session.userId);
    if (!user) throw ApiError.notFound('Account not found.');
    sendData(reply, user);
  });

  /**
   * Availability is deliberately behind a session: an unauthenticated oracle
   * over every KpnSolute username is an enumeration surface, and the only
   * caller is a signed-in person finishing their own enrollment.
   */
  app.get('/accounts/username-availability', async (req, reply) => {
    await requireSession(req);
    reply.header('cache-control', 'no-store');
    const query = usernameAvailabilityQuerySchema.parse(req.query);
    sendData(reply, await checkUsernameAvailability(requestRepos(req), query.username));
  });

  app.post('/accounts/username', async (req, reply) => {
    const session = await requireSession(req);
    reply.header('cache-control', 'no-store');
    const body = claimUsernameBodySchema.parse(req.body);
    // Keyed by the token subject, never by anything in the request body: the
    // username is presentation only and can never move an account.
    const result = await claimAccountUsername(requestRepos(req), session.userId, body.username);
    sendData(reply, result.user, result.changed ? 201 : 200);
  });

  app.patch('/accounts/me', async (req, reply) => {
    const session = await requireSession(req);
    const body = updateProfileBodySchema.parse(req.body);
    const repos = requestRepos(req);
    const user = await repos.users.update(session.userId, { displayName: body.displayName });
    sendData(reply, user);
  });

  app.get('/accounts/security', async (req, reply) => {
    const session = await requireSession(req);
    const provider =
      typeof session.claims.app_metadata === 'object'
        ? String((session.claims.app_metadata as Record<string, unknown>).provider ?? 'kpn_auth')
        : 'kpn_auth';
    sendData(reply, {
      identities: [
        { provider, createdAt: new Date(Number(session.claims.iat ?? 0) * 1000).toISOString() },
      ],
      sessions: [
        {
          id: session.sessionId,
          userId: session.userId,
          createdAt: new Date(Number(session.claims.iat ?? 0) * 1000).toISOString(),
          expiresAt: new Date(Number(session.claims.exp ?? 0) * 1000).toISOString(),
          lastSeenAt: new Date().toISOString(),
          userAgent: req.headers['user-agent'] ?? null,
          ipAddress: null,
          revokedAt: null,
        },
      ],
    });
  });

  app.get('/accounts/sessions', async (req, reply) => {
    const session = await requireSession(req);
    sendData(reply, [
      {
        id: session.sessionId,
        userId: session.userId,
        createdAt: new Date(Number(session.claims.iat ?? 0) * 1000).toISOString(),
        expiresAt: new Date(Number(session.claims.exp ?? 0) * 1000).toISOString(),
        lastSeenAt: new Date().toISOString(),
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: null,
        revokedAt: null,
      },
    ]);
  });

  app.delete<{ Params: { id: string } }>('/accounts/sessions/:id', async (req, reply) => {
    const session = await requireSession(req);
    if (req.params.id !== session.sessionId) throw ApiError.notFound('Session not found.');
    sendData(reply, { revoked: false, clientActionRequired: true });
  });

  app.get('/accounts/linked-apps', async (req, reply) => {
    const session = await requireSession(req);
    sendData(reply, {
      capability: 'managed_by_kpnauth',
      authorizationServer: 'Supabase Auth OAuth 2.1',
      currentSessionId: session.sessionId,
    });
  });

  app.get('/accounts/organizations', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    const tenants = await repos.tenants.listForUser(session.userId);
    sendData(
      reply,
      tenants.filter((tenant) => tenant.type !== 'personal'),
    );
  });

  app.get('/accounts/invitations', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    const user = await repos.users.findById(session.userId);
    if (!user) throw ApiError.notFound('Account not found.');
    sendData(reply, await repos.invitations.listForEmail(user.primaryEmail));
  });

  app.post<{ Params: { id: string } }>('/accounts/invitations/:id/accept', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    const invitation = await repos.invitations.findById(req.params.id);
    const user = await repos.users.findById(session.userId);
    if (!invitation || !user || invitation.email !== user.primaryEmail) {
      throw ApiError.notFound('Invitation not found.');
    }
    if (invitation.status !== 'pending') {
      throw ApiError.conflict('This invitation is no longer pending.');
    }
    await repos.memberships.create({
      tenantId: invitation.tenantId,
      userId: user.id,
      roleId: invitation.roleId,
      status: 'active',
    });
    await repos.invitations.markAccepted(invitation.id);
    sendData(reply, { accepted: true });
  });

  app.post<{ Params: { id: string } }>('/accounts/invitations/:id/decline', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    const invitation = await repos.invitations.findById(req.params.id);
    const user = await repos.users.findById(session.userId);
    if (!invitation || !user || invitation.email !== user.primaryEmail) {
      throw ApiError.notFound('Invitation not found.');
    }
    await repos.invitations.markDeclined(invitation.id);
    sendData(reply, { declined: true });
  });

  app.get('/accounts/subscriptions', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    const tenants = await repos.tenants.listForUser(session.userId);
    const subscriptions = (
      await Promise.all(tenants.map((tenant) => repos.subscriptions.listForTenant(tenant.id)))
    ).flat();
    sendData(reply, subscriptions);
  });

  app.get('/accounts/privacy', async (_req, reply) => {
    sendData(reply, {
      dataExport: { capability: 'not_available', label: 'Data export is not implemented yet.' },
      accountDeletion: {
        capability: 'not_available',
        label: 'Self-service deletion is not implemented yet.',
      },
    });
  });
}
