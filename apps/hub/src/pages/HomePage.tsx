import { Link } from 'react-router-dom';
import { crossAppUrl } from '@kpn/app-runtime';
import { Button, Card } from '@kpn/design-system';
import { RouteMap } from '../components/RouteMap';
import { SiteFooter, SiteHeader, usePageMeta } from '../components/SiteChrome';
import { MISSION, MISSION_DETAIL, PRODUCTS, SHARED_SERVICES, WHAT_WE_ARE } from '../content/site';
import { IS_DEV } from '../env';

export function HomePage() {
  usePageMeta('KpnSolute', `${MISSION} ${MISSION_DETAIL}`);

  return (
    <div className="kpn-root pub-page">
      <SiteHeader />

      <main id="main">
        <section className="pub-hero">
          <div className="pub-hero-text">
            <h1 className="pub-display">{MISSION}</h1>
            <p className="pub-lede">{MISSION_DETAIL}</p>
            {/* Platform is the organization resource manager. Tenant staff do not
                come through here: they sign in inside their own product workspace
                (docs/ROUTE_REGISTRY.md sections 1 and 2). */}
            <div className="pub-actions">
              <a href={crossAppUrl('platform', '/', IS_DEV)} className="kpn-focusable">
                <Button>Log into Platform</Button>
              </a>
              <a href={crossAppUrl('accounts', '/', IS_DEV)} className="kpn-focusable">
                <Button variant="secondary">Manage your account</Button>
              </a>
            </div>
            <p className="pub-hero-link">
              <Link to="/about" className="kpn-focusable">
                What KpnSolute is, and where it is going
              </Link>
            </p>
          </div>
          <div className="pub-hero-art">
            <RouteMap />
          </div>
        </section>

        <section className="pub-band" aria-labelledby="what-heading">
          <div className="pub-wrap pub-two-col">
            <h2 id="what-heading" className="pub-h2">
              What we do
            </h2>
            <div className="pub-prose">
              {WHAT_WE_ARE.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="pub-wrap pub-section" aria-labelledby="products-heading">
          <div className="pub-section-head">
            <h2 id="products-heading" className="pub-h2">
              What we are building
            </h2>
            <Link to="/products" className="kpn-focusable">
              All products
            </Link>
          </div>
          <ul className="pub-rows">
            {PRODUCTS.map((product) => (
              <li key={product.key} className="pub-row">
                <h3 className="pub-row-title">{product.name}</h3>
                <p className="pub-row-body">{product.purpose}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="pub-band" aria-labelledby="platform-heading">
          <div className="pub-wrap">
            <h2 id="platform-heading" className="pub-h2">
              One account for every KpnSolute product.
            </h2>
            <p className="pub-lede pub-lede-narrow">
              Identity, organizations, provisioning, billing, integrations, and automation share one
              secure commercial foundation without erasing each product&apos;s identity.
            </p>
            <div className="pub-grid">
              {SHARED_SERVICES.map((service) => (
                <Card key={service.key} title={service.name} description={service.description}>
                  <a href={crossAppUrl(service.key, '/', IS_DEV)} className="kpn-focusable">
                    Open {service.name} &rarr;
                  </a>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="pub-wrap pub-section pub-closing" aria-labelledby="partners-heading">
          <h2 id="partners-heading" className="pub-h2">
            Work with us
          </h2>
          <p className="pub-lede pub-lede-narrow">
            We build with organizations that want software shaped around how they actually operate.
          </p>
          <p>
            <Link to="/partners" className="kpn-focusable">
              How partnering works
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
