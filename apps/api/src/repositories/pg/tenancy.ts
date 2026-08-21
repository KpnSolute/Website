import type { Role, Tenant, TenantInvitation, TenantMembership } from '@kpn/contracts';
import { requireRow, type Db } from '../../db/pool.js';
import type {
  InvitationRepository,
  MembershipRepository,
  NewInvitation,
  NewMembership,
  NewTenant,
  RoleRepository,
  TenantRepository,
} from '../types.js';

interface TenantRow {
  id: string;
  type: Tenant['type'];
  name: string;
  slug: string;
  status: Tenant['status'];
  created_by_user_id: string;
  subdomain: string | null;
  custom_domain: string | null;
  created_at: string;
  updated_at: string;
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    slug: row.slug,
    status: row.status,
    // The class is derived from the tenant type in exactly one place, so a
    // client never has to infer addressing from `type` itself.
    tenantClass: row.type === 'corporation' ? 'corporation' : 'organization',
    subdomain: row.subdomain ?? null,
    customDomain: row.custom_domain ?? null,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTenantRepository(db: Db): TenantRepository {
  return {
    async create(input: NewTenant) {
      const rows = await db.query<TenantRow>(
        `insert into tenants (type, name, slug, subdomain, created_by_user_id)
         values ($1, $2, $3, $4, $5) returning *`,
        [
          input.type,
          input.name,
          input.slug,
          input.subdomain ? input.subdomain.toLowerCase() : null,
          input.createdByUserId,
        ],
      );
      return toTenant(requireRow(rows));
    },
    async findBySlug(slug) {
      const rows = await db.query<TenantRow>(`select * from tenants where slug = $1`, [
        slug.toLowerCase(),
      ]);
      const row = rows[0];
      return row ? toTenant(row) : null;
    },
    async findBySubdomain(subdomain) {
      const rows = await db.query<TenantRow>(`select * from tenants where lower(subdomain) = $1`, [
        subdomain.toLowerCase(),
      ]);
      const row = rows[0];
      return row ? toTenant(row) : null;
    },
    async findById(id) {
      const rows = await db.query<TenantRow>(`select * from tenants where id = $1`, [id]);
      const row = rows[0];
      return row ? toTenant(row) : null;
    },
    async listForUser(userId) {
      const rows = await db.query<TenantRow>(
        `select t.* from tenants t
         join tenant_memberships m on m.tenant_id = t.id
         where m.user_id = $1 and m.status = 'active'
         order by t.created_at asc`,
        [userId],
      );
      return rows.map(toTenant);
    },
    async slugTaken(slug) {
      const rows = await db.query(`select 1 from tenants where slug = $1`, [slug.toLowerCase()]);
      return rows.length > 0;
    },
    async subdomainTaken(subdomain) {
      const rows = await db.query(`select 1 from tenants where lower(subdomain) = $1`, [
        subdomain.toLowerCase(),
      ]);
      return rows.length > 0;
    },
    async setSubdomain(id, subdomain) {
      const rows = await db.query<TenantRow>(
        `update tenants set subdomain = $2, updated_at = now() where id = $1 returning *`,
        [id, subdomain.toLowerCase()],
      );
      return toTenant(requireRow(rows));
    },
  };
}

interface RoleRow {
  id: string;
  tenant_id: string | null;
  key: string;
  name: string;
  is_built_in: boolean;
}

function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    key: row.key,
    name: row.name,
    isBuiltIn: row.is_built_in,
  };
}

const BUILT_IN_ROLES: { key: 'owner' | 'admin' | 'member'; name: string }[] = [
  { key: 'owner', name: 'Owner' },
  { key: 'admin', name: 'Admin' },
  { key: 'member', name: 'Member' },
];

export function createRoleRepository(db: Db): RoleRepository {
  return {
    async ensureBuiltInRoles(tenantId) {
      const result = {} as Record<'owner' | 'admin' | 'member', Role>;
      for (const role of BUILT_IN_ROLES) {
        const rows = await db.query<RoleRow>(
          `insert into roles (tenant_id, key, name, is_built_in)
           values ($1, $2, $3, true)
           on conflict (tenant_id, key) do update set name = excluded.name
           returning *`,
          [tenantId, role.key, role.name],
        );
        result[role.key] = toRole(requireRow(rows));
      }
      return result;
    },
    async findByKey(tenantId, key) {
      const rows = await db.query<RoleRow>(
        `select * from roles where tenant_id = $1 and key = $2`,
        [tenantId, key],
      );
      const row = rows[0];
      return row ? toRole(row) : null;
    },
    async findById(id) {
      const rows = await db.query<RoleRow>(`select * from roles where id = $1`, [id]);
      const row = rows[0];
      return row ? toRole(row) : null;
    },
  };
}

