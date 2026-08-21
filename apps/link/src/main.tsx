import React from 'react';
import { createRoot } from 'react-dom/client';
import { ManagedPortal } from '@kpn/app-runtime';
const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
  authAppOrigin: import.meta.env.VITE_KPNAUTH_URL ?? 'https://vwbrxcltetelvvkbnbru.supabase.co',
  clientId: 'kpnsolute-link',
  redirectUri: `${window.location.origin}/auth/callback`,
};
const sections = [
  {
    path: '/',
    label: 'Connections',
    title: 'KpnLink connections',
    description: 'Connect organization services through tenant-scoped, auditable integrations.',
  },
  {
    path: '/endpoints',
    label: 'Endpoints',
    title: 'Webhook endpoints',
    description:
      'Register destinations, subscribe to CloudEvents types, and rotate signing credentials.',
  },
  {
    path: '/deliveries',
    label: 'Deliveries',
    title: 'Delivery health',
    description: 'Inspect attempts, acknowledgements, retries, and dead-letter outcomes.',
  },
  {
    path: '/credentials',
    label: 'Credentials',
    title: 'Credentials',
    description:
      'Issue and revoke scoped credentials without exposing secret values after creation.',
  },
  {
    path: '/catalog',
    label: 'Event catalog',
    title: 'CloudEvents catalog',
    description:
      'Discover versioned events published by Compute, Scena, LunchVoice, and other products.',
  },
];
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ManagedPortal productName="Link" config={config} sections={sections} />
  </React.StrictMode>,
);
