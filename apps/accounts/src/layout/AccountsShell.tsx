import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '@kpn/app-runtime';
import { AppShell, Button } from '@kpn/design-system';
import type { NavItem } from '@kpn/design-system';

const NAV_ITEMS: { key: string; label: string; href: string }[] = [
  { key: 'overview', label: 'Overview', href: '/' },
  { key: 'personal-information', label: 'Personal information', href: '/personal-information' },
  { key: 'security', label: 'Security and sign-in', href: '/security' },
  { key: 'sessions', label: 'Sessions and devices', href: '/sessions' },
  { key: 'privacy', label: 'Privacy', href: '/privacy' },
  { key: 'linked-apps', label: 'Linked apps', href: '/linked-apps' },
  { key: 'organizations', label: 'Organizations', href: '/organizations' },
  { key: 'invitations', label: 'Invitations', href: '/invitations' },
  { key: 'subscriptions', label: 'Subscriptions', href: '/subscriptions' },
];

export function AccountsShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useSession();

  const navItems: NavItem[] = NAV_ITEMS.map((item) => ({
    ...item,
    active: location.pathname === item.href,
  }));

  return (
    <AppShell
      productName="Accounts"
      navItems={navItems}
      headerActions={
        <>
          {user ? (
            <span
              style={{ fontSize: 'var(--kpn-font-size-sm)', color: 'var(--kpn-color-text-muted)' }}
            >
              {user.displayName}
            </span>
          ) : null}
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
