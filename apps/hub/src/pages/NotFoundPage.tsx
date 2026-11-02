import { Link } from 'react-router-dom';
import { SiteFooter, SiteHeader, usePageMeta } from '../components/SiteChrome';

export function NotFoundPage() {
  usePageMeta('Page not found');
  return (
    <div className="kpn-root pub-page">
      <SiteHeader />
      <main id="main" className="pub-wrap pub-article">
        <h1 className="pub-display pub-display-sm">That page is not here.</h1>
        <p className="pub-lede">
          Try the <Link to="/">home page</Link>, or read <Link to="/about">about KpnSolute</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
