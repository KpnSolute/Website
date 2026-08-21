import type {
  WorkforceServiceKey,
  TenantWorkforceAuthPolicy,
  WorkforceInstallationAssignment,
  WorkforceLegacyIdentityLink,
  WorkforceStaffAccount,
  WorkforceStaffSession,
} from '@kpn/contracts';
import { requireRow, type Db } from '../../db/pool.js';
import type {
  WorkforceAuthContext,
  WorkforceAuthRepository,
  WorkforcePinCredentialRecord,
} from '../types.js';

interface PolicyRow {
  tenant_id: string;
  pin_enabled: boolean;
  minimum_pin_length: number;
  maximum_failed_attempts: number;
  lockout_seconds: number;
  session_ttl_seconds: number;
  require_pin_rotation_for_weak_credentials: boolean;
  created_at: string;
  updated_at: string;
}

function toPolicy(row: PolicyRow): TenantWorkforceAuthPolicy {
  return {
    tenantId: row.tenant_id,
    pinEnabled: row.pin_enabled,
    minimumPinLength: row.minimum_pin_length,
    maximumFailedAttempts: row.maximum_failed_attempts,
    lockoutSeconds: row.lockout_seconds,
    sessionTtlSeconds: row.session_ttl_seconds,
    requirePinRotationForWeakCredentials: row.require_pin_rotation_for_weak_credentials,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ContextRow {
  tenant_id: string;
  tenant_slug: string;
  installation_id: string;
  service_key: WorkforceServiceKey;
  pin_enabled: boolean | null;
  minimum_pin_length: number | null;
  maximum_failed_attempts: number | null;
  lockout_seconds: number | null;
  session_ttl_seconds: number | null;
  require_pin_rotation_for_weak_credentials: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

interface StaffRow {
  id: string;
  tenant_id: string;
  linked_user_id: string | null;
  username: string;
  display_name: string;
  employee_code: string | null;
  status: WorkforceStaffAccount['status'];
  last_authenticated_at: string | null;
  created_at: string;
  updated_at: string;
}

function toStaff(row: StaffRow): WorkforceStaffAccount {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    linkedUserId: row.linked_user_id,
    username: row.username,
    displayName: row.display_name,
    employeeCode: row.employee_code,
    status: row.status,
    lastAuthenticatedAt: row.last_authenticated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface AssignmentRow {
  id: string;
  tenant_id: string;
  staff_account_id: string;
  installation_id: string;
  service_role: string;
  status: WorkforceInstallationAssignment['status'];
  created_at: string;
  updated_at: string;
}

function toAssignment(row: AssignmentRow): WorkforceInstallationAssignment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    staffAccountId: row.staff_account_id,
    installationId: row.installation_id,
    serviceRole: row.service_role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface CredentialRow extends StaffRow {
  staff_account_id: string;
  installation_id: string;
  service_role: string;
  credential_hash: string;
  must_rotate: boolean;
  failed_attempts: number;
  locked_until: string | null;
  assignment_id: string;
  assignment_status: WorkforceInstallationAssignment['status'];
  assignment_created_at: string;
  assignment_updated_at: string;
}

function toCredential(row: CredentialRow): WorkforcePinCredentialRecord {
  return {
    staff: toStaff(row),
    assignment: toAssignment({
      id: row.assignment_id,
      tenant_id: row.tenant_id,
      staff_account_id: row.staff_account_id,
      installation_id: row.installation_id,
      service_role: row.service_role,
      status: row.assignment_status,
      created_at: row.assignment_created_at,
      updated_at: row.assignment_updated_at,
    }),
    credentialHash: row.credential_hash,
    mustRotate: row.must_rotate,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
  };
}

interface SessionRow {
  id: string;
  token_jti: string;
  tenant_id: string;
  staff_account_id: string;
  installation_id: string;
  service_key: WorkforceServiceKey;
  service_role: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

function toSession(row: SessionRow): WorkforceStaffSession {
  return {
    id: row.id,
    tokenJti: row.token_jti,
    tenantId: row.tenant_id,
    staffAccountId: row.staff_account_id,
    installationId: row.installation_id,
    serviceKey: row.service_key,
    serviceRole: row.service_role,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function policyFromContext(row: ContextRow): TenantWorkforceAuthPolicy | null {
  if (
    row.pin_enabled === null ||
    row.minimum_pin_length === null ||
    row.maximum_failed_attempts === null ||
    row.lockout_seconds === null ||
    row.session_ttl_seconds === null ||
    row.require_pin_rotation_for_weak_credentials === null ||
    row.created_at === null ||
    row.updated_at === null
  ) {
    return null;
  }
  return toPolicy(row as PolicyRow);
}

export function createWorkforceAuthRepository(db: Db): WorkforceAuthRepository {
  return {
    async resolveContext(tenantSlug, serviceKey) {
      const rows = await db.query<ContextRow>(
        `select tenant.id as tenant_id,
                tenant.slug as tenant_slug,
                installation.id as installation_id,
                product.key as service_key,
                policy.pin_enabled,
                policy.minimum_pin_length,
                policy.maximum_failed_attempts,
                policy.lockout_seconds,
                policy.session_ttl_seconds,
                policy.require_pin_rotation_for_weak_credentials,
                policy.created_at,
                policy.updated_at
         from tenants tenant
         join product_installations installation on installation.tenant_id = tenant.id
         join products product on product.id = installation.product_id
         left join tenant_workforce_auth_policies policy on policy.tenant_id = tenant.id
         where tenant.slug = lower($1)
           and tenant.status = 'active'
           and product.key = $2
           and installation.status in ('active', 'trial')
         order by installation.created_at asc
         limit 1`,
        [tenantSlug, serviceKey],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        tenantId: row.tenant_id,
        tenantSlug: row.tenant_slug,
        installationId: row.installation_id,
        serviceKey: row.service_key,
        policy: policyFromContext(row),
      } satisfies WorkforceAuthContext;
    },

    async resolvePinCredential(tenantId, installationId, normalizedUsername) {
      const rows = await db.query<CredentialRow>(
        `select staff.*,
                assignment.id as assignment_id,
                assignment.staff_account_id,
                assignment.installation_id,
                assignment.service_role,
                assignment.status as assignment_status,
                assignment.created_at as assignment_created_at,
                assignment.updated_at as assignment_updated_at,
                credential.credential_hash,
                credential.must_rotate,
                credential.failed_attempts,
                credential.locked_until
         from workforce_staff_accounts staff
         join workforce_installation_assignments assignment
           on assignment.staff_account_id = staff.id
          and assignment.tenant_id = staff.tenant_id
         join private.workforce_credentials credential
           on credential.staff_account_id = staff.id
          and credential.method = 'pin'
         where staff.tenant_id = $1
           and assignment.installation_id = $2
           and staff.normalized_username = $3
           and staff.status = 'active'
           and assignment.status = 'active'
         limit 1`,
        [tenantId, installationId, normalizedUsername],
      );
      return rows[0] ? toCredential(rows[0]) : null;
    },

    async recordFailedPinAttempt(input) {
      return db.transaction(async (tx) => {
        const rows = await tx.query<{ failed_attempts: number; locked_until: string | null }>(
          `update private.workforce_credentials
           set failed_attempts = failed_attempts + 1,
               last_failed_at = now(),
               locked_until = case
                 when failed_attempts + 1 >= $2
                   then now() + make_interval(secs => $3)
                 else locked_until
               end,
               updated_at = now()
           where staff_account_id = $1
           returning failed_attempts, locked_until`,
          [input.credential.staff.id, input.maximumFailedAttempts, input.lockoutSeconds],
        );
        const state = requireRow(rows);
        await tx.query(
          `insert into private.workforce_auth_audit
             (tenant_id, staff_account_id, installation_id, event_type, method, outcome, request_id, metadata)
           values ($1, $2, $3, 'staff.login', 'pin', $4, $5, $6::jsonb)`,
          [
            input.context.tenantId,
            input.credential.staff.id,
            input.context.installationId,
            state.locked_until ? 'blocked' : 'failed',
            input.requestId,
            JSON.stringify({ reason: 'invalid_credential' }),
          ],
        );
        return { failedAttempts: state.failed_attempts, lockedUntil: state.locked_until };
      });
    },

    async completeSuccessfulPinLogin(input) {
      return db.transaction(async (tx) => {
        const unlocked = await tx.query<{ staff_account_id: string }>(
          `update private.workforce_credentials
           set failed_attempts = 0,
               locked_until = null,
               last_succeeded_at = now(),
               updated_at = now()
           where staff_account_id = $1
             and (locked_until is null or locked_until <= now())
           returning staff_account_id`,
          [input.credential.staff.id],
        );
        requireRow(unlocked);
        await tx.query(
          `update workforce_staff_accounts
           set last_authenticated_at = now(), updated_at = now()
           where id = $1 and tenant_id = $2`,
          [input.credential.staff.id, input.context.tenantId],
        );
        const sessions = await tx.query<SessionRow>(
          `insert into private.workforce_sessions
             (tenant_id, staff_account_id, installation_id, expires_at)
           values ($1, $2, $3, $4)
           returning *, $5::text as service_key, $6::text as service_role`,
          [
            input.context.tenantId,
            input.credential.staff.id,
            input.context.installationId,
            input.expiresAt,
            input.context.serviceKey,
            input.credential.assignment.serviceRole,
          ],
        );
        const session = toSession(requireRow(sessions));
        await tx.query(
          `insert into private.workforce_auth_audit
             (tenant_id, staff_account_id, installation_id, session_id, event_type, method, outcome, request_id)
           values ($1, $2, $3, $4, 'staff.login', 'pin', 'succeeded', $5)`,
          [
            input.context.tenantId,
            input.credential.staff.id,
            input.context.installationId,
            session.id,
            input.requestId,
          ],
        );
        return session;
      });
    },

    async recordRejectedAttempt(input) {
      await db.query(
        `insert into private.workforce_auth_audit
           (tenant_id, staff_account_id, installation_id, event_type, method, outcome, request_id, metadata)
         values ($1, $2, $3, 'staff.login', 'pin', $4, $5, $6::jsonb)`,
        [
          input.tenantId,
          input.staffAccountId ?? null,
          input.installationId,
          input.outcome,
          input.requestId,
          JSON.stringify({ reason: input.reason }),
        ],
      );
    },

    async findActiveSession(input) {
      const rows = await db.query<SessionRow>(
        `select session.*,
                product.key as service_key,
                assignment.service_role
         from private.workforce_sessions session
         join workforce_staff_accounts staff
           on staff.id = session.staff_account_id
          and staff.tenant_id = session.tenant_id
         join workforce_installation_assignments assignment
           on assignment.staff_account_id = session.staff_account_id
          and assignment.installation_id = session.installation_id
          and assignment.tenant_id = session.tenant_id
         join product_installations installation on installation.id = session.installation_id
         join products product on product.id = installation.product_id
         where session.id = $1
           and session.tenant_id = $2
           and session.installation_id = $3
           and session.staff_account_id = $4
           and product.key = $5
           and session.revoked_at is null
           and session.expires_at > now()
           and staff.status = 'active'
           and assignment.status = 'active'
           and installation.status in ('active', 'trial')
         limit 1`,
        [
          input.sessionId,
          input.tenantId,
          input.installationId,
          input.staffAccountId,
          input.serviceKey,
        ],
      );
      return rows[0] ? toSession(rows[0]) : null;
    },

    async revokeSession(sessionId, reason) {
      await db.query(
        `update private.workforce_sessions
         set revoked_at = coalesce(revoked_at, now()), revoke_reason = $2
         where id = $1`,
        [sessionId, reason.slice(0, 200)],
      );
    },

    async upsertPolicy(policy) {
      const rows = await db.query<PolicyRow>(
        `insert into tenant_workforce_auth_policies
           (tenant_id, pin_enabled, minimum_pin_length, maximum_failed_attempts,
            lockout_seconds, session_ttl_seconds, require_pin_rotation_for_weak_credentials)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (tenant_id) do update
           set pin_enabled = excluded.pin_enabled,
               minimum_pin_length = excluded.minimum_pin_length,
               maximum_failed_attempts = excluded.maximum_failed_attempts,
               lockout_seconds = excluded.lockout_seconds,
               session_ttl_seconds = excluded.session_ttl_seconds,
               require_pin_rotation_for_weak_credentials = excluded.require_pin_rotation_for_weak_credentials,
               updated_at = now()
         returning *`,
        [
          policy.tenantId,
          policy.pinEnabled,
          policy.minimumPinLength,
          policy.maximumFailedAttempts,
          policy.lockoutSeconds,
          policy.sessionTtlSeconds,
          policy.requirePinRotationForWeakCredentials,
        ],
      );
      return toPolicy(requireRow(rows));
    },

    async upsertStaffAccount(input) {
      const rows = await db.query<StaffRow>(
        `insert into workforce_staff_accounts
           (id, tenant_id, linked_user_id, username, display_name, employee_code, status)
         values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
         on conflict (tenant_id, normalized_username) do update
           set linked_user_id = coalesce(excluded.linked_user_id, workforce_staff_accounts.linked_user_id),
               display_name = excluded.display_name,
               employee_code = excluded.employee_code,
               status = excluded.status,
               updated_at = now()
         returning *`,
        [
          input.id ?? null,
          input.tenantId,
          input.linkedUserId ?? null,
          input.username,
          input.displayName,
          input.employeeCode ?? null,
          input.status ?? 'active',
        ],
      );
      return toStaff(requireRow(rows));
    },

    async upsertPinCredential(input) {
      await db.transaction(async (tx) => {
        await tx.query(
          `insert into private.workforce_credentials
             (staff_account_id, method, credential_hash, must_rotate)
           values ($1, 'pin', $2, $3)
           on conflict (staff_account_id, method) do update
             set credential_hash = excluded.credential_hash,
                 must_rotate = excluded.must_rotate,
                 failed_attempts = 0,
                 locked_until = null,
                 updated_at = now()`,
          [input.staffAccountId, input.credentialHash, input.mustRotate],
        );
        await tx.query(
          `update private.workforce_sessions
           set revoked_at = coalesce(revoked_at, now()),
               revoke_reason = coalesce(revoke_reason, 'credential_rotated')
           where staff_account_id = $1 and revoked_at is null`,
          [input.staffAccountId],
        );
      });
    },

    async assignStaffToInstallation(input) {
      const rows = await db.query<AssignmentRow>(
        `insert into workforce_installation_assignments
           (tenant_id, staff_account_id, installation_id, service_role)
         values ($1, $2, $3, $4)
         on conflict (installation_id, staff_account_id) do update
           set service_role = excluded.service_role,
               status = 'active',
               updated_at = now()
         returning *`,
        [input.tenantId, input.staffAccountId, input.installationId, input.serviceRole],
      );
      return toAssignment(requireRow(rows));
    },

    async mapLegacyIdentity(input) {
      const rows = await db.query<{
        id: string;
        tenant_id: string;
        staff_account_id: string;
        installation_id: string;
        provider: string;
        legacy_subject: string;
        status: WorkforceLegacyIdentityLink['status'];
        linked_at: string;
        last_verified_at: string | null;
      }>(
        `insert into workforce_legacy_identity_links
           (tenant_id, staff_account_id, installation_id, provider, legacy_subject)
         values ($1, $2, $3, $4, $5)
         on conflict (installation_id, provider, legacy_subject) do update
           set staff_account_id = excluded.staff_account_id,
               tenant_id = excluded.tenant_id,
               status = 'active',
               last_verified_at = now()
         returning *`,
        [
          input.tenantId,
          input.staffAccountId,
          input.installationId,
          input.provider,
          input.legacySubject,
        ],
      );
      const row = requireRow(rows);
      return {
        id: row.id,
        tenantId: row.tenant_id,
        staffAccountId: row.staff_account_id,
        installationId: row.installation_id,
        provider: row.provider,
        legacySubject: row.legacy_subject,
        status: row.status,
        linkedAt: row.linked_at,
        lastVerifiedAt: row.last_verified_at,
      };
    },
  };
}
