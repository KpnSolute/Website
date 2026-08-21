import React from 'react';
import { createRoot } from 'react-dom/client';
import { ManagedPortal } from '@kpn/app-runtime';
const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
  authAppOrigin: import.meta.env.VITE_KPNAUTH_URL ?? 'https://vwbrxcltetelvvkbnbru.supabase.co',
  clientId: 'kpnsolute-flow',
  redirectUri: `${window.location.origin}/auth/callback`,
};
const sections = [
  {
    path: '/',
    label: 'Workflows',
    title: 'KpnFlow workflows',
    description:
      'Create organization-scoped automations from approved KpnLink triggers and actions.',
  },
  {
    path: '/templates',
    label: 'Templates',
    title: 'Workflow templates',
    description: 'Start from reviewed templates without silently changing product behavior.',
  },
  {
    path: '/runs',
    label: 'Runs',
    title: 'Run history',
    description: 'Inspect inputs, actions, outcomes, retries, and operator interventions.',
  },
  {
    path: '/connections',
    label: 'Connections',
    title: 'Workflow connections',
    description: 'Review which KpnLink credentials and services each workflow may access.',
  },
];
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ManagedPortal productName="Flow" config={config} sections={sections} />
  </React.StrictMode>,
);
