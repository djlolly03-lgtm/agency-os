/**
 * Charts for the boardroom Snapshot view — deliberately simpler than the
 * review/console charts. This page's whole job is "read in ten seconds on
 * a screen-share," so two shapes only: a dual-line spend-vs-revenue trend,
 * and a platform-spend donut. Same print-safe inline-SVG pattern as
 * review-charts.tsx.
 */
import { inrCompact } from "@/lib/format";

export function SnapshotTrend({ points }: {
  points: Array<{ day: string; label: string; spend: number; revenue: number }>;
}) {
  if (points.length < 2) return null;
  const W = 900, H = 220, padL = 42, padR = 10, padT = 16, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(...points.flatMap((p) => [p.spend, p.revenue]), 1);
  const x = (i: number) => padL + (i / (points.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - v / max) * plotH;
  const line = (key: "spend" | "revenue") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => max * f);
  // show every label if few points, else thin them out
  const showEvery = Math.ceil(points.length / 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
      aria-label="Daily spend versus revenue">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1"
            strokeDasharray={i === 0 ? undefined : "3 4"} />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">
            {inrCompact(t)}
          </text>
        </g>
      ))}
      <path d={line("revenue")} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line("spend")} fill="none" stroke="var(--brand-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.day}>
          <circle cx={x(i)} cy={y(p.revenue)} r="3" fill="var(--brand)" />
          <circle cx={x(i)} cy={y(p.spend)} r="3" fill="var(--brand-accent)" />
          {i % showEvery === 0 && (
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function SnapshotSplit({ segments }: {
  segments: Array<{ label: string; value: number; color: string }>;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  const r = 52, c = 70, circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((s) => {
    const frac = s.value / total;
    const dash = frac * circumference;
    const arc = { ...s, frac, dash, dashoffset: -offset };
    offset += dash;
    return arc;
  });
  const lead = arcs[0];

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img"
        aria-label={segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--grid)" strokeWidth="20" />
        {arcs.map((a) => (
          <circle key={a.label} cx={c} cy={c} r={r} fill="none" stroke={a.color} strokeWidth="20"
            strokeDasharray={`${a.dash} ${circumference - a.dash}`} strokeDashoffset={a.dashoffset}
            transform={`rotate(-90 ${c} ${c})`} />
        ))}
        <text x={c} y={c - 4} textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--text-primary)">
          {Math.round((lead.value / total) * 100)}%
        </text>
        <text x={c} y={c + 12} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{lead.label} share</text>
      </svg>
      <div className="flex flex-col gap-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[12.5px]">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-[52px] font-bold" style={{ color: "var(--text-primary)" }}>{s.label}</span>
            <span className="tabular" style={{ color: "var(--text-secondary)" }}>
              {inrCompact(s.value)} · {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0"}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
