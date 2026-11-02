import { SiteFooter, SiteHeader, usePageMeta } from '../components/SiteChrome';
import { PRODUCTS } from '../content/site';

export function ProductsPage() {
  usePageMeta('Products', 'KpnCompute, Scena, Tradora, and LunchVoice: what each one is for.');

  return (
    <div className="kpn-root pub-page">
      <SiteHeader />
      <main id="main" className="pub-wrap pub-article">
        <h1 className="pub-display pub-display-sm">Products</h1>
        <p className="pub-lede">
          Four products on one shared foundation. They are at different stages, so each one is
          described by what it is for. We publish a capability only once it works.
        </p>

        <ul className="pub-rows pub-rows-large">
          {PRODUCTS.map((product) => (
            <li key={product.key} className="pub-row pub-row-product" id={product.key}>
              <h2 className="pub-row-title">{product.name}</h2>
              <div>
                <p className="pub-row-body">{product.purpose}</p>
                <p className="pub-row-meta">
                  <strong>Made for:</strong> {product.audience}
                </p>
                {product.note ? <p className="pub-row-meta">{product.note}</p> : null}
                {product.href ? (
                  <p className="pub-row-meta">
                    <a href={product.href} className="kpn-focusable">
                      Visit {product.name}
                    </a>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
