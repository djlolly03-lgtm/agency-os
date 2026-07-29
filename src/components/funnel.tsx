import type { FunnelStage } from "@/lib/queries";
import { pct } from "@/lib/format";

/**
 * Funnel v3 — "skyline" geometry. Every stage is a tower on a shared
 * baseline; heights are log-scaled so late stages stay monumental next to
 * million-scale impressions. Slopes connect the rooflines, so drop-offs
 * read as cliffs. The worst post-click cliff is flagged in orange.
 * CSS-animated (no rAF) — renders in exports and background tabs.
 */
export function Funnel({ stages, title, subtitle, footer }: {
  stages: FunnelStage[]; title?: string; subtitle?: string; footer?: string;
}) {
  const n = stages.length;
  if (n < 2 || stages[0].value <= 0) return null;

  const W = 1000, H = 330;
  const baseline = 282, topPad = 76, barW = 64;
  const Hmax = baseline - topPad;
  const xs = stages.map((_, i) => 70 + (i * (W - 140)) / (n - 1));

  const vals = stages.map((s) => Math.max(s.value, 1));
  const logs = vals.map((v) => Math.log10(v));
  const lmin = Math.min(...logs), lmax = Math.max(...logs);
  const hs = logs.map((l) => Hmax * (0.16 + 0.84 * (lmax === lmin ? 1 : (l - lmin) / (lmax - lmin))));

  const shortNum = (v: number) =>
    v >= 1_00_000 ? `${(v / 1_00_000).toFixed(1)} L`
      : v >= 1_000 ? `${(v / 1_000).toFixed(1)}k`
      : new Intl.NumberFormat("en-IN").format(Math.round(v));

  // worst post-click step = the actionable cliff
  let leakIdx = -1, leakRate = 1;
  for (let i = 2; i < n; i++) {
    const rate = stages[i - 1].value > 0 ? stages[i].value / stages[i - 1].value : 1;
    if (rate < leakRate) { leakRate = rate; leakIdx = i; }
  }

  const connectors = stages.slice(0, -1).map((_, i) => {
    const x1 = xs[i] + barW / 2, x2 = xs[i + 1] - barW / 2;
    const y1 = baseline - hs[i], y2 = baseline - hs[i + 1];
    const c = (x1 + x2) / 2;
    return {
      d: `M ${x1} ${y1} C ${c} ${y1}, ${c} ${y2}, ${x2} ${y2} L ${x2} ${baseline} L ${x1} ${baseline} Z`,
      cx: c,
      pillY: Math.min(y1, y2) - 16,
      rate: stages[i].value > 0 ? stages[i + 1].value / stages[i].value : 0,
      isLeak: i + 1 === leakIdx,
    };
  });

  return (
    <div>
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" style={{ minWidth: 780 }} role="img"
          aria-label={stages.map((s) => `${s.label} ${s.value}`).join(", ")}>
          <defs>
            <linearGradient id="fbar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id="fbar-final" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7ff0d8" />
              <stop offset="100%" stopColor="var(--brand)" />
            </linearGradient>
            <linearGradient id="fslope" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="fslope-leak" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--status-serious)" stopOpacity="0.42" />
              <stop offset="100%" stopColor="var(--status-serious)" stopOpacity="0.07" />
            </linearGradient>
            <filter id="fglow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="var(--brand)" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* baseline */}
          <line x1={40} x2={W - 40} y1={baseline} y2={baseline}
            stroke="var(--border-hairline)" strokeWidth="1.5" />

          {/* slopes between towers */}
          {connectors.map((c, i) => (
            <path key={i} d={c.d} fill={c.isLeak ? "url(#fslope-leak)" : "url(#fslope)"}
              className="funnel-piece" style={{ animationDelay: `${i * 110 + 60}ms` }}>
              <title>{`${stages[i].label} → ${stages[i + 1].label}: ${pct(c.rate)}`}</title>
            </path>
          ))}

          {/* stage towers */}
          {stages.map((s, i) => {
            const last = i === n - 1;
            return (
              <g key={s.key} className="funnel-piece" style={{ animationDelay: `${i * 110}ms` }}>
                <rect x={xs[i] - barW / 2} y={baseline - hs[i]} width={barW} height={hs[i]}
                  rx={10} fill={last ? "url(#fbar-final)" : "url(#fbar)"}
                  filter={last ? "url(#fglow)" : undefined} />
                {/* roofline highlight */}
                <rect x={xs[i] - barW / 2} y={baseline - hs[i]} width={barW} height={3.5} rx={1.75}
                  fill={last ? "#b8fff0" : "color-mix(in srgb, #ffffff 55%, var(--brand))"} opacity={0.9} />
              </g>
            );
          })}

          {/* labels + counts above each tower */}
          {stages.map((s, i) => (
            <g key={s.key} className="funnel-piece" style={{ animationDelay: `${i * 110 + 40}ms` }}
              textAnchor="middle">
              <text x={xs[i]} y={26} fontSize="11.5" fill="var(--text-muted)"
                style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {s.label}
              </text>
              <text x={xs[i]} y={56} fontSize="26" fontWeight="800" fill="var(--text-primary)"
                style={{ fontVariantNumeric: "tabular-nums" }}>
                {shortNum(s.value)}
              </text>
            </g>
          ))}

          {/* conversion pills riding the slopes */}
          {connectors.map((c, i) => {
            const label = pct(c.rate, c.rate < 0.01 ? 2 : 1);
            const w = label.length * 7.5 + 22;
            return (
              <g key={i} className="funnel-piece" style={{ animationDelay: `${i * 110 + 150}ms` }}>
                <rect x={c.cx - w / 2} y={c.pillY - 12} width={w} height={24} rx={12}
                  fill={c.isLeak ? "color-mix(in srgb, var(--status-serious) 22%, var(--surface-1))" : "var(--surface-2)"}
                  stroke={c.isLeak ? "color-mix(in srgb, var(--status-serious) 55%, transparent)" : "var(--border-hairline)"} />
                <text x={c.cx} y={c.pillY + 4.5} fontSize="12" fontWeight="700" textAnchor="middle"
                  fill={c.isLeak ? "var(--status-serious)" : "var(--text-primary)"}
                  style={{ fontVariantNumeric: "tabular-nums" }}>
                  {label}
                </text>
                {c.isLeak && (
                  <text x={c.cx} y={baseline + 22} fontSize="11.5" fontWeight="700" textAnchor="middle"
                    fill="var(--status-serious)">
                    ▼ biggest leak · {pct(1 - leakRate)} lost here
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {footer && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{footer}</p>
      )}
    </div>
  );
}
