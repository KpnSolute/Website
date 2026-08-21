import type {
  Id,
  ControlPlaneEvent,
  InstallationAssignment,
  InstallationEntitlement,
  InstallationStatus,
  Invoice,
  MembershipStatus,
  Notification,
  PaymentMethod,
  Product,
  ProductInstallation,
  ProductPlan,
  ServiceResourceReference,
  Role,
  Subscription,
  Tenant,
  TenantInvitation,
  TenantMembership,
  TenantType,
  UsageRecord,
  User,
  WorkforceServiceKey,
  TenantWorkforceAuthPolicy,
  WorkforceInstallationAssignment,
  WorkforceLegacyIdentityLink,
  WorkforceStaffAccount,
  WorkforceStaffSession,
} from '@kpn/contracts';

export interface NewUser {
  primaryEmail: string;
  displayName: string;
}

export interface UserRepository {
  upsertFromAuth(input: NewUser & { id: Id }): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: Id): Promise<User | null>;
  /**
   * Every account whose username normalises to this value. A unique index makes
   * more than one row impossible, so callers that receive two rows must refuse
   * the request rather than choose one.
   */
  listByUsername(username: string): Promise<User[]>;
  /**
   * Claims a username for an account that does not have one yet. Resolves to
   * null when the account already holds a username, so a claim can never
   * silently rename an existing identity.
   */
  claimUsername(id: Id, username: string): Promise<User | null>;
  update(id: Id, patch: Partial<Pick<User, 'displayName'>>): Promise<User>;
}

export interface NewTenant {
  type: TenantType;
  name: string;
  slug: string;
  /** Corporate tenants only; rejected for slug-addressed organizations. */
  subdomain?: string | null;
  createdByUserId: Id;
}

export interface TenantRepository {
  create(input: NewTenant): Promise<Tenant>;
  findBySlug(slug: string): Promise<Tenant | null>;
  findBySubdomain(subdomain: string): Promise<Tenant | null>;
  findById(id: Id): Promise<Tenant | null>;
  listForUser(userId: Id): Promise<Tenant[]>;
  slugTaken(slug: string): Promise<boolean>;
  subdomainTaken(subdomain: string): Promise<boolean>;
  /** Assigns the corporate runtime host. Used by provisioning and repair paths. */
  setSubdomain(id: Id, subdomain: string): Promise<Tenant>;
}

export interface RoleRepository {
  ensureBuiltInRoles(tenantId: Id): Promise<Record<'owner' | 'admin' | 'member', Role>>;
  findByKey(tenantId: Id, key: string): Promise<Role | null>;
  findById(id: Id): Promise<Role | null>;
}

export interface NewMembership {
  tenantId: Id;
  userId: Id;
  roleId: Id;
  status: MembershipStatus;
}

export interface MembershipRepository {
  create(input: NewMembership): Promise<TenantMembership>;
  findActive(tenantId: Id, userId: Id): Promise<TenantMembership | null>;
  /** Any membership regardless of status, so an upsert can reactivate one. */
  findAnyStatus(tenantId: Id, userId: Id): Promise<TenantMembership | null>;
  listByTenant(tenantId: Id): Promise<TenantMembership[]>;
  /** Active memberships holding a given role key. Used to detect existing owners. */
  listByTenantAndRoleKey(tenantId: Id, roleKey: string): Promise<TenantMembership[]>;
  updateRole(id: Id, roleId: Id): Promise<TenantMembership>;
  updateStatus(id: Id, status: MembershipStatus): Promise<TenantMembership>;
  remove(id: Id): Promise<void>;
}

export interface NewInvitation {
  tenantId: Id;
  email: string;
  roleId: Id;
  invitedByUserId: Id;
  expiresAt: string;
}

export interface InvitationRepository {
  create(input: NewInvitation): Promise<TenantInvitation>;
  listForEmail(email: string): Promise<TenantInvitation[]>;
  findById(id: Id): Promise<TenantInvitation | null>;
  markAccepted(id: Id): Promise<void>;
  markDeclined(id: Id): Promise<void>;
}

export interface ProductRepository {
  list(): Promise<Product[]>;
  findByKey(key: string): Promise<Product | null>;
}

export interface ProductPlanRepository {
  listForProduct(productId: Id): Promise<ProductPlan[]>;
  findByKey(productId: Id, key: string): Promise<ProductPlan | null>;
  findById(id: Id): Promise<ProductPlan | null>;
}

export interface NewInstallation {
  tenantId: Id;
  productId: Id;
  planId: Id;
  status: InstallationStatus;
}

/** An installation joined to its catalog rows, for portal surfaces. */
export interface InstalledProductSummary {
  installation: ProductInstallation;
  productKey: string;
  productName: string;
  planKey: string;
  planName: string;
}

