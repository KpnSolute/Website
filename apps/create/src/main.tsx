import React from 'react';
import { createRoot } from 'react-dom/client';
import { ManagedPortal } from '@kpn/app-runtime';
import { ConnectedProvisionPage } from './ConnectedProvisionPage';

const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
  authAppOrigin: import.meta.env.VITE_KPNAUTH_URL ?? 'https://vwbrxcltetelvvkbnbru.supabase.co',
  clientId: 'kpnsolute-create',
  redirectUri: `${window.location.origin}/auth/callback`,
};

// Entering at /{service}/new preselects that service; the flow itself is one
// form so a person can still change their mind without losing what they typed.
const sections = [
  {
    path: '/',
    label: 'Choose service',
    title: 'Create an organization service',
    description: 'Provision a KpnSolute organization or corporation and install a service in it.',
    content: <ConnectedProvisionPage />,
  },
  {
    path: '/compute/new',
    label: 'Compute',
    title: 'Create a Compute organization',
    description: 'Select a name, tenant class, addressing, and approved Compute plan.',
    content: <ConnectedProvisionPage presetServiceKey="compute" />,
  },
  {
    path: '/scena/new',
    label: 'Scena',
    title: 'Create a Scena workspace',
    description: 'Provision Scena under a centralized KpnSolute organization.',
    content: <ConnectedProvisionPage presetServiceKey="scena" />,
  },
  {
    path: '/lunchvoice/new',
    label: 'LunchVoice',
    title: 'Create a LunchVoice workspace',
    description: 'Provision LunchVoice while preserving its product-owned runtime and data.',
    content: <ConnectedProvisionPage presetServiceKey="lunchvoice" />,
  },
  {
    path: '/status',
    label: 'Provisioning',
    title: 'Provisioning status',
    description: 'Resume and review in-progress provisioning operations.',
  },
];

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ManagedPortal productName="Create" config={config} sections={sections} />
  </React.StrictMode>,
);
