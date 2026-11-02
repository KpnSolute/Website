import { PRODUCTS } from '../content/site';

/**
 * One account, many products: a single line leaves "you" and branches to each
 * product. It is the one memorable element of the site; everything else stays
 * quiet. The lines draw in once on load and the motion is off under
 * prefers-reduced-motion (see site.css).
 */
const W = 496;
const H = 340;
const START = { x: 166, y: H / 2 };
const ROWS = PRODUCTS.map((_, i) => 48 + i * ((H - 96) / (PRODUCTS.length - 1)));
const END_X = 338;

export function RouteMap() {
  return (
    <svg
      className="pub-routemap"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`One KpnSolute account connects ${PRODUCTS.map((p) => p.name).join(', ')}.`}
    >
      {ROWS.map((y, i) => {
        const midX = 250;
        const d = `M ${START.x} ${START.y} C ${midX} ${START.y}, ${midX} ${y}, ${END_X} ${y}`;
        return (
          <path
            key={PRODUCTS[i]!.key}
            d={d}
            className="pub-route"
            style={{ animationDelay: `${i * 120}ms` }}
            pathLength={1}
          />
        );
      })}
      <circle cx={START.x} cy={START.y} r={16} className="pub-node-start" />
      <text
        x={START.x - 26}
        y={START.y + 6}
        textAnchor="end"
        className="pub-map-label pub-map-label-strong"
      >
        Your account
      </text>
      {ROWS.map((y, i) => (
        <g key={PRODUCTS[i]!.key}>
          <circle cx={END_X} cy={y} r={7} className="pub-node" />
          <text x={END_X + 18} y={y + 6} className="pub-map-label">
            {PRODUCTS[i]!.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
