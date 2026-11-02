import { SiteFooter, SiteHeader, usePageMeta } from '../components/SiteChrome';
import { PARTNER_PATHS, PARTNERS } from '../content/site';
import { CONTACT_EMAIL } from '../env';

export function PartnersPage() {
  usePageMeta('Partners', 'How to work with KpnSolute, and who we work with.');

  return (
    <div className="kpn-root pub-page">
      <SiteHeader />
      <main id="main" className="pub-wrap pub-article">
        <h1 className="pub-display pub-display-sm">Partners</h1>
        <p className="pub-lede">
          We work with organizations that want software shaped around how they actually operate.
          Partners keep ownership of their own materials, and we use only what the work needs.
        </p>

        <section aria-labelledby="paths-heading" className="pub-article-section">
          <h2 id="paths-heading" className="pub-h2">
            Ways to work together
          </h2>
          <ul className="pub-rows">
            {PARTNER_PATHS.map((path) => (
              <li key={path.title} className="pub-row">
                <h3 className="pub-row-title">{path.title}</h3>
                <p className="pub-row-body">{path.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="current-heading" className="pub-article-section">
          <h2 id="current-heading" className="pub-h2">
            Who we work with
          </h2>
          {PARTNERS.length > 0 ? (
            <ul className="pub-rows">
              {PARTNERS.map((partner) => (
                <li key={partner.name} className="pub-row">
                  <h3 className="pub-row-title">
                    {partner.href ? (
                      <a href={partner.href} className="kpn-focusable">
                        {partner.name}
                      </a>
                    ) : (
                      partner.name
                    )}
                  </h3>
                  <p className="pub-row-body">{partner.relationship}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pub-prose">
              We will list partners here once each relationship is in place and the partner has
              agreed to be named.
            </p>
          )}
        </section>

        <section aria-labelledby="contact-heading" className="pub-article-section">
          <h2 id="contact-heading" className="pub-h2">
            Start a conversation
          </h2>
          {CONTACT_EMAIL ? (
            <p className="pub-prose">
              Tell us what you are trying to do.{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Partnering%20with%20KpnSolute`}
                className="kpn-focusable"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          ) : (
            <p className="pub-prose">Partner enquiries will open here soon.</p>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
