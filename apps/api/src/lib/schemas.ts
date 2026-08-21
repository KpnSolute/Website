import { z } from 'zod';
import { TENANT_CLASSES, WORKFORCE_SERVICE_KEYS } from '@kpn/contracts';

/** zod needs a non-empty tuple; TENANT_CLASSES stays the single source of truth. */
const TENANT_CLASSES_TUPLE = TENANT_CLASSES as unknown as ['organization', 'corporation'];

export const oauthRequestSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(43).max(128),
  codeChallengeMethod: z.literal('S256'),
  state: z.string().min(1),
  nonce: z.string().min(1),
  scope: z.string().default(''),
});

export const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120),
  oauth: oauthRequestSchema,
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  oauth: oauthRequestSchema,
});

export const tokenBodySchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
});

export const googleStartQuerySchema = oauthRequestSchema;

/**
 * Provisioning contract for both tenant classes. A standard organization stays
 * slug-addressed; a corporation must supply a non-reserved subdomain. The
 * detailed routing rules live in packages/contracts/src/tenancy.ts so Platform,
 * Create, the gateway, and the database agree on one answer — this schema only
 * bounds the request shape.
 */
export const createTenantBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().toLowerCase().min(1).max(63),
    tenantClass: z.enum(TENANT_CLASSES_TUPLE).default('organization'),
    subdomain: z.string().trim().toLowerCase().min(1).max(63).optional(),
    serviceKey: z.string().min(1),
    planKey: z.string().min(1),
  })
  .refine((body) => body.tenantClass === 'corporation' || body.subdomain === undefined, {
    path: ['subdomain'],
    message: 'Only a corporation may hold a dedicated subdomain.',
  })
  .refine((body) => body.tenantClass !== 'corporation' || Boolean(body.subdomain), {
    path: ['subdomain'],
    message: 'A corporation requires a dedicated subdomain.',
  });

export const claimUsernameBodySchema = z.object({
  username: z.string().trim().min(1).max(64),
});

export const usernameAvailabilityQuerySchema = z.object({
  username: z.string().trim().min(1).max(64),
});

export const inviteMemberBodySchema = z.object({
  email: z.string().email(),
  roleKey: z.enum(['owner', 'admin', 'member']),
});

export const updateMemberBodySchema = z.object({
  roleKey: z.enum(['owner', 'admin', 'member']).optional(),
  status: z.enum(['active', 'suspended', 'removed']).optional(),
});

export const updateProfileBodySchema = z.object({
  displayName: z.string().min(1).max(120),
});

export const checkoutBodySchema = z.object({
  planId: z.string().min(1),
  successPath: z.string().min(1),
  cancelPath: z.string().min(1),
});

export const workforceAuthRouteParamsSchema = z.object({
  tenantSlug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  serviceKey: z.enum(WORKFORCE_SERVICE_KEYS),
});

export const workforceServiceRouteParamsSchema = z.object({
  serviceKey: z.enum(WORKFORCE_SERVICE_KEYS),
});

export const workforcePinLoginBodySchema = z.object({
  username: z.string().trim().min(1).max(80),
  pin: z.string().regex(/^\d{4,12}$/, 'PIN must contain 4 to 12 digits.'),
});

/**
 * Workforce authorization-code flow (docs/AUTH_FINAL_GUIDE.md section 2).
 * Bounds here mirror the database constraints so a bad request is rejected
 * before it reaches SQL.
 */
export const workforceAuthorizeBodySchema = oauthRequestSchema.extend({
  responseType: z.literal('code').default('code'),
  state: z.string().min(16).max(512),
  nonce: z.string().min(16).max(512),
  service: z.enum(WORKFORCE_SERVICE_KEYS),
  tenantHint: z.string().trim().max(63).optional(),
});

export const workforceAuthorizePinBodySchema = z.object({
  tenantSlug: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  username: z.string().trim().min(1).max(80),
  pin: z.string().regex(/^\d{4,12}$/, 'PIN must contain 4 to 12 digits.'),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).max(512),
  clientId: z.string().min(1),
});

export const revokeBodySchema = z.object({
  refreshToken: z.string().min(1).max(512),
});

export const authorizationRequestParamsSchema = z.object({
  requestId: z.string().uuid(),
});
