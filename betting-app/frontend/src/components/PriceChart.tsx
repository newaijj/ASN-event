import type { Presentation, PricePoint } from "../types";

// Cycled by presentation index - distinct, readable against the dark
// background. If there are more presentations than colors, colors repeat.
const PALETTE = [
  "#5b8cff",
  "#8b6cff",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#22d3ee",
  "#f472b6",
  "#a3e635",
];

const WIDTH = 600;
const HEIGHT = 200;
const PAD = { top: 10, right: 10, bottom: 8, left: 34 };

/**
 * Live multi-line chart of every presentation's implied odds over time.
 * Reads straight from PublicState.priceHistory, which the backend keeps
 * appending to for the whole lifetime of the room (one point on the initial
 * presentation set, one per bet) - it is never cleared on a phase change,
 * only on a host room reset. Rendering this at the App level (rather than
 * inside any one screen) is what makes it "persist" visually across
 * BETTING_OPEN -> VOTING_OPEN -> RESOLVED without any extra plumbing.
 */
export default function PriceChart({
  presentations,
  priceHistory,
}: {
  presentations: Presentation[];
  priceHistory: PricePoint[];
}) {
  if (presentations.length === 0 || priceHistory.length === 0) return null;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const tMin = priceHistory[0].t;
  const tMax = priceHistory[priceHistory.length - 1].t;
  const tSpan = Math.max(tMax - tMin, 1);

  const x = (t: number) => PAD.left + ((t - tMin) / tSpan) * innerW;
  const y = (p: number) => PAD.top + (1 - p) * innerH;

  const lines = presentations.map((pres, i) => {
    const color = PALETTE[i % PALETTE.length];
    const d = priceHistory
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${x(pt.t).toFixed(1)},${y(pt.prices[i] ?? 0).toFixed(1)}`)
      .join(" ");
    return { id: pres.id, name: pres.name, color, d };
  });

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    y: PAD.top + (1 - frac) * innerH,
    label: `${Math.round(frac * 100)}%`,
  }));

  const onlyOnePoint = priceHistory.length === 1;

  return (
    <div className="card price-chart-card">
      <h2>Live odds</h2>
      <svg className="price-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        {gridLines.map((g) => (
          <g key={g.label}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={g.y} y2={g.y} className="price-chart-grid" />
            <text
              x={PAD.left - 6}
              y={g.y}
              className="price-chart-axis-label"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {g.label}
            </text>
          </g>
        ))}
        {lines.map((line, i) => (
          <path key={line.id} d={line.d} fill="none" stroke={line.color} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {onlyOnePoint &&
          lines.map((line, i) => (
            <circle
              key={line.id}
              cx={x(priceHistory[0].t)}
              cy={y(priceHistory[0].prices[i] ?? 0)}
              r={3}
              fill={line.color}
            />
          ))}
      </svg>
      {onlyOnePoint && <p className="muted price-chart-waiting">Will start moving once the first bet is placed.</p>}
      <div className="price-chart-legend">
        {lines.map((line) => (
          <span key={line.id} className="price-chart-legend-item">
            <span className="price-chart-dot" style={{ background: line.color }} />
            {line.name}
          </span>
        ))}
      </div>
    </div>
  );
}
