import type { FastifyInstance } from 'fastify';
import { requestRepos } from '../lib/context.js';
import { sendData } from '../lib/reply.js';
import { ApiError } from '../lib/errors.js';
import { inviteMemberBodySchema, updateMemberBodySchema } from '../lib/schemas.js';
import { requireSession } from '../middleware/session.js';
import { requireActiveMembership, requireRole } from '../services/authorization.js';
import { platformOverviewForUser } from '../services/platform-overview.js';

export function registerPlatformRoutes(app: FastifyInstance): void {
  app.get('/platform/tenants', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    sendData(reply, await repos.tenants.listForUser(session.userId));
  });

  /**
   * Everything the Platform organization list needs in one authorized read:
   * the account's tenants, the products installed in each, and the references
   * to service-owned resources.
   */
  app.get('/platform/overview', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    sendData(reply, await platformOverviewForUser(repos, session.userId));
  });

  app.get<{ Params: { tenantSlug: string } }>(
    '/platform/tenants/:tenantSlug',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      sendData(reply, {
        tenant: context.tenant,
        role: context.role,
        membership: context.membership,
      });
    },
  );

  app.get<{ Params: { tenantSlug: string } }>(
    '/platform/tenants/:tenantSlug/members',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      const memberships = await repos.memberships.listByTenant(context.tenant.id);
      const enriched = await Promise.all(
        memberships.map(async (membership) => {
          const [user, role] = await Promise.all([
            repos.users.findById(membership.userId),
            repos.roles.findById(membership.roleId),
          ]);
          return { membership, user, role };
        }),
      );
      sendData(reply, enriched);
    },
  );

  app.post<{ Params: { tenantSlug: string } }>(
    '/platform/tenants/:tenantSlug/members/invite',
    async (req, reply) => {
      const session = await requireSession(req);
      const body = inviteMemberBodySchema.parse(req.body);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      requireRole(context, ['owner', 'admin']);
      const role = await repos.roles.findByKey(context.tenant.id, body.roleKey);
      if (!role)
        throw ApiError.notFound(`Role "${body.roleKey}" is not defined for this workspace.`);
      const invitation = await repos.invitations.create({
        tenantId: context.tenant.id,
        email: body.email,
        roleId: role.id,
        invitedByUserId: session.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      sendData(reply, invitation, 201);
    },
  );

  app.patch<{ Params: { tenantSlug: string; membershipId: string } }>(
    '/platform/tenants/:tenantSlug/members/:membershipId',
    async (req, reply) => {
      const session = await requireSession(req);
      const body = updateMemberBodySchema.parse(req.body);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      requireRole(context, ['owner', 'admin']);

      let membership = null;
      if (body.roleKey) {
        const role = await repos.roles.findByKey(context.tenant.id, body.roleKey);
        if (!role)
          throw ApiError.notFound(`Role "${body.roleKey}" is not defined for this workspace.`);
        membership = await repos.memberships.updateRole(req.params.membershipId, role.id);
      }
      if (body.status) {
        membership = await repos.memberships.updateStatus(req.params.membershipId, body.status);
      }
      sendData(reply, membership);
    },
  );

  app.delete<{ Params: { tenantSlug: string; membershipId: string } }>(
    '/platform/tenants/:tenantSlug/members/:membershipId',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      requireRole(context, ['owner', 'admin']);
      await repos.memberships.remove(req.params.membershipId);
      sendData(reply, { removed: true });
    },
  );

  app.get<{ Params: { tenantSlug: string } }>(
    '/platform/tenants/:tenantSlug/installations',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      sendData(reply, await repos.installations.listForTenant(context.tenant.id));
    },
  );

  app.get<{ Params: { tenantSlug: string; installationId: string } }>(
    '/platform/tenants/:tenantSlug/installations/:installationId/entitlements',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      const installation = await repos.installations.findById(req.params.installationId);
      if (!installation || installation.tenantId !== context.tenant.id) {
        throw ApiError.notFound('Installation not found for this workspace.');
      }
      sendData(reply, await repos.installations.listEntitlements(installation.id));
    },
  );

  app.get<{ Params: { tenantSlug: string; installationId: string } }>(
    '/platform/tenants/:tenantSlug/installations/:installationId/control-plane',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      const installation = await repos.installations.findById(req.params.installationId);
      if (!installation || installation.tenantId !== context.tenant.id) {
        throw ApiError.notFound('Installation not found for this workspace.');
      }
      const [assignments, resources, entitlements] = await Promise.all([
        repos.serviceControl.listAssignments(installation.id),
        repos.serviceControl.listResources(installation.id),
        repos.installations.listEntitlements(installation.id),
      ]);
      sendData(reply, { installation, assignments, resources, entitlements });
    },
  );

  app.get<{ Params: { tenantSlug: string } }>(
    '/platform/tenants/:tenantSlug/billing-summary',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      const [subscriptions, invoices] = await Promise.all([
        repos.subscriptions.listForTenant(context.tenant.id),
        repos.invoices.listForTenant(context.tenant.id),
      ]);
      sendData(reply, { subscriptions, invoiceCount: invoices.length });
    },
  );
}
