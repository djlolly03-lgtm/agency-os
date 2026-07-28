import type { FunnelStage } from "@/lib/queries";
import { inrCompact, pct } from "@/lib/format";

/**
 * Flow funnel — one continuous tapering ribbon, drawn in SVG.
 * Curved necks between stages carry conversion pills; the biggest
 * post-click leak is auto-flagged. CSS-animated (no JS/rAF), so it
 * renders correctly in exports, prints and background tabs.
 */
export function Funnel({ stages, title, subtitle, footer }: {
  stages: FunnelStage[]; title?: string; subtitle?: string; footer?: string;
}) {
  const n = stages.length;
  if (n < 2 || stages[0].value <= 0) return null;

  const W = 1000, H = 316;
  const padX = 78, labelH = 88, flowH = 176;
  const cy = labelH + flowH / 2;
  const first = stages[0].value;
  const xs = stages.map((_, i) => padX + (i * (W - 2 * padX)) / (n - 1));
  const hs = stages.map((s) => Math.max(10, Math.sqrt(s.value / first) * flowH));

  const shortNum = (v: number) =>
    v >= 1_00_000 ? `${(v / 1_00_000).toFixed(1)} L`
      : v >= 1_000 ? `${(v / 1_000).toFixed(1)}k`
      : new Intl.NumberFormat("en-IN").format(Math.round(v));

  // biggest actionable leak = worst step conversion after the click stage
  let leakIdx = -1, leakRate = 1;
  for (let i = 2; i < n; i++) {
    const rate = stages[i - 1].value > 0 ? stages[i].value / stages[i - 1].value : 1;
    if (rate < leakRate) { leakRate = rate; leakIdx = i; }
  }

  const ribbons = stages.slice(0, -1).map((_, i) => {
    const x1 = xs[i], x2 = xs[i + 1], c = (x1 + x2) / 2;
    const t1 = cy - hs[i] / 2, b1 = cy + hs[i] / 2;
    const t2 = cy - hs[i + 1] / 2, b2 = cy + hs[i + 1] / 2;
    return {
      d: `M ${x1} ${t1} C ${c} ${t1}, ${c} ${t2}, ${x2} ${t2} L ${x2} ${b2} C ${c} ${b2}, ${c} ${b1}, ${x1} ${b1} Z`,
      cx: c,
      rate: stages[i].value > 0 ? stages[i + 1].value / stages[i].value : 0,
      thin: Math.min(hs[i], hs[i + 1]) < 34,
    };
  });

  return (
    <div>
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" style={{ minWidth: 760 }} role="img"
          aria-label={stages.map((s) => `${s.label} ${s.value}`).join(", ")}>
          <defs>
            {ribbons.map((_, i) => (
              <linearGradient key={i} id={`fr-${i}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.22 + (i / (n - 1)) * 0.5} />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.22 + ((i + 1) / (n - 1)) * 0.5} />
              </linearGradient>
            ))}
            <filter id="fglow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="var(--brand)" floodOpacity="0.55" />
            </filter>
            <filter id="fsoft" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000000" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* ribbons */}
          {ribbons.map((r, i) => (
            <path key={i} d={r.d} fill={`url(#fr-${i})`} filter="url(#fsoft)"
              className="funnel-piece funnel-ribbon" style={{ animationDelay: `${i * 110}ms` }}>
              <title>{`${stages[i].label} → ${stages[i + 1].label}: ${pct(r.rate)}`}</title>
            </path>
          ))}

          {/* stage nodes */}
          {stages.map((s, i) => {
            const last = i === n - 1;
            return (
              <rect key={s.key}
                x={xs[i] - (last ? 6 : 3.5)} y={cy - hs[i] / 2 - (last ? 4 : 0)}
                width={last ? 12 : 7} height={hs[i] + (last ? 8 : 0)} rx={last ? 6 : 3.5}
                fill={last ? "var(--brand)" : "color-mix(in srgb, var(--brand) 65%, var(--surface-1))"}
                filter={last ? "url(#fglow)" : undefined}
                className="funnel-piece" style={{ animationDelay: `${i * 110}ms` }}
              />
            );
          })}

          {/* labels + counts + share-of-impressions */}
          {stages.map((s, i) => (
            <g key={s.key} className="funnel-piece" style={{ animationDelay: `${i * 110 + 60}ms` }}
              textAnchor="middle">
              <text x={xs[i]} y={22} fontSize="12" fill="var(--text-muted)"
                style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {s.label}
              </text>
              <text x={xs[i]} y={48} fontSize="22" fontWeight="700" fill="var(--text-primary)"
                style={{ fontVariantNumeric: "tabular-nums" }}>
                {shortNum(s.value)}
              </text>
              <text x={xs[i]} y={66} fontSize="11" fill="var(--text-muted)"
                style={{ fontVariantNumeric: "tabular-nums" }}>
                {i === 0 ? "100%" : pct(s.value / first, s.value / first < 0.01 ? 2 : 1)} of impressions
              </text>
            </g>
          ))}

          {/* conversion pills at the necks */}
          {ribbons.map((r, i) => {
            const y = r.thin ? cy - 26 : cy;
            const label = pct(r.rate, r.rate < 0.01 ? 2 : 1);
            const w = label.length * 7 + 18;
            return (
              <g key={i} className="funnel-piece" style={{ animationDelay: `${i * 110 + 140}ms` }}>
                <rect x={r.cx - w / 2} y={y - 11} width={w} height={22} rx={11}
                  fill="var(--surface-1)" stroke="var(--border-hairline)" />
                <text x={r.cx} y={y + 4} fontSize="11.5" fontWeight="600" textAnchor="middle"
                  fill={i + 1 === leakIdx ? "var(--status-serious)" : "var(--text-primary)"}
                  style={{ fontVariantNumeric: "tabular-nums" }}>
                  {label}
                </text>
              </g>
            );
          })}

          {/* biggest-leak flag */}
          {leakIdx > 0 && (
            <g className="funnel-piece" style={{ animationDelay: `${n * 110 + 200}ms` }} textAnchor="middle">
              <text x={(xs[leakIdx - 1] + xs[leakIdx]) / 2} y={cy + flowH / 2 + 30}
                fontSize="11.5" fontWeight="600" fill="var(--status-serious)">
                ▼ biggest leak — {pct(1 - leakRate)} drop here
              </text>
            </g>
          )}
        </svg>
      </div>
      {footer && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{footer}</p>
      )}
    </div>
  );
}
