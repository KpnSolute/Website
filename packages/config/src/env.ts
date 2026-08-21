/**
 * Shared "fail closed, never invent secrets" configuration helpers.
 *
 * Both the API and the browser apps use this module against different env
 * sources (process.env on the server, import.meta.env in Vite apps) so the
 * signature always takes an explicit record rather than reading globals.
 */

export type ConfigStatus = 'configured' | 'missing';

export interface PlatformConfigState {
  database: ConfigStatus;
  kpnAuth: ConfigStatus;
  stripe: ConfigStatus;
}

export type EnvRecord = Record<string, string | undefined>;

function isSet(env: EnvRecord, name: string): boolean {
  const value = env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

function statusOf(env: EnvRecord, ...names: string[]): ConfigStatus {
  return names.every((name) => isSet(env, name)) ? 'configured' : 'missing';
}

/** Resolve which optional external dependencies are actually configured. */
export function resolvePlatformConfigState(env: EnvRecord): PlatformConfigState {
  return {
    database: statusOf(env, 'DATABASE_URL'),
    kpnAuth: statusOf(env, 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'),
    stripe: statusOf(env, 'STRIPE_SECRET_KEY'),
  };
}

export function readEnv(env: EnvRecord, name: string): string | undefined {
  return isSet(env, name) ? (env[name] as string).trim() : undefined;
}

/** Raised when server code needs a secret/config value that is absent. Callers must fail closed. */
export class SetupRequiredError extends Error {
  readonly missingVariable: string;

  constructor(missingVariable: string) {
    super(`Required configuration "${missingVariable}" is not set.`);
    this.name = 'SetupRequiredError';
    this.missingVariable = missingVariable;
  }
}

export function requireEnv(env: EnvRecord, name: string): string {
  const value = readEnv(env, name);
  if (!value) {
    throw new SetupRequiredError(name);
  }
  return value;
}
