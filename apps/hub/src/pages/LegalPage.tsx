import { SiteFooter, SiteHeader, usePageMeta } from '../components/SiteChrome';
import { LEGAL_UPDATED, PRIVACY, TERMS, type LegalDoc } from '../content/legal';
import { CONTACT_EMAIL } from '../env';

function LegalDocument({ doc }: { doc: LegalDoc }) {
  usePageMeta(doc.title, doc.description);
  return (
    <div className="kpn-root pub-page">
      <SiteHeader />
      <main id="main" className="pub-wrap pub-article pub-legal">
        <h1 className="pub-display pub-display-sm">{doc.title}</h1>
        <p className="pub-legal-date">Last updated {LEGAL_UPDATED}</p>
        <p className="pub-lede">{doc.intro}</p>

        <nav aria-label="On this page" className="pub-legal-toc">
          <ul>
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="kpn-focusable">
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {doc.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-h`}
            className="pub-legal-section"
          >
            <h2 id={`${section.id}-h`} className="pub-h2">
              {section.heading}
            </h2>
            <div className="pub-prose">
              {section.blocks.map((block, index) =>
                'p' in block ? (
                  <p key={index}>{block.p}</p>
                ) : (
                  <ul key={index}>
                    {block.ul.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
              {section.contact ? (
                <p>
                  {CONTACT_EMAIL ? (
                    <a href={`mailto:${CONTACT_EMAIL}`} className="kpn-focusable">
                      {CONTACT_EMAIL}
                    </a>
                  ) : (
                    'Contact details are published on kpnsolute.com.'
                  )}
                </p>
              ) : null}
            </div>
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}

export const PrivacyPage = () => <LegalDocument doc={PRIVACY} />;
export const TermsPage = () => <LegalDocument doc={TERMS} />;