interface MembershipRow {
  id: string;
  tenant_id: string;
  user_id: string;
  role_id: string;
  status: TenantMembership['status'];
  joined_at: string;
}

function toMembership(row: MembershipRow): TenantMembership {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    roleId: row.role_id,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

export function createMembershipRepository(db: Db): MembershipRepository {
  return {
    async create(input: NewMembership) {
      const rows = await db.query<MembershipRow>(
        `insert into tenant_memberships (tenant_id, user_id, role_id, status)
         values ($1, $2, $3, $4) returning *`,
        [input.tenantId, input.userId, input.roleId, input.status],
      );
      return toMembership(requireRow(rows));
    },
    async findActive(tenantId, userId) {
      const rows = await db.query<MembershipRow>(
        `select * from tenant_memberships
         where tenant_id = $1 and user_id = $2 and status = 'active'`,
        [tenantId, userId],
      );
      const row = rows[0];
      return row ? toMembership(row) : null;
    },
    async findAnyStatus(tenantId, userId) {
      const rows = await db.query<MembershipRow>(
        `select * from tenant_memberships
         where tenant_id = $1 and user_id = $2
         order by joined_at asc`,
        [tenantId, userId],
      );
      const row = rows[0];
      return row ? toMembership(row) : null;
    },
    async listByTenantAndRoleKey(tenantId, roleKey) {
      const rows = await db.query<MembershipRow>(
        `select m.* from tenant_memberships m
         join roles r on r.id = m.role_id
         where m.tenant_id = $1 and r.key = $2 and m.status = 'active'
         order by m.joined_at asc`,
        [tenantId, roleKey],
      );
      return rows.map(toMembership);
    },
    async listByTenant(tenantId) {
      const rows = await db.query<MembershipRow>(
        `select * from tenant_memberships where tenant_id = $1 order by joined_at asc`,
        [tenantId],
      );
      return rows.map(toMembership);
    },
    async updateRole(id, roleId) {
      const rows = await db.query<MembershipRow>(
        `update tenant_memberships set role_id = $2 where id = $1 returning *`,
        [id, roleId],
      );
      return toMembership(requireRow(rows));
    },
    async updateStatus(id, status) {
      const rows = await db.query<MembershipRow>(
        `update tenant_memberships set status = $2 where id = $1 returning *`,
        [id, status],
      );
      return toMembership(requireRow(rows));
    },
    async remove(id) {
      await db.query(`delete from tenant_memberships where id = $1`, [id]);
    },
  };
}

interface InvitationRow {
  id: string;
  tenant_id: string;
  email: string;
  role_id: string;
  status: TenantInvitation['status'];
  invited_by_user_id: string;
  created_at: string;
  expires_at: string;
}

function toInvitation(row: InvitationRow): TenantInvitation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    roleId: row.role_id,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function createInvitationRepository(db: Db): InvitationRepository {
  return {
    async create(input: NewInvitation) {
      const rows = await db.query<InvitationRow>(
        `insert into tenant_invitations (tenant_id, email, role_id, invited_by_user_id, expires_at)
         values ($1, $2, $3, $4, $5) returning *`,
        [
          input.tenantId,
          input.email.toLowerCase(),
          input.roleId,
          input.invitedByUserId,
          input.expiresAt,
        ],
      );
      return toInvitation(requireRow(rows));
    },
    async listForEmail(email) {
      const rows = await db.query<InvitationRow>(
        `select * from tenant_invitations where email = $1 and status = 'pending' order by created_at desc`,
        [email.toLowerCase()],
      );
      return rows.map(toInvitation);
    },
    async findById(id) {
      const rows = await db.query<InvitationRow>(`select * from tenant_invitations where id = $1`, [
        id,
      ]);
      const row = rows[0];
      return row ? toInvitation(row) : null;
    },
    async markAccepted(id) {
      await db.query(`update tenant_invitations set status = 'accepted' where id = $1`, [id]);
    },
    async markDeclined(id) {
      await db.query(`update tenant_invitations set status = 'revoked' where id = $1`, [id]);
    },
  };
}
