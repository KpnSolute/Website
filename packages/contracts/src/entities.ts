/**
 * Canonical shared-platform entity shapes.
 * Source: architecture/kpnsolute-unified-platform.md "Canonical entities".
 */

import type { AccountSetupState } from './accounts';
import type { WorkforceServiceKey } from './registry';

export type Id = string;
export type IsoDateTime = string;

export type UserStatus = 'active' | 'suspended' | 'deleted';

export interface User {
  id: Id;
  primaryEmail: string;
  displayName: string;
  /**
   * The globally unique, case-insensitive KpnSolute username (ADR-0007).
   * Null until the person completes enrollment; presentation and discovery
   * only, never an authorization key. Added by migration 0010.
   */
  username: string | null;
  /** Derived from `username`; decides whether to show "finish account setup". */
  accountSetupState: AccountSetupState;
  status: UserStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type AuthIdentityProvider = 'password' | 'google' | 'passkey';

export interface AuthIdentity {
  id: Id;
  userId: Id;
  provider: AuthIdentityProvider;
  providerSubject: string;
  createdAt: IsoDateTime;
}

export interface UserSession {
  id: Id;
  userId: Id;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
  lastSeenAt: IsoDateTime;
  userAgent: string | null;
  ipAddress: string | null;
  revokedAt: IsoDateTime | null;
}

// 'corporation' is a commercial tenant class with dedicated subdomain routing
// (docs/ROUTE_REGISTRY.md section 3.0). Added by migration 0008.
export type TenantType = 'personal' | 'organization' | 'school' | 'team' | 'corporation';
export type TenantStatus = 'active' | 'suspended' | 'deleted';

export interface Tenant {
  id: Id;
  type: TenantType;
  name: string;
  slug: string;
  status: TenantStatus;
  /**
   * How this tenant is addressed. Derived from `type`, surfaced explicitly so
   * clients never re-derive it. See packages/contracts/src/tenancy.ts.
   */
  tenantClass: 'organization' | 'corporation';
  /** Corporate tenants only. */
  subdomain: string | null;
  /** Corporate tenants only; takes precedence over `subdomain`. */
  customDomain: string | null;
  createdByUserId: Id;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type MembershipStatus = 'active' | 'invited' | 'suspended' | 'removed';

export interface TenantMembership {
  id: Id;
  tenantId: Id;
  userId: Id;
  roleId: Id;
  status: MembershipStatus;
  joinedAt: IsoDateTime;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface TenantInvitation {
  id: Id;
  tenantId: Id;
  email: string;
  roleId: Id;
  status: InvitationStatus;
  invitedByUserId: Id;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime;
}

export interface Role {
  id: Id;
  tenantId: Id | null;
  key: string;
  name: string;
  isBuiltIn: boolean;
}

export interface Permission {
  id: Id;
  key: string;
  description: string;
}

export interface Product {
  id: Id;
  key: string;
  name: string;
}

export interface ProductPlan {
  id: Id;
  productId: Id;
  key: string;
  name: string;
}

export type InstallationStatus = 'active' | 'trial' | 'suspended' | 'canceled';

export interface ProductInstallation {
  id: Id;
  tenantId: Id;
  productId: Id;
  planId: Id;
  status: InstallationStatus;
  settings: Record<string, unknown>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface InstallationEntitlement {
  id: Id;
  installationId: Id;
  key: string;
  limitValue: number | null;
  booleanValue: boolean | null;
}

export interface InstallationAssignment {
  id: Id;
  installationId: Id;
  membershipId: Id;
  serviceRole: string;
  status: 'active' | 'suspended' | 'removed';
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ServiceIdentityLink {
  id: Id;
  installationId: Id;
  userId: Id;
  provider: string;
  serviceSubject: string;
  status: 'active' | 'superseded' | 'revoked';
  linkedAt: IsoDateTime;
  lastVerifiedAt: IsoDateTime | null;
}

/** A discoverable pointer to service-owned data, never a copy of its payload. */
export interface ServiceResourceReference {
  id: Id;
  installationId: Id;
  resourceType: string;
  serviceResourceId: string;
  displayName: string | null;
  status: 'active' | 'archived' | 'deleted';
  metadata: Record<string, unknown>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * The Platform organization-surface projection: one tenant, the products
 * installed in it, and the discoverable pointers to service-owned resources.
 * Returned by `GET /platform/overview`; resource payloads stay in the owning
 * product database (docs/DATA_OWNERSHIP.md).
 */
export interface InstalledProductView {
  installation: ProductInstallation;
  productKey: string;
  productName: string;
  planKey: string;
  planName: string;
  resources: ServiceResourceReference[];
}

export interface TenantOverview {
  tenant: Tenant;
  installedProducts: InstalledProductView[];
}

export interface ControlPlaneEvent {
  id: Id;
  tenantId: Id | null;
  installationId: Id | null;
  eventType: string;
  source: string;
  subject: string;
  data: Record<string, unknown>;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  attemptCount: number;
  availableAt: IsoDateTime;
  occurredAt: IsoDateTime;
  publishedAt: IsoDateTime | null;
  lastError: string | null;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export interface Subscription {
  id: Id;
  tenantId: Id;
  installationId: Id;
  planId: Id;
  status: SubscriptionStatus;
  currentPeriodStart: IsoDateTime;
  currentPeriodEnd: IsoDateTime;
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
}

export interface Invoice {
  id: Id;
  tenantId: Id;
  subscriptionId: Id | null;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amountDueCents: number;
  currency: string;
  issuedAt: IsoDateTime | null;
  dueAt: IsoDateTime | null;
  paidAt: IsoDateTime | null;
  hostedInvoiceUrl: string | null;
}

export interface PaymentMethod {
  id: Id;
  tenantId: Id;
  type: 'card' | 'bank_account';
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

export interface UsageRecord {
  id: Id;
  tenantId: Id;
  installationId: Id;
  metricKey: string;
  quantity: number;
  recordedAt: IsoDateTime;
}

export interface ApiKeySummary {
  id: Id;
  tenantId: Id;
  name: string;
  prefix: string;
  createdAt: IsoDateTime;
  lastUsedAt: IsoDateTime | null;
  revokedAt: IsoDateTime | null;
}

export interface WebhookSubscription {
  id: Id;
  tenantId: Id;
  url: string;
  eventTypes: string[];
  status: 'active' | 'disabled';
  createdAt: IsoDateTime;
}

export interface WebhookDelivery {
  id: Id;
  webhookId: Id;
  eventType: string;
  status: 'pending' | 'succeeded' | 'failed';
  attempt: number;
  responseStatus: number | null;
  createdAt: IsoDateTime;
}

export interface Notification {
  id: Id;
  userId: Id;
  title: string;
  body: string;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface AuditEvent {
  id: Id;
  tenantId: Id | null;
  actorUserId: Id | null;
  action: string;
  targetType: string | null;
  targetId: Id | null;
  metadata: Record<string, unknown>;
  createdAt: IsoDateTime;
}

export type DomainVerificationStatus = 'pending' | 'verified' | 'failed';

export interface CustomDomain {
  id: Id;
  tenantId: Id;
  installationId: Id;
  hostname: string;
  verificationStatus: DomainVerificationStatus;
  verificationToken: string;
  certificateStatus: 'pending' | 'issued' | 'failed';
  createdAt: IsoDateTime;
}

/** Short-lived, one-time authorization-code SSO exchange record (KpnAuth). */
export interface AuthorizationCode {
  id: Id;
  codeHash: string;
  userId: Id;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  state: string;
  nonce: string;
  scope: string;
  expiresAt: IsoDateTime;
  consumedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

/** Registered SSO client (product) permitted to use KpnAuth. */
export interface OAuthClient {
  id: Id;
  clientId: string;
  serviceKey: string;
  name: string;
  redirectUriAllowlist: string[];
}

export type WorkforceAuthMethod = 'pin';
export type WorkforceStaffStatus = 'active' | 'suspended' | 'deactivated';

/** Tenant-owned staff identity. Credential material is never part of this contract. */
export interface WorkforceStaffAccount {
  id: Id;
  tenantId: Id;
  linkedUserId: Id | null;
  username: string;
  displayName: string;
  employeeCode: string | null;
  status: WorkforceStaffStatus;
  lastAuthenticatedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TenantWorkforceAuthPolicy {
  tenantId: Id;
  pinEnabled: boolean;
  minimumPinLength: number;
  maximumFailedAttempts: number;
  lockoutSeconds: number;
  sessionTtlSeconds: number;
  requirePinRotationForWeakCredentials: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface WorkforceInstallationAssignment {
  id: Id;
  tenantId: Id;
  staffAccountId: Id;
  installationId: Id;
  serviceRole: string;
  status: 'active' | 'suspended' | 'removed';
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface WorkforceLegacyIdentityLink {
  id: Id;
  tenantId: Id;
  staffAccountId: Id;
  installationId: Id;
  provider: string;
  legacySubject: string;
  status: 'active' | 'superseded' | 'revoked';
  linkedAt: IsoDateTime;
  lastVerifiedAt: IsoDateTime | null;
}

export interface WorkforceAuthMethodDiscovery {
  tenantSlug: string;
  serviceKey: WorkforceServiceKey;
  methods: WorkforceAuthMethod[];
}

export interface WorkforceStaffSession {
  id: Id;
  tokenJti: Id;
  tenantId: Id;
  staffAccountId: Id;
  installationId: Id;
  serviceKey: WorkforceServiceKey;
  serviceRole: string;
  issuedAt: IsoDateTime;
  expiresAt: IsoDateTime;
  revokedAt: IsoDateTime | null;
}

/** Claims carried by a short-lived workforce token; current DB state still governs access. */
export interface WorkforceTokenClaims {
  tokenUse: 'workforce';
  sub: Id;
  tenantId: Id;
  installationId: Id;
  sessionId: Id;
  serviceKey: WorkforceServiceKey;
  serviceRole: string;
  mustRotateCredential: boolean;
}
