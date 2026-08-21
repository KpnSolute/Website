import type { Invoice, PaymentMethod, Subscription, UsageRecord } from '@kpn/contracts';
import { requireRow, type Db } from '../../db/pool.js';
import type {
  InvoiceRepository,
  PaymentMethodRepository,
  SubscriptionRepository,
  UsageRepository,
} from '../types.js';

interface SubscriptionRow {
  id: string;
  tenant_id: string;
  installation_id: string;
  plan_id: string;
  status: Subscription['status'];
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
}

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    installationId: row.installation_id,
    planId: row.plan_id,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
  };
}

export function createSubscriptionRepository(db: Db): SubscriptionRepository {
  return {
    async listForTenant(tenantId) {
      const rows = await db.query<SubscriptionRow>(
        `select * from subscriptions where tenant_id = $1 order by current_period_start desc`,
        [tenantId],
      );
      return rows.map(toSubscription);
    },
    async create(input) {
      const rows = await db.query<SubscriptionRow>(
        `insert into subscriptions
           (tenant_id, installation_id, plan_id, status, current_period_start, current_period_end,
            cancel_at_period_end, provider_customer_id, provider_subscription_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning *`,
        [
          input.tenantId,
          input.installationId,
          input.planId,
          input.status,
          input.currentPeriodStart,
          input.currentPeriodEnd,
          input.cancelAtPeriodEnd,
          input.providerCustomerId,
          input.providerSubscriptionId,
        ],
      );
      return toSubscription(requireRow(rows));
    },
  };
}

interface InvoiceRow {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  status: Invoice['status'];
  amount_due_cents: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
}

export function createInvoiceRepository(db: Db): InvoiceRepository {
  return {
    async listForTenant(tenantId) {
      const rows = await db.query<InvoiceRow>(
        `select * from invoices where tenant_id = $1 order by issued_at desc nulls last`,
        [tenantId],
      );
      return rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        subscriptionId: row.subscription_id,
        status: row.status,
        amountDueCents: row.amount_due_cents,
        currency: row.currency,
        issuedAt: row.issued_at,
        dueAt: row.due_at,
        paidAt: row.paid_at,
        hostedInvoiceUrl: row.hosted_invoice_url,
      })) satisfies Invoice[];
    },
  };
}

interface PaymentMethodRow {
  id: string;
  tenant_id: string;
  type: PaymentMethod['type'];
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

export function createPaymentMethodRepository(db: Db): PaymentMethodRepository {
  return {
    async listForTenant(tenantId) {
      const rows = await db.query<PaymentMethodRow>(
        `select * from payment_methods where tenant_id = $1 order by is_default desc`,
        [tenantId],
      );
      return rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        type: row.type,
        brand: row.brand,
        last4: row.last4,
        expMonth: row.exp_month,
        expYear: row.exp_year,
        isDefault: row.is_default,
      })) satisfies PaymentMethod[];
    },
  };
}

interface UsageRow {
  id: string;
  tenant_id: string;
  installation_id: string;
  metric_key: string;
  quantity: string;
  recorded_at: string;
}

export function createUsageRepository(db: Db): UsageRepository {
  return {
    async listForTenant(tenantId) {
      const rows = await db.query<UsageRow>(
        `select * from usage_records where tenant_id = $1 order by recorded_at desc limit 200`,
        [tenantId],
      );
      return rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        installationId: row.installation_id,
        metricKey: row.metric_key,
        quantity: Number(row.quantity),
        recordedAt: row.recorded_at,
      })) satisfies UsageRecord[];
    },
  };
}
