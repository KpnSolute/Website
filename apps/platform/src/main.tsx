import React from 'react';
import { createRoot } from 'react-dom/client';
import { ManagedPortal } from '@kpn/app-runtime';
import { ConnectedOrganizationsPage } from './ConnectedOrganizationsPage';

const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
  authAppOrigin: import.meta.env.VITE_KPNAUTH_URL ?? 'https://vwbrxcltetelvvkbnbru.supabase.co',
  clientId: 'kpnsolute-platform',
  redirectUri: `${window.location.origin}/auth/callback`,
};

const sections = [
  {
    path: '/',
    label: 'Organizations',
    title: 'Your organizations',
    description:
      'Choose an organization to manage its people, products, permissions, and operating resources.',
    content: <ConnectedOrganizationsPage />,
  },
  {
    path: '/people',
    label: 'People',
    title: 'People and access',
    description:
      'Invite members, assign organization roles, suspend access, and review membership.',
  },
  {
    path: '/services',
    label: 'Services',
    title: 'Installed services',
    description:
      'Manage Compute, Scena, LunchVoice, Tradora, Link, and Flow installations owned by this organization.',
  },
  {
    path: '/resources',
    label: 'Resources',
    title: 'Organization resources',
    description: 'Review tenant-scoped resources without crossing product ownership boundaries.',
  },
  {
    path: '/editor',
    label: 'SOP editor',
    title: 'SOP and site editor',
    description:
      'Upload and govern organization SOP source material. Generation remains unavailable until its reviewed pipeline is configured.',
  },
  {
    path: '/settings',
    label: 'Settings',
    title: 'Organization settings',
    description:
      'Manage the organization profile, tenancy class, verified domains, and lifecycle controls.',
  },
];

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ManagedPortal productName="Platform" config={config} sections={sections} />
  </React.StrictMode>,
);
