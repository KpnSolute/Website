import type { InstallationEntitlement, ProductInstallation, ProductPlan } from '@kpn/contracts';
import { requireRow, type Db } from '../../db/pool.js';
import type {
  InstallationRepository,
  NewInstallation,
  ProductPlanRepository,
  ProductRepository,
} from '../types.js';

interface ProductRow {
  id: string;
  key: string;
  name: string;
}

export function createProductRepository(db: Db): ProductRepository {
  return {
    async list() {
      const rows = await db.query<ProductRow>(`select * from products order by name asc`);
      return rows;
    },
    async findByKey(key) {
      const rows = await db.query<ProductRow>(`select * from products where key = $1`, [key]);
      return rows[0] ?? null;
    },
  };
}

interface ProductPlanRow {
  id: string;
  product_id: string;
  key: string;
  name: string;
}

function toPlan(row: ProductPlanRow): ProductPlan {
  return { id: row.id, productId: row.product_id, key: row.key, name: row.name };
}

export function createProductPlanRepository(db: Db): ProductPlanRepository {
  return {
    async listForProduct(productId) {
      const rows = await db.query<ProductPlanRow>(
        `select * from product_plans where product_id = $1 order by name asc`,
        [productId],
      );
      return rows.map(toPlan);
    },
    async findByKey(productId, key) {
      const rows = await db.query<ProductPlanRow>(
        `select * from product_plans where product_id = $1 and key = $2`,
        [productId, key],
      );
      const row = rows[0];
      return row ? toPlan(row) : null;
    },
    async findById(id) {
      const rows = await db.query<ProductPlanRow>(`select * from product_plans where id = $1`, [
        id,
      ]);
      const row = rows[0];
      return row ? toPlan(row) : null;
    },
  };
}

interface InstallationRow {
  id: string;
  tenant_id: string;
  product_id: string;
  plan_id: string;
  status: ProductInstallation['status'];
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function toInstallation(row: InstallationRow): ProductInstallation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    planId: row.plan_id,
    status: row.status,
    settings: row.settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface CatalogJoinRow {
  product_key: string;
  product_name: string;
  plan_key: string;
  plan_name: string;
}

interface EntitlementRow {
  id: string;
  installation_id: string;
  key: string;
  limit_value: number | null;
  boolean_value: boolean | null;
}

export function createInstallationRepository(db: Db): InstallationRepository {
  return {
    async create(input: NewInstallation) {
      const rows = await db.query<InstallationRow>(
        `insert into product_installations (tenant_id, product_id, plan_id, status)
         values ($1, $2, $3, $4) returning *`,
        [input.tenantId, input.productId, input.planId, input.status],
      );
      return toInstallation(requireRow(rows));
    },
    async listForTenant(tenantId) {
      const rows = await db.query<InstallationRow>(
        `select * from product_installations where tenant_id = $1 order by created_at asc`,
        [tenantId],
      );
      return rows.map(toInstallation);
    },
    async findByTenantAndProduct(tenantId, productId) {
      const rows = await db.query<InstallationRow>(
        `select * from product_installations
         where tenant_id = $1 and product_id = $2
         order by created_at asc`,
        [tenantId, productId],
      );
      const row = rows[0];
      return row ? toInstallation(row) : null;
    },
    async listForTenantsWithCatalog(tenantIds) {
      if (tenantIds.length === 0) return [];
      const rows = await db.query<InstallationRow & CatalogJoinRow>(
        `select i.*, p.key as product_key, p.name as product_name,
                pl.key as plan_key, pl.name as plan_name
         from product_installations i
         join products p on p.id = i.product_id
         join product_plans pl on pl.id = i.plan_id
         where i.tenant_id = any($1::uuid[])
         order by i.created_at asc`,
        [tenantIds],
      );
      return rows.map((row) => ({
        installation: toInstallation(row),
        productKey: row.product_key,
        productName: row.product_name,
        planKey: row.plan_key,
        planName: row.plan_name,
      }));
    },
    async findById(id) {
      const rows = await db.query<InstallationRow>(
        `select * from product_installations where id = $1`,
        [id],
      );
      const row = rows[0];
      return row ? toInstallation(row) : null;
    },
    async listEntitlements(installationId) {
      const rows = await db.query<EntitlementRow>(
        `select * from installation_entitlements where installation_id = $1 order by key asc`,
        [installationId],
      );
      return rows.map((row) => ({
        id: row.id,
        installationId: row.installation_id,
        key: row.key,
        limitValue: row.limit_value,
        booleanValue: row.boolean_value,
      })) satisfies InstallationEntitlement[];
    },
  };
}
