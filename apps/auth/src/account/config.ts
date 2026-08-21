import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApiClient, createAccountsClient } from '@kpn/api-client';

/**
 * Client wiring for the direct KpnAuth account flows at
 * auth.kpnsolute.com/login, /create, and /verify.
 *
 * These pages exist independently of an OAuth authorization request: a person
 * can create or recover a KpnSolute account without a product having sent them
 * here. The OAuth consent screen at `/` is unaffected.
 *
 * Where those flows send people is policy, not wiring, and lives in
 * ./destinations.ts.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export interface KpnAuthConfigState {
  configured: boolean;
  missing: string[];
}

export function authConfigState(): KpnAuthConfigState {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!publishableKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!apiBaseUrl) missing.push('VITE_API_BASE_URL');
  return { configured: missing.length === 0, missing };
}

let cached: SupabaseClient | null = null;

/** Null when KpnAuth is not configured, so every caller fails closed. */
export function kpnAuthClient(): SupabaseClient | null {
  if (!supabaseUrl || !publishableKey) return null;
  cached ??= createClient(supabaseUrl, publishableKey);
  return cached;
}

/**
 * Accounts API bound to the current KpnAuth session. The access token is read
 * per request rather than captured, so a token refreshed mid-flow is used.
 */
export function accountsApi(accessToken: () => Promise<string | null>) {
  return createAccountsClient(createApiClient({ baseUrl: apiBaseUrl, accessToken }));
}

export async function currentAccessToken(): Promise<string | null> {
  const client = kpnAuthClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
