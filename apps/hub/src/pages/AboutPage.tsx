import { SiteFooter, SiteHeader, usePageMeta } from '../components/SiteChrome';
import { GOALS, MISSION, MISSION_DETAIL, PRINCIPLES, VISION, WHAT_WE_ARE } from '../content/site';

export function AboutPage() {
  usePageMeta(
    'About',
    `What KpnSolute is, what we are working toward, and how we work. ${MISSION}`,
  );

  return (
    <div className="kpn-root pub-page">
      <SiteHeader />
      <main id="main" className="pub-wrap pub-article">
        <h1 className="pub-display pub-display-sm">About KpnSolute</h1>
        <p className="pub-lede">{MISSION_DETAIL}</p>

        <section aria-labelledby="what-heading" className="pub-article-section">
          <h2 id="what-heading" className="pub-h2">
            What KpnSolute is
          </h2>
          <div className="pub-prose">
            {WHAT_WE_ARE.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        <section aria-labelledby="goals-heading" className="pub-article-section">
          <h2 id="goals-heading" className="pub-h2">
            Our goals
          </h2>
          <ul className="pub-rows">
            {GOALS.map((goal) => (
              <li key={goal.title} className="pub-row">
                <h3 className="pub-row-title">{goal.title}</h3>
                <p className="pub-row-body">{goal.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="vision-heading" className="pub-article-section pub-vision">
          <h2 id="vision-heading" className="pub-h2">
            Our vision
          </h2>
          <p className="pub-pull">{VISION.headline}</p>
          <div className="pub-prose">
            {VISION.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        <section aria-labelledby="principles-heading" className="pub-article-section">
          <h2 id="principles-heading" className="pub-h2">
            How we work
          </h2>
          <ul className="pub-rows">
            {PRINCIPLES.map((principle) => (
              <li key={principle.title} className="pub-row">
                <h3 className="pub-row-title">{principle.title}</h3>
                <p className="pub-row-body">{principle.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="pub-closing-line">{MISSION}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
