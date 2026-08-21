import type {
  InstallationAssignment,
  Invoice,
  PaymentMethod,
  Product,
  ProductInstallation,
  ProductPlan,
  Subscription,
  Tenant,
  TenantClass,
  TenantInvitation,
  TenantMembership,
  TenantOverview,
  UsageRecord,
  User,
  UserSession,
} from '@kpn/contracts';
import type { ApiClient } from './http';

export interface ConfigState {
  database: 'configured' | 'missing';
  kpnAuth: 'configured' | 'missing';
  stripe: 'configured' | 'missing';
}

export interface UsernameAvailability {
  requested: string;
  normalized: string;
  available: boolean;
  reason: string | null;
}

export function createAccountsClient(api: ApiClient) {
  return {
    me: () => api.get<User>('accounts', 'me'),
    updateMe: (patch: { displayName: string }) => api.patch<User>('accounts', 'me', patch),
    usernameAvailability: (username: string) =>
      api.get<UsernameAvailability>(
        'accounts',
        `username-availability?username=${encodeURIComponent(username)}`,
      ),
    /** Claims the signed-in account's KpnSolute username. Idempotent for the same value. */
    claimUsername: (username: string) => api.post<User>('accounts', 'username', { username }),
    security: () =>
      api.get<{ identities: { provider: string; createdAt: string }[]; sessions: UserSession[] }>(
        'accounts',
        'security',
      ),
    sessions: () => api.get<UserSession[]>('accounts', 'sessions'),
    revokeSession: (id: string) => api.delete<{ revoked: boolean }>('accounts', `sessions/${id}`),
    linkedApps: () =>
      api.get<{ clientId: string; name: string; serviceKey: string }[]>('accounts', 'linked-apps'),
    organizations: () => api.get<Tenant[]>('accounts', 'organizations'),
    invitations: () => api.get<TenantInvitation[]>('accounts', 'invitations'),
    acceptInvitation: (id: string) =>
      api.post<{ accepted: boolean }>('accounts', `invitations/${id}/accept`),
    declineInvitation: (id: string) =>
      api.post<{ declined: boolean }>('accounts', `invitations/${id}/decline`),
    subscriptions: () => api.get<Subscription[]>('accounts', 'subscriptions'),
    privacy: () =>
      api.get<{
        dataExport: { capability: string; label: string };
        accountDeletion: { capability: string; label: string };
      }>('accounts', 'privacy'),
  };
}

export function createPlatformClient(api: ApiClient) {
  return {
    tenants: () => api.get<Tenant[]>('platform', 'tenants'),
    /** Tenants plus their installed products and service-resource references. */
    overview: () => api.get<TenantOverview[]>('platform', 'overview'),
    tenant: (slug: string) =>
      api.get<{
        tenant: Tenant;
        role: { key: string; name: string };
        membership: TenantMembership;
      }>('platform', `tenants/${slug}`),
    members: (slug: string) =>
      api.get<
        {
          membership: TenantMembership;
          user: User | null;
          role: { key: string; name: string } | null;
        }[]
      >('platform', `tenants/${slug}/members`),
    inviteMember: (slug: string, input: { email: string; roleKey: 'owner' | 'admin' | 'member' }) =>
      api.post<TenantInvitation>('platform', `tenants/${slug}/members/invite`, input),
    updateMember: (
      slug: string,
      membershipId: string,
      patch: {
        roleKey?: 'owner' | 'admin' | 'member';
        status?: 'active' | 'suspended' | 'removed';
      },
    ) => api.patch<TenantMembership>('platform', `tenants/${slug}/members/${membershipId}`, patch),
    removeMember: (slug: string, membershipId: string) =>
      api.delete<{ removed: boolean }>('platform', `tenants/${slug}/members/${membershipId}`),
    installations: (slug: string) =>
      api.get<ProductInstallation[]>('platform', `tenants/${slug}/installations`),
    entitlements: (slug: string, installationId: string) =>
      api.get('platform', `tenants/${slug}/installations/${installationId}/entitlements`),
    billingSummary: (slug: string) =>
      api.get<{ subscriptions: Subscription[]; invoiceCount: number }>(
        'platform',
        `tenants/${slug}/billing-summary`,
      ),
  };
}

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  serviceKey: string;
  planKey: string;
  /** Standard organizations stay slug-addressed; corporations need a subdomain. */
  tenantClass?: TenantClass;
  subdomain?: string;
}

export function createCreateClient(api: ApiClient) {
  return {
    services: () => api.get<{ product: Product; plans: ProductPlan[] }[]>('create', 'services'),
    provision: (input: ProvisionTenantInput) =>
      api.post<{
        tenant: Tenant;
        installation: ProductInstallation;
        assignment: InstallationAssignment;
      }>('create', 'tenants', input),
    resume: (slug: string) =>
      api.get<{ tenant: Tenant; installations: ProductInstallation[] }>(
        'create',
        `tenants/${slug}`,
      ),
  };
}

export function createBillingClient(api: ApiClient) {
  return {
    subscriptions: (slug: string) =>
      api.get<Subscription[]>('billing', `tenants/${slug}/subscriptions`),
    invoices: (slug: string) => api.get<Invoice[]>('billing', `tenants/${slug}/invoices`),
    paymentMethods: (slug: string) =>
      api.get<PaymentMethod[]>('billing', `tenants/${slug}/payment-methods`),
    usage: (slug: string) => api.get<UsageRecord[]>('billing', `tenants/${slug}/usage`),
    checkout: (slug: string, input: { planId: string; successPath: string; cancelPath: string }) =>
      api.post<{ url: string }>('billing', `tenants/${slug}/checkout`, input),
    checkoutConfirmation: (sessionId: string) =>
      api.get<{ status: string; paymentStatus: string }>(
        'billing',
        `checkout/confirmation?session_id=${encodeURIComponent(sessionId)}`,
      ),
  };
}

export function createAuthClient(api: ApiClient) {
  return {
    configState: () => api.get<Pick<ConfigState, 'kpnAuth'>>('auth', 'config-state'),
    discovery: () =>
      api.get<{
        issuer: string;
        authorizationEndpoint: string;
        tokenEndpoint: string;
        jwksUri: string;
        discoveryEndpoint: string;
      }>('auth', 'discovery'),
    session: () => api.get<{ user: User }>('auth', 'session'),
    logout: () => api.post<{ signedOut: boolean; clientActionRequired: boolean }>('auth', 'logout'),
  };
}
