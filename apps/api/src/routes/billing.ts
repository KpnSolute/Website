import type { FastifyInstance } from 'fastify';
import { requestEnv, requestRepos } from '../lib/context.js';
import { sendData } from '../lib/reply.js';
import { ApiError } from '../lib/errors.js';
import { checkoutBodySchema } from '../lib/schemas.js';
import { requireSession } from '../middleware/session.js';
import { requireActiveMembership, requireRole } from '../services/authorization.js';
import { createCheckoutSession, getStripeClient } from '../services/billing.js';

export function registerBillingRoutes(app: FastifyInstance): void {
  app.get<{ Params: { tenantSlug: string } }>(
    '/billing/tenants/:tenantSlug/subscriptions',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      sendData(reply, await repos.subscriptions.listForTenant(context.tenant.id));
    },
  );

  app.get<{ Params: { tenantSlug: string } }>(
    '/billing/tenants/:tenantSlug/invoices',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      sendData(reply, await repos.invoices.listForTenant(context.tenant.id));
    },
  );

  app.get<{ Params: { tenantSlug: string } }>(
    '/billing/tenants/:tenantSlug/payment-methods',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      sendData(reply, await repos.paymentMethods.listForTenant(context.tenant.id));
    },
  );

  app.get<{ Params: { tenantSlug: string } }>(
    '/billing/tenants/:tenantSlug/usage',
    async (req, reply) => {
      const session = await requireSession(req);
      const repos = requestRepos(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      sendData(reply, await repos.usage.listForTenant(context.tenant.id));
    },
  );

  app.post<{ Params: { tenantSlug: string } }>(
    '/billing/tenants/:tenantSlug/checkout',
    async (req, reply) => {
      const session = await requireSession(req);
      const body = checkoutBodySchema.parse(req.body);
      const repos = requestRepos(req);
      const env = requestEnv(req);
      const context = await requireActiveMembership(repos, req.params.tenantSlug, session.userId);
      requireRole(context, ['owner', 'admin']);

      const plan = await repos.productPlans.findById(body.planId);
      if (!plan) throw ApiError.validation(`Unknown plan "${body.planId}".`);

      const user = await repos.users.findById(session.userId);
      if (!user) throw ApiError.notFound('Account not found.');

      const appOrigin = env.BILLING_APP_ORIGIN ?? `${req.protocol}://${req.hostname}`;
      const result = await createCheckoutSession(env, {
        tenantId: context.tenant.id,
        tenantSlug: context.tenant.slug,
        planName: plan.name,
        priceId: plan.key,
        successUrl: `${appOrigin}${body.successPath}`,
        cancelUrl: `${appOrigin}${body.cancelPath}`,
        customerEmail: user.primaryEmail,
      });
      sendData(reply, result);
    },
  );

  app.get<{ Querystring: { session_id?: string } }>(
    '/billing/checkout/confirmation',
    async (req, reply) => {
      const env = requestEnv(req);
      const sessionId = req.query.session_id;
      if (!sessionId) throw ApiError.validation('Missing session_id.');
      const stripe = getStripeClient(env);
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
      sendData(reply, {
        status: checkoutSession.status,
        paymentStatus: checkoutSession.payment_status,
      });
    },
  );
}
