import { ManagedPortal } from '@kpn/app-runtime';
import { API_BASE_URL, AUTH_APP_ORIGIN, CLIENT_ID } from './env';

export function App() {
  const config = {
    apiBaseUrl: API_BASE_URL,
    authAppOrigin: AUTH_APP_ORIGIN,
    clientId: CLIENT_ID,
    redirectUri: `${window.location.origin}/auth/callback`,
  };

  return (
    <ManagedPortal
      productName="Accounts"
      config={config}
      sections={[
        {
          path: '/',
          label: 'Account',
          title: 'Your KpnSolute account',
          description: 'Manage the identity used across every KpnSolute service.',
        },
        {
          path: '/personal-information',
          label: 'Personal information',
          title: 'Personal information',
          description: 'Review and update your account profile.',
        },
        {
          path: '/security',
          label: 'Security',
          title: 'Security and sign-in',
          description: 'Review identities and account security controls.',
        },
        {
          path: '/sessions',
          label: 'Sessions',
          title: 'Active sessions',
          description: 'Review and revoke KpnAuth sessions.',
        },
        {
          path: '/privacy',
          label: 'Privacy',
          title: 'Privacy controls',
          description: 'Review available export, privacy, and deletion controls.',
        },
        {
          path: '/linked-apps',
          label: 'Linked apps',
          title: 'Linked applications',
          description: 'Review products authorized through KpnAuth.',
        },
        {
          path: '/organizations',
          label: 'Organizations',
          title: 'Organizations',
          description: 'Review organizations and corporations you belong to.',
        },
        {
          path: '/invitations',
          label: 'Invitations',
          title: 'Organization invitations',
          description: 'Accept or decline pending membership invitations.',
        },
        {
          path: '/subscriptions',
          label: 'Subscriptions',
          title: 'Subscriptions',
          description: 'Review subscriptions connected to your organizations.',
        },
      ]}
    />
  );
}
