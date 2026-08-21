import type { Notification } from '@kpn/contracts';
import type { Db } from '../../db/pool.js';
import type { AuditRepository, NotificationRepository } from '../types.js';

interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export function createNotificationRepository(db: Db): NotificationRepository {
  return {
    async listForUser(userId) {
      const rows = await db.query<NotificationRow>(
        `select * from notifications where user_id = $1 order by created_at desc limit 50`,
        [userId],
      );
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        body: row.body,
        readAt: row.read_at,
        createdAt: row.created_at,
      })) satisfies Notification[];
    },
  };
}

export function createAuditRepository(db: Db): AuditRepository {
  return {
    async record(input) {
      await db.query(
        `insert into audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          input.tenantId,
          input.actorUserId,
          input.action,
          input.targetType ?? null,
          input.targetId ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    },
  };
}
