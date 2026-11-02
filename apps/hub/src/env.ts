export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000';
export const AUTH_APP_ORIGIN =
  (import.meta.env.VITE_KPNAUTH_URL as string | undefined) ??
  'https://vwbrxcltetelvvkbnbru.supabase.co';
export const CLIENT_ID = 'kpnsolute-hub';
export const IS_DEV = Boolean(import.meta.env.DEV);
/** Where partner and press enquiries go. Unset means the site shows no address rather than a made-up one. */
export const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || null;
