export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000';
export const AUTH_APP_ORIGIN =
  (import.meta.env.VITE_KPNAUTH_URL as string | undefined) ??
  'https://axzwdbizblfkspduqilj.supabase.co';
export const CLIENT_ID =
  (import.meta.env.VITE_KPN_CLIENT_ID as string | undefined) ?? 'kpnsolute-accounts';
export const IS_DEV = Boolean(import.meta.env.DEV);
