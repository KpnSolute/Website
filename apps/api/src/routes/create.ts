import type { FastifyInstance } from 'fastify';
import { requestDb, requestRepos } from '../lib/context.js';
import { sendData } from '../lib/reply.js';
import { ApiError } from '../lib/errors.js';
import { createTenantBodySchema } from '../lib/schemas.js';
import { requireSession } from '../middleware/session.js';
import { createTenantWithOwner } from '../services/tenants.js';
import { requireActiveMembership } from '../services/authorization.js';
import { createPgRepositories } from '../repositories/pg/index.js';

export function registerCreateRoutes(app: FastifyInstance): void {
  app.get('/create/services', async (req, reply) => {
    const repos = requestRepos(req);
    const products = await repos.products.list();
    const withPlans = await Promise.all(
      products.map(async (product) => ({
        product,
        plans: await repos.productPlans.listForProduct(product.id),
      })),
    );
    sendData(reply, withPlans);
  });

  app.post('/create/tenants', async (req, reply) => {
    const session = await requireSession(req);
    const body = createTenantBodySchema.parse(req.body);
    const db = requestDb(req);
    const result = await db.transaction(async (tx) => {
      const repos = createPgRepositories(tx);
      const product = await repos.products.findByKey(body.serviceKey);
      if (!product) throw ApiError.validation(`Unknown service "${body.serviceKey}".`);
      const plan = await repos.productPlans.findByKey(product.id, body.planKey);
      if (!plan)
        throw ApiError.validation(`Unknown plan "${body.planKey}" for "${body.serviceKey}".`);

      const tenant = await createTenantWithOwner(tx, repos, {
        tenantClass: body.tenantClass,
        name: body.name,
        slug: body.slug,
        subdomain: body.subdomain ?? null,
        ownerUserId: session.userId,
      });
      const installation = await repos.installations.create({
        tenantId: tenant.id,
        productId: product.id,
        planId: plan.id,
        status: 'trial',
      });
      const ownerMembership = await repos.memberships.findActive(tenant.id, session.userId);
      if (!ownerMembership) throw new Error('Owner membership was not created.');
      const assignment = await repos.serviceControl.assignMember({
        installationId: installation.id,
        membershipId: ownerMembership.id,
        serviceRole: 'owner',
      });
      await repos.serviceControl.recordEvent({
        tenantId: tenant.id,
        installationId: installation.id,
        eventType: 'com.kpnsolute.platform.installation.created.v1',
        subject: `installation/${installation.id}`,
        data: {
          serviceKey: product.key,
          tenantSlug: tenant.slug,
          tenantClass: tenant.tenantClass,
          subdomain: tenant.subdomain,
          planKey: plan.key,
        },
      });
      await repos.audit.record({
        tenantId: tenant.id,
        actorUserId: session.userId,
        action: 'create.provision',
        targetType: 'product_installation',
        targetId: installation.id,
      });
      return { tenant, installation, assignment };
    });

    sendData(reply, result, 201);
  });

  app.get<{ Params: { tenantSlug: string } }>('/create/tenants/:tenantSlug', async (req, reply) => {
    const session = await requireSession(req);
    const repos = requestRepos(req);
    const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
    const installations = await repos.installations.listForTenant(context.tenant.id);
    sendData(reply, { tenant: context.tenant, installations });
  });
}
