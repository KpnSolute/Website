import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { crossAppUrl, useSession } from '@kpn/app-runtime';
import { Button } from '@kpn/design-system';
import { IS_DEV } from '../env';
import { Logo } from './Logo';

/** Sets the tab title (and description) for the current page. */
export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    document.title = title === 'KpnSolute' ? title : `${title} · KpnSolute`;
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    }
  }, [title, description]);
}

const NAV = [
  { to: '/about', label: 'About' },
  { to: '/products', label: 'Products' },
  { to: '/partners', label: 'Partners' },
];

export function SiteHeader() {
  const { status, user, signOut } = useSession();
  return (
    <header className="pub-header">
      <a href="#main" className="pub-skip kpn-focusable">
        Skip to content
      </a>
      <div className="pub-header-inner">
        <Link to="/" className="pub-logo kpn-focusable" aria-label="KpnSolute home">
          <Logo height={48} />
        </Link>
        <nav aria-label="Main" className="pub-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `pub-nav-link kpn-focusable${isActive ? ' is-active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="pub-header-actions">
          {status === 'signed-in' && user ? (
            <>
              <a href={crossAppUrl('accounts', '/', IS_DEV)} className="pub-nav-link kpn-focusable">
                {user.displayName}
              </a>
              <Button variant="secondary" onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <a href={crossAppUrl('platform', '/', IS_DEV)} className="kpn-focusable">
              <Button>Log into Platform</Button>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="pub-footer">
      <div className="pub-footer-inner">
        <div>
          <Logo height={34} className="pub-footer-logo" />
          <p className="pub-footer-line">Keeping People Navigated.</p>
        </div>
        <nav aria-label="Footer" className="pub-footer-nav">
          <Link to="/about">About</Link>
          <Link to="/products">Products</Link>
          <Link to="/partners">Partners</Link>
          <a href={crossAppUrl('accounts', '/', IS_DEV)}>Accounts</a>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </div>
      <p className="pub-footer-legal">KpnSolute. All rights reserved.</p>
    </footer>
  );
}
