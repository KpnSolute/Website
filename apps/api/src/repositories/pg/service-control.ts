import type {
  ControlPlaneEvent,
  InstallationAssignment,
  ServiceResourceReference,
} from '@kpn/contracts';
import { requireRow, type Db } from '../../db/pool.js';
import type { ServiceControlRepository } from '../types.js';

interface AssignmentRow {
  id: string;
  installation_id: string;
  membership_id: string;
  service_role: string;
  status: InstallationAssignment['status'];
  created_at: string;
  updated_at: string;
}

function toAssignment(row: AssignmentRow): InstallationAssignment {
  return {
    id: row.id,
    installationId: row.installation_id,
    membershipId: row.membership_id,
    serviceRole: row.service_role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ResourceRow {
  id: string;
  installation_id: string;
  resource_type: string;
  service_resource_id: string;
  display_name: string | null;
  status: ServiceResourceReference['status'];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function toResource(row: ResourceRow): ServiceResourceReference {
  return {
    id: row.id,
    installationId: row.installation_id,
    resourceType: row.resource_type,
    serviceResourceId: row.service_resource_id,
    displayName: row.display_name,
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface EventRow {
  id: string;
  tenant_id: string | null;
  installation_id: string | null;
  event_type: string;
  source: string;
  subject: string;
  data: Record<string, unknown>;
  status: ControlPlaneEvent['status'];
  attempt_count: number;
  available_at: string;
  occurred_at: string;
  published_at: string | null;
  last_error: string | null;
}

function toEvent(row: EventRow): ControlPlaneEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    installationId: row.installation_id,
    eventType: row.event_type,
    source: row.source,
    subject: row.subject,
    data: row.data,
    status: row.status,
    attemptCount: row.attempt_count,
    availableAt: row.available_at,
    occurredAt: row.occurred_at,
    publishedAt: row.published_at,
    lastError: row.last_error,
  };
}

export function createServiceControlRepository(db: Db): ServiceControlRepository {
  return {
    async assignMember(input) {
      const rows = await db.query<AssignmentRow>(
        `insert into installation_assignments
           (installation_id, membership_id, service_role)
         values ($1, $2, $3)
         on conflict (installation_id, membership_id) do update
           set service_role = excluded.service_role,
               status = 'active',
               updated_at = now()
         returning *`,
        [input.installationId, input.membershipId, input.serviceRole],
      );
      return toAssignment(requireRow(rows));
    },
    async listAssignments(installationId) {
      const rows = await db.query<AssignmentRow>(
        `select * from installation_assignments
         where installation_id = $1 and status <> 'removed'
         order by created_at asc`,
        [installationId],
      );
      return rows.map(toAssignment);
    },
    async listResources(installationId) {
      const rows = await db.query<ResourceRow>(
        `select * from service_resource_references
         where installation_id = $1 and status <> 'deleted'
         order by resource_type asc, display_name asc nulls last, created_at asc`,
        [installationId],
      );
      return rows.map(toResource);
    },
    async listResourcesForInstallations(installationIds) {
      if (installationIds.length === 0) return [];
      const rows = await db.query<ResourceRow>(
        `select * from service_resource_references
         where installation_id = any($1::uuid[]) and status <> 'deleted'
         order by resource_type asc, display_name asc nulls last, created_at asc`,
        [installationIds],
      );
      return rows.map(toResource);
    },
    async findResourceReferences(resourceType, serviceResourceId) {
      const rows = await db.query<ResourceRow>(
        `select * from service_resource_references
         where resource_type = $1 and service_resource_id = $2
         order by created_at asc`,
        [resourceType, serviceResourceId],
      );
      return rows.map(toResource);
    },
    async upsertResource(input) {
      const rows = await db.query<ResourceRow>(
        `insert into service_resource_references
           (installation_id, resource_type, service_resource_id, display_name, metadata)
         values ($1, $2, $3, $4, $5::jsonb)
         on conflict (installation_id, resource_type, service_resource_id) do update
           set display_name = coalesce(excluded.display_name, service_resource_references.display_name),
               metadata = service_resource_references.metadata || excluded.metadata,
               status = 'active',
               updated_at = now()
         returning *`,
        [
          input.installationId,
          input.resourceType,
          input.serviceResourceId,
          input.displayName ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      return toResource(requireRow(rows));
    },
    async recordEvent(input) {
      const rows = await db.query<EventRow>(
        `insert into private.control_plane_outbox
           (tenant_id, installation_id, event_type, subject, data)
         values ($1, $2, $3, $4, $5::jsonb)
         returning *`,
        [
          input.tenantId,
          input.installationId,
          input.eventType,
          input.subject,
          JSON.stringify(input.data ?? {}),
        ],
      );
      return toEvent(requireRow(rows));
    },
  };
}
