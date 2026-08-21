import type { Db } from '../../db/pool.js';
import type { Repositories } from '../types.js';
import { createUserRepository } from './identity.js';
import {
  createInvitationRepository,
  createMembershipRepository,
  createRoleRepository,
  createTenantRepository,
} from './tenancy.js';
import {
  createInstallationRepository,
  createProductPlanRepository,
  createProductRepository,
} from './catalog.js';
import {
  createInvoiceRepository,
  createPaymentMethodRepository,
  createSubscriptionRepository,
  createUsageRepository,
} from './commerce.js';
import { createAuditRepository, createNotificationRepository } from './misc.js';
import { createServiceControlRepository } from './service-control.js';
import { createWorkforceAuthRepository } from './workforce-auth.js';
import { createOAuthRepository } from './oauth.js';

export function createPgRepositories(db: Db): Repositories {
  return {
    users: createUserRepository(db),
    tenants: createTenantRepository(db),
    roles: createRoleRepository(db),
    memberships: createMembershipRepository(db),
    invitations: createInvitationRepository(db),
    products: createProductRepository(db),
    productPlans: createProductPlanRepository(db),
    installations: createInstallationRepository(db),
    serviceControl: createServiceControlRepository(db),
    subscriptions: createSubscriptionRepository(db),
    invoices: createInvoiceRepository(db),
    paymentMethods: createPaymentMethodRepository(db),
    usage: createUsageRepository(db),
    notifications: createNotificationRepository(db),
    audit: createAuditRepository(db),
    workforceAuth: createWorkforceAuthRepository(db),
    oauth: createOAuthRepository(db),
  };
}
