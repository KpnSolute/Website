/**
 * Operator command: assign an existing product-owned resource to a central
 * KpnSolute account, so it appears as that account's managed resource in
 * Platform.
 *
 * Run from an operator shell that already holds DATABASE_URL. This is not, and
 * must not become, a public HTTP endpoint — it grants organization ownership.
 *
 *   npm run operator:assign-corporate-resource --workspace apps/api -- \
 *     --username=<kpnsolute-username> \
 *     --operator-username=<your-own-kpnsolute-username> \
 *     --compute-tenant-id=<compute-side-resource-id> \
 *     --dry-run
 *
 * Identify the person receiving ownership with exactly one of --account-id or
 * --username, and identify yourself with --operator-account-id or
 * --operator-username. The two can never be the same account: the audit record
 * has to show who granted ownership, not who received it. An operator without a
 * KpnSolute account omits both and records a null actor plus --operator-label.
 *
 * Defaults describe the MJCC Compute corporation; every one of them can be
 * overridden. Nothing is invented: an absent database, product, plan, or
 * resource id is a refusal, not a default.
 */
import { pathToFileURL } from 'node:url';
import { readEnv } from '@kpn/config';
import { closeDb, getDb } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import {
  assignCorporateResource,
  MJCC_COMPUTE_CORPORATION,
  type CorporateAssignmentResult,
} from './assign-corporate-resource.js';

const USAGE = `
Assign an existing product resource to a KpnSolute account.

Required:
  --account-id=<uuid>            Immutable KpnSolute account id, or
  --username=<name>              exact KpnSolute username (one, not both)
                                 for the account receiving ownership
  --resource-id=<id>             The product's own id for the resource
                                 (alias: --compute-tenant-id)

Operator identity (recorded as the audit actor, never the new owner):
  --operator-account-id=<uuid>   Your own KpnSolute account id, or
  --operator-username=<name>     your own exact KpnSolute username
  --operator-label=<text>        Note about the operator or change record.
                                 With no operator account, the audit actor is
                                 recorded as null and this is the only
                                 attribution kept.

Optional (defaults describe the MJCC Compute corporation):
  --name=<text>                  Tenant display name        [${MJCC_COMPUTE_CORPORATION.tenant.name}]
  --slug=<slug>                  Tenant slug                [${MJCC_COMPUTE_CORPORATION.tenant.slug}]
  --subdomain=<label>            Corporate runtime host     [${MJCC_COMPUTE_CORPORATION.tenant.subdomain}]
  --service=<key>                Product key                [${MJCC_COMPUTE_CORPORATION.service.serviceKey}]
  --plan=<key>                   Plan key                   [${MJCC_COMPUTE_CORPORATION.service.planKey}]
  --resource-type=<type>         Resource type              [${MJCC_COMPUTE_CORPORATION.resourceType}]
  --resource-name=<text>         Human-readable resource label
  --dry-run                      Compute the outcome, then roll back
  --help                         Show this message
`.trim();

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, ...rest] = arg.slice(2).split('=');
    if (!rawKey) continue;
    parsed[rawKey] = rest.length > 0 ? rest.join('=') : true;
  }
  return parsed;
}

function stringArg(args: Record<string, string | boolean>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  if (!readEnv(process.env, 'DATABASE_URL')) {
    console.error(
      'DATABASE_URL is not set. Refusing to run an ownership command against an unconfigured database.',
    );
    return 1;
  }

  const resourceId = stringArg(args, 'resource-id') ?? stringArg(args, 'compute-tenant-id');
  if (!resourceId) {
    console.error(
      'Missing --resource-id (or --compute-tenant-id). Refusing to reference a resource that was not named.\n',
    );
    console.error(USAGE);
    return 1;
  }

  const request = {
    account: {
      accountId: stringArg(args, 'account-id') ?? null,
      username: stringArg(args, 'username') ?? null,
    },
    operator: {
      accountId: stringArg(args, 'operator-account-id') ?? null,
      username: stringArg(args, 'operator-username') ?? null,
      label: stringArg(args, 'operator-label') ?? null,
    },
    tenant: {
      name: stringArg(args, 'name') ?? MJCC_COMPUTE_CORPORATION.tenant.name,
      slug: stringArg(args, 'slug') ?? MJCC_COMPUTE_CORPORATION.tenant.slug,
      subdomain: stringArg(args, 'subdomain') ?? MJCC_COMPUTE_CORPORATION.tenant.subdomain,
    },
    service: {
      serviceKey: stringArg(args, 'service') ?? MJCC_COMPUTE_CORPORATION.service.serviceKey,
      planKey: stringArg(args, 'plan') ?? MJCC_COMPUTE_CORPORATION.service.planKey,
    },
    resource: {
      resourceType: stringArg(args, 'resource-type') ?? MJCC_COMPUTE_CORPORATION.resourceType,
      serviceResourceId: resourceId,
      displayName: stringArg(args, 'resource-name') ?? null,
      metadata: { assignedBy: 'operator-command', source: 'assign-corporate-resource' },
    },
    dryRun: args['dry-run'] === true,
  };

  try {
    const result = await assignCorporateResource(getDb(process.env), request);
    report(result);
    return 0;
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Refused (${error.code}): ${error.message}`);
      return 1;
    }
    console.error('The assignment failed and was rolled back:', error);
    return 1;
  } finally {
    await closeDb();
  }
}

function report(result: CorporateAssignmentResult): void {
  const prefix = result.dryRun ? 'DRY RUN (rolled back)' : 'Applied';
  console.log(`${prefix}: ${result.outcome}`);
  console.log(
    `  new owner     ${result.accountId}${result.username ? ` (@${result.username})` : ''}`,
  );
  console.log(`  audit actor   ${describeOperator(result)}`);
  console.log(`  tenant        ${result.tenantSlug} (${result.tenantId})`);
  console.log(`  subdomain     ${result.subdomain ?? '—'}`);
  console.log(`  installation  ${result.installationId}`);
  console.log(`  resource ref  ${result.resourceReferenceId}`);
  console.log(`  runtime       ${result.runtimeUrl}`);
  console.log(`  management    ${result.managementUrl}`);
  if (result.changes.length === 0) {
    console.log('  changes       none — already in the requested state');
    return;
  }
  console.log('  changes:');
  for (const change of result.changes) console.log(`    - ${change}`);
}

/** Says plainly when the audit actor is null, rather than printing an empty field. */
function describeOperator(result: CorporateAssignmentResult): string {
  const label = result.operatorLabel ? ` — ${result.operatorLabel}` : '';
  if (!result.operatorAccountId) return `none (null actor)${label}`;
  const username = result.operatorUsername ? ` (@${result.operatorUsername})` : '';
  return `${result.operatorAccountId}${username}${label}`;
}

// Only self-executes when run directly, so tests can import `main` freely.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error('Unexpected failure:', error);
      process.exitCode = 1;
    });
}
