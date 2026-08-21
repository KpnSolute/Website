import React from 'react';
import { createRoot } from 'react-dom/client';
import { ManagedPortal } from '@kpn/app-runtime';
const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
  authAppOrigin: import.meta.env.VITE_KPNAUTH_URL ?? 'https://vwbrxcltetelvvkbnbru.supabase.co',
  clientId: 'kpnsolute-billing',
  redirectUri: `${window.location.origin}/auth/callback`,
};
const sections = [
  {
    path: '/',
    label: 'Overview',
    title: 'Billing overview',
    description:
      'Central billing across KpnSolute services, scoped to organizations you are authorized to manage.',
  },
  {
    path: '/subscriptions',
    label: 'Subscriptions',
    title: 'Subscriptions',
    description: 'Review product subscriptions, status, renewal, and approved plan changes.',
  },
  {
    path: '/invoices',
    label: 'Invoices',
    title: 'Invoices',
    description: 'Review organization invoices and payment state.',
  },
  {
    path: '/payment-methods',
    label: 'Payment methods',
    title: 'Payment methods',
    description: 'Manage reusable payment methods through the configured billing processor.',
  },
  {
    path: '/usage',
    label: 'Usage',
    title: 'Metered usage',
    description: 'Review source-attributed usage records before they affect billing.',
  },
];
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ManagedPortal productName="Billing" config={config} sections={sections} />
  </React.StrictMode>,
);
