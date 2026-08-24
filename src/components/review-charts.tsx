import { shortMonth } from "@/lib/periods";

/**
 * Print-safe chart primitives for the monthly review. Everything is inline
 * SVG on purpose: browsers strip CSS *backgrounds* from print output unless
 * the viewer remembers to tick "background graphics", but SVG shapes are
 * content and always survive into the PDF. Colors ride CSS variables so the
 * on-screen version follows the app theme.
 */

const TXT = { fontFamily: "inherit" } as const;

/** Monthly revenue columns, the selected month lit. */
export function RevenueTrend({ points, selected }: {
  points: Array<{ month: string; value: number }>;
  selected: string;
}) {
  if (points.length < 2) return null;
  const W = 680, H = 150, pad = 4, labelH = 16, valH = 14;
  const max = Math.max(...points.map((p) => p.value), 1);
  const gap = 8;
  const bw = (W - pad * 2 - gap * (points.length - 1)) / points.length;
  const maxIdx = points.reduce((mi, p, i) => (p.value > points[mi].value ? i : mi), 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
      aria-label="Monthly revenue trend">
      {points.map((p, i) => {
        const h = Math.max(4, (p.value / max) * (H - labelH - valH - 6));
        const x = pad + i * (bw + gap);
        const y = H - labelH - h;
        const isSel = p.month === selected;
        const showVal = isSel || i === maxIdx;
        return (
          <g key={p.month}>
            {showVal && (
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="10" fontWeight="800"
                style={{ ...TXT, fill: isSel ? "var(--brand)" : "var(--text-secondary)" }}>
                {inrShort(p.value)}
              </text>
            )}
            <rect x={x} y={y} width={bw} height={h} rx="4"
              style={{ fill: isSel ? "var(--brand)" : "var(--grid)" }} />
            <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="8.5" fontWeight="700"
              style={{ ...TXT, fill: isSel ? "var(--text-primary)" : "var(--text-muted)" }}>
              {shortMonth(p.month).toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Proper waterfall: start column, floating deltas, end column. */
export function Waterfall({ start, steps, end }: {
  start: { label: string; value: number };
  steps: Array<{ label: string; delta: number; color?: string }>;
  end: { label: string; value: number };
}) {
  const W = 680, H = 190, labelH = 18, valH = 16;
  const cums = [start.value];
  for (const s of steps) cums.push(cums[cums.length - 1] + s.delta);
  const lo = Math.min(0, ...cums, end.value);
  const hi = Math.max(...cums, start.value, end.value);
  const span = Math.max(hi - lo, 1);
  const plotH = H - labelH - valH;
  const y = (v: number) => valH + (1 - (v - lo) / span) * plotH;
  const n = steps.length + 2;
  const gap = 26;
  const bw = (W - gap * (n - 1)) / n;
  const x = (i: number) => i * (bw + gap);

  const bars: Array<{ label: string; x: number; top: number; bottom: number; color: string; display: string; connectorY?: number }> = [];
  bars.push({ label: start.label, x: x(0), top: y(start.value), bottom: y(Math.max(0, lo)), color: "var(--grid)", display: inrShort(start.value) });
  steps.forEach((s, i) => {
    const from = cums[i], to = cums[i + 1];
    bars.push({
      label: s.label, x: x(i + 1),
      top: y(Math.max(from, to)), bottom: y(Math.min(from, to)),
      color: s.color ?? (s.delta >= 0 ? "var(--status-good)" : "var(--status-critical)"),
      display: `${s.delta >= 0 ? "+" : "−"}${inrShort(Math.abs(s.delta))}`,
      connectorY: y(from),
    });
  });
  bars.push({ label: end.label, x: x(n - 1), top: y(end.value), bottom: y(Math.max(0, lo)), color: "var(--brand)", display: inrShort(end.value) });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
      aria-label="Revenue change waterfall">
      {bars.map((b, i) => (
        <g key={b.label + i}>
          {b.connectorY != null && i > 0 && (
            <line x1={bars[i - 1].x + bw} y1={b.connectorY} x2={b.x} y2={b.connectorY}
              style={{ stroke: "var(--baseline)" }} strokeDasharray="3 3" strokeWidth="1" />
          )}
          <text x={b.x + bw / 2} y={b.top - 5} textAnchor="middle" fontSize="10.5" fontWeight="800"
            style={{ ...TXT, fill: i === 0 || i === bars.length - 1 ? "var(--text-primary)" : b.color }}>
            {b.display}
          </text>
          <rect x={b.x} y={b.top} width={bw} height={Math.max(3, b.bottom - b.top)} rx="4" style={{ fill: b.color }} />
          <text x={b.x + bw / 2} y={H - 4} textAnchor="middle" fontSize="9" fontWeight="700"
            style={{ ...TXT, fill: "var(--text-muted)" }}>
            {b.label.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Horizontal comparison bars (CAC vs LTV, WhatsApp vs paid, …). */
export function HCompare({ rows }: {
  rows: Array<{ label: string; sub?: string; value: number; display: string; color: string }>;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  const W = 640, rowH = 40, barH = 15;
  const H = rows.length * rowH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
      aria-label="Comparison chart">
      {rows.map((r, i) => {
        const yTop = i * rowH;
        const w = Math.max(6, (r.value / max) * (W - 90));
        return (
          <g key={r.label}>
            <text x="0" y={yTop + 11} fontSize="10" fontWeight="700" style={{ ...TXT, fill: "var(--text-muted)" }}>
              {r.label}{r.sub ? `  ·  ${r.sub}` : ""}
            </text>
            <rect x="0" y={yTop + 17} width={W - 90} height={barH} rx="4" style={{ fill: "var(--grid)" }} />
            <rect x="0" y={yTop + 17} width={w} height={barH} rx="4" style={{ fill: r.color }} />
            <text x={W} y={yTop + 29} textAnchor="end" fontSize="13" fontWeight="800"
              className="tabular" style={{ ...TXT, fill: "var(--text-primary)" }}>
              {r.display}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Column chart for rates (cart decay). value is 0–1. */
export function ColumnChart({ cols }: {
  cols: Array<{ label: string; value: number; display: string; color: string }>;
}) {
  if (!cols.length) return null;
  const W = 680, H = 150, labelH = 16, valH = 14;
  const max = Math.max(...cols.map((c) => c.value), 0.0001);
  const gap = 10;
  const bw = (W - gap * (cols.length - 1)) / cols.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
      aria-label="Rate by month">
      {cols.map((c, i) => {
        const h = Math.max(6, (c.value / max) * (H - labelH - valH - 4));
        const x = i * (bw + gap);
        const y = H - labelH - h;
        return (
          <g key={c.label + i}>
            <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="9.5" fontWeight="800"
              className="tabular" style={{ ...TXT, fill: "var(--text-secondary)" }}>
              {c.display}
            </text>
            <rect x={x} y={y} width={bw} height={h} rx="4" style={{ fill: c.color, opacity: 0.92 }} />
            <text x={x + bw / 2} y={H - 4} textAnchor="middle" fontSize="8.5" fontWeight="700"
              style={{ ...TXT, fill: "var(--text-muted)" }}>
              {c.label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** One proportional stacked bar of the customer base, legend below. */
export function SegmentBar({ segments }: {
  segments: Array<{ label: string; count: number; color: string }>;
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (total <= 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <svg viewBox="0 0 680 26" style={{ width: "100%", height: "auto", display: "block" }} role="img"
        aria-label="Customer base by segment">
        {segments.map((s, i) => {
          // offset = sum of everything before it; computed, never accumulated
          // mid-render (that trips the React compiler's immutability rule)
          const before = segments.slice(0, i).reduce((t, x) => t + x.count, 0);
          const w = (s.count / total) * 680;
          return <rect key={s.label} x={(before / total) * 680} y="0"
            width={Math.max(w - 1.5, 1)} height="26" rx="3" style={{ fill: s.color }} />;
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {segments.map((s) => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "var(--text-secondary)" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            {s.label} <span className="tabular" style={{ color: "var(--text-primary)" }}>{s.count.toLocaleString("en-IN")}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// local formatters (self-contained so the SVG file has no format.ts coupling)
function inrShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (a >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)} L`;
  if (a >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
}
function pctShort(f: number): string {
  return `${(f * 100).toFixed(f * 100 >= 10 ? 0 : 1)}%`;
}