export interface InstallationRepository {
  create(input: NewInstallation): Promise<ProductInstallation>;
  listForTenant(tenantId: Id): Promise<ProductInstallation[]>;
  findByTenantAndProduct(tenantId: Id, productId: Id): Promise<ProductInstallation | null>;
  /** One query for many tenants, so a portal overview never fans out per tenant. */
  listForTenantsWithCatalog(tenantIds: Id[]): Promise<InstalledProductSummary[]>;
  findById(id: Id): Promise<ProductInstallation | null>;
  listEntitlements(installationId: Id): Promise<InstallationEntitlement[]>;
}

export interface ServiceControlRepository {
  assignMember(input: {
    installationId: Id;
    membershipId: Id;
    serviceRole: string;
  }): Promise<InstallationAssignment>;
  listAssignments(installationId: Id): Promise<InstallationAssignment[]>;
  listResources(installationId: Id): Promise<ServiceResourceReference[]>;
  listResourcesForInstallations(installationIds: Id[]): Promise<ServiceResourceReference[]>;
  /**
   * Every reference to one service-owned resource, across installations. A
   * bootstrap must be able to see that a resource is already claimed by another
   * tenant and refuse rather than move it.
   */
  findResourceReferences(
    resourceType: string,
    serviceResourceId: string,
  ): Promise<ServiceResourceReference[]>;
  upsertResource(input: {
    installationId: Id;
    resourceType: string;
    serviceResourceId: string;
    displayName?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ServiceResourceReference>;
  recordEvent(input: {
    tenantId: Id | null;
    installationId: Id | null;
    eventType: string;
    subject: string;
    data?: Record<string, unknown>;
  }): Promise<ControlPlaneEvent>;
}

export interface SubscriptionRepository {
  listForTenant(tenantId: Id): Promise<Subscription[]>;
  create(input: Omit<Subscription, 'id'>): Promise<Subscription>;
}

export interface InvoiceRepository {
  listForTenant(tenantId: Id): Promise<Invoice[]>;
}

export interface PaymentMethodRepository {
  listForTenant(tenantId: Id): Promise<PaymentMethod[]>;
}

export interface UsageRepository {
  listForTenant(tenantId: Id): Promise<UsageRecord[]>;
}

export interface NotificationRepository {
  listForUser(userId: Id): Promise<Notification[]>;
}

export interface AuditRepository {
  record(input: {
    tenantId: Id | null;
    actorUserId: Id | null;
    action: string;
    targetType?: string | null;
    targetId?: Id | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface WorkforceAuthContext {
  tenantId: Id;
  tenantSlug: string;
  installationId: Id;
  serviceKey: WorkforceServiceKey;
  policy: TenantWorkforceAuthPolicy | null;
}

/** Internal-only credential record. Never return this shape from an API route. */
export interface WorkforcePinCredentialRecord {
  staff: WorkforceStaffAccount;
  assignment: WorkforceInstallationAssignment;
  credentialHash: string;
  mustRotate: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface WorkforceFailedAttemptResult {
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface WorkforceAuthRepository {
  resolveContext(
    tenantSlug: string,
    serviceKey: WorkforceServiceKey,
  ): Promise<WorkforceAuthContext | null>;
  resolvePinCredential(
    tenantId: Id,
    installationId: Id,
    normalizedUsername: string,
  ): Promise<WorkforcePinCredentialRecord | null>;
  recordFailedPinAttempt(input: {
    credential: WorkforcePinCredentialRecord;
    context: WorkforceAuthContext;
    maximumFailedAttempts: number;
    lockoutSeconds: number;
    requestId: string;
  }): Promise<WorkforceFailedAttemptResult>;
  completeSuccessfulPinLogin(input: {
    credential: WorkforcePinCredentialRecord;
    context: WorkforceAuthContext;
    expiresAt: string;
    requestId: string;
  }): Promise<WorkforceStaffSession>;
  recordRejectedAttempt(input: {
    tenantId: Id | null;
    installationId: Id | null;
    staffAccountId?: Id | null;
    outcome: 'failed' | 'blocked';
    reason: string;
    requestId: string;
  }): Promise<void>;
  findActiveSession(input: {
    sessionId: Id;
    tenantId: Id;
    installationId: Id;
    staffAccountId: Id;
    serviceKey: WorkforceServiceKey;
  }): Promise<WorkforceStaffSession | null>;
  revokeSession(sessionId: Id, reason: string): Promise<void>;
  upsertPolicy(
    policy: Omit<TenantWorkforceAuthPolicy, 'createdAt' | 'updatedAt'>,
  ): Promise<TenantWorkforceAuthPolicy>;
  upsertStaffAccount(input: {
    id?: Id;
    tenantId: Id;
    linkedUserId?: Id | null;
    username: string;
    displayName: string;
    employeeCode?: string | null;
    status?: WorkforceStaffAccount['status'];
  }): Promise<WorkforceStaffAccount>;
  upsertPinCredential(input: {
    staffAccountId: Id;
    credentialHash: string;
    mustRotate: boolean;
  }): Promise<void>;
  assignStaffToInstallation(input: {
    tenantId: Id;
    staffAccountId: Id;
    installationId: Id;
    serviceRole: string;
  }): Promise<WorkforceInstallationAssignment>;
  mapLegacyIdentity(input: {
    tenantId: Id;
    staffAccountId: Id;
    installationId: Id;
    provider: string;
    legacySubject: string;
  }): Promise<WorkforceLegacyIdentityLink>;
}

/** A registered relying party plus its exact-match redirect allowlist. */
export interface OAuthClientRecord {
  id: Id;
  clientId: string;
  name: string;
  serviceKey: WorkforceServiceKey | null;
  clientType: 'confidential' | 'public';
  allowedTokenUses: string[];
  status: 'active' | 'suspended' | 'retired';
  redirectUris: string[];
}

export interface OAuthAuthorizationRequestRecord {
  id: Id;
  clientId: Id;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  nonce: string;
  scope: string;
  requestedTokenUse: string;
  serviceKey: WorkforceServiceKey | null;
  tenantHint: string | null;
  status: 'pending' | 'authorized' | 'failed' | 'expired';
  expiresAt: string;
}

/** Returned only by an atomic consume. Never fetched without consuming. */
export interface OAuthAuthorizationCodeRecord {
  id: Id;
  requestId: Id;
  clientId: Id;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
  tokenUse: string;
  consumerUserId: Id | null;
  workforceSessionId: Id | null;
  tenantId: Id | null;
  installationId: Id | null;
  expiresAt: string;
  consumedAt: string | null;
}

export interface OAuthRefreshTokenRecord {
  id: Id;
  familyId: Id;
  generation: number;
  expiresAt: string;
  consumedAt: string | null;
  familyStatus: 'active' | 'revoked';
  tokenUse: string;
  workforceSessionId: Id | null;
  consumerUserId: Id | null;
  tenantId: Id | null;
  installationId: Id | null;
}

export interface OAuthRepository {
  findClientByClientId(clientId: string): Promise<OAuthClientRecord | null>;
  createAuthorizationRequest(input: {
    clientId: Id;
    redirectUri: string;
    codeChallenge: string;
    state: string;
    nonce: string;
    scope: string;
    requestedTokenUse: string;
    serviceKey: WorkforceServiceKey | null;
    tenantHint: string | null;
    expiresAt: string;
  }): Promise<OAuthAuthorizationRequestRecord>;
  findAuthorizationRequest(id: Id): Promise<OAuthAuthorizationRequestRecord | null>;
  markAuthorizationRequest(
    id: Id,
    status: 'authorized' | 'failed' | 'expired',
    failureReason?: string,
  ): Promise<void>;
  createAuthorizationCode(input: {
    codeHash: string;
    requestId: Id;
    clientId: Id;
    redirectUri: string;
    codeChallenge: string;
    nonce: string;
    tokenUse: string;
    consumerUserId?: Id | null;
    workforceSessionId?: Id | null;
    tenantId?: Id | null;
    installationId?: Id | null;
    expiresAt: string;
  }): Promise<void>;
  /**
   * Atomically mark the code consumed and return it. Must return null if the
   * code was already consumed, so a replay can never succeed even under
   * concurrent exchanges.
   */
  consumeAuthorizationCode(
    codeHash: string,
    outcome: 'exchanged' | 'rejected',
  ): Promise<OAuthAuthorizationCodeRecord | null>;
  createRefreshFamily(input: {
    clientId: Id;
    tokenUse: string;
    consumerUserId?: Id | null;
    workforceSessionId?: Id | null;
    tenantId?: Id | null;
    installationId?: Id | null;
  }): Promise<Id>;
  issueRefreshToken(input: {
    familyId: Id;
    tokenHash: string;
    generation: number;
    expiresAt: string;
    replacesId?: Id | null;
  }): Promise<Id>;
  findRefreshToken(tokenHash: string): Promise<OAuthRefreshTokenRecord | null>;
  /**
   * Look up a live central workforce session by id alone.
   *
   * The code/refresh path knows the session id but not the staff account id, so
   * it cannot use the tuple lookup on WorkforceAuthRepository. Implementations
   * must return null for revoked or expired sessions.
   */
  findWorkforceSessionById(sessionId: Id): Promise<WorkforceStaffSession | null>;
  consumeRefreshToken(tokenHash: string): Promise<OAuthRefreshTokenRecord | null>;
  revokeRefreshFamily(familyId: Id, reason: string): Promise<void>;
}

export interface Repositories {
  users: UserRepository;
  tenants: TenantRepository;
  roles: RoleRepository;
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  products: ProductRepository;
  productPlans: ProductPlanRepository;
  installations: InstallationRepository;
  serviceControl: ServiceControlRepository;
  subscriptions: SubscriptionRepository;
  invoices: InvoiceRepository;
  paymentMethods: PaymentMethodRepository;
  usage: UsageRepository;
  notifications: NotificationRepository;
  audit: AuditRepository;
  workforceAuth: WorkforceAuthRepository;
  oauth: OAuthRepository;
}
