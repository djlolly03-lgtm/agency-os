import type { CohortHorizon } from "@/lib/shopify";
import { num, pct } from "@/lib/format";
import { shortMonth } from "@/lib/periods";

/**
 * Repeat rate by acquisition month at 30/60/90/180 days — a line chart over
 * the horizons, then the heatmap. Every cohort is measured from its own
 * members' first-order dates, so a customer acquired on the 29th isn't
 * scored on two days of opportunity.
 *
 * The em-dash cells are load-bearing: a cohort that hasn't aged into a
 * horizon yet returns null, and rendering that as 0% would invent a
 * collapse in retention that never happened.
 */
const HORIZON_KEYS = ["r30", "r60", "r90", "r180"] as const;
const HORIZON_LABEL = { r30: "30 days", r60: "60 days", r90: "90 days", r180: "180 days" };

export function CohortHorizons({ cohorts }: { cohorts: CohortHorizon[] }) {
  const usable = cohorts.filter((c) => c.size >= 20);
  if (usable.length < 3) return null;

  // ramp a value across the sage-equivalent (our brand teal) by magnitude
  const max = Math.max(...usable.flatMap((c) => HORIZON_KEYS.map((k) => c[k] ?? 0)), 0.01);
  const tint = (v: number) => Math.round(Math.max(0.12, Math.min(v / max, 1)) * 100);

  // line chart geometry
  const W = 680, H = 150, padL = 4, padB = 18, padT = 8;
  const plotH = H - padB - padT;
  const x = (i: number) => padL + (i / Math.max(usable.length - 1, 1)) * (W - padL * 2);
  const y = (v: number) => padT + (1 - v / max) * plotH;
  const series = [
    { key: "r30" as const, color: "var(--brand)" },
    { key: "r60" as const, color: "var(--series-1)" },
    { key: "r90" as const, color: "var(--brand-accent)" },
  ];

  // trend excludes the censored first cohort — it carries pre-export loyalty,
  // so measuring from it turns a genuine improvement into a fake decline
  const trendable = usable.filter((c) => !c.censored && c.r30 != null);
  const first = trendable[0], last = trendable[trendable.length - 1];
  const drift = first && last && first !== last ? last.r30! - first.r30! : null;

  return (
    <div className="flex flex-col gap-4">
      {/* line chart */}
      <div className="rounded-2xl border px-5 py-4" style={{ borderColor: "var(--border-hairline)" }}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
            Repeat rate by acquisition month
          </span>
          <span className="flex flex-wrap gap-3">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
                <span aria-hidden style={{ width: 9, height: 3, borderRadius: 2, background: s.color, display: "inline-block" }} />
                {HORIZON_LABEL[s.key]}
              </span>
            ))}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
          aria-label="Repeat rate by acquisition month at 30, 60 and 90 days">
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={padL} x2={W - padL} y1={y(max * g)} y2={y(max * g)}
              style={{ stroke: "var(--grid)" }} strokeWidth="1" />
          ))}
          {series.map((s) => {
            const pts = usable.map((c, i) => ({ i, v: c[s.key] })).filter((p) => p.v != null) as Array<{ i: number; v: number }>;
            if (pts.length < 2) return null;
            const d = pts.map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
            return (
              <g key={s.key}>
                <path d={d} fill="none" style={{ stroke: s.color }} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="3" style={{ fill: s.color }} />)}
              </g>
            );
          })}
          {usable.map((c, i) => (
            <text key={c.month} x={x(i)} y={H - 4} textAnchor="middle" fontSize="8.5" fontWeight="700"
              style={{ fill: "var(--text-muted)" }}>
              {shortMonth(c.month).split(" ")[0].toUpperCase()}
            </text>
          ))}
        </svg>
      </div>

      {/* heatmap */}
      <div style={{ overflowX: "auto" }}>
        <table className="review-table" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th>Acquired</th><th style={{ textAlign: "right" }}>Cohort</th>
              {HORIZON_KEYS.map((k) => <th key={k} style={{ textAlign: "center" }}>{HORIZON_LABEL[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {usable.map((c) => (
              <tr key={c.month}>
                <td style={{ fontWeight: 600 }}>
                  {shortMonth(c.month)}
                  {c.censored && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      incl. pre-data customers
                    </span>
                  )}
                </td>
                <td className="tabular" style={{ textAlign: "right", color: "var(--text-secondary)" }}>{num(c.size)}</td>
                {HORIZON_KEYS.map((k) => {
                  const v = c[k];
                  return (
                    <td key={k} style={{ textAlign: "center" }}>
                      {v == null ? (
                        <span className="tabular" style={{ opacity: 0.35 }}>—</span>
                      ) : (
                        <span className="tabular inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{
                            background: `color-mix(in srgb, var(--brand) ${tint(v)}%, transparent)`,
                            color: tint(v) > 55 ? "#ffffff" : "var(--text-primary)",
                          }}>
                          {pct(v, 0)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
        {drift != null && Math.abs(drift) >= 0.01 ? (
          <>
            30-day repeat has moved <strong className="tabular">{drift > 0 ? "+" : "−"}{Math.abs(drift * 100).toFixed(0)} points</strong>{" "}
            from the {shortMonth(first!.month)} cohort to {shortMonth(last!.month)} — {drift > 0
              ? "newer customers are coming back faster than older ones did, which is the shape you want while acquisition scales."
              : "each new intake is returning a little less than the one before, so acquisition is filling a funnel that holds slightly worse every month."}
          </>
        ) : (
          <>30-day repeat has held roughly flat across cohorts — acquisition quality is stable, and the lever is retention, not targeting.</>
        )}{" "}
        Em dashes mark cohorts too young to have completed that window; they are not zeros.
        {usable.some((c) => c.censored) && (
          <> The {shortMonth(usable[0].month)} row sits outside the trend: the order history begins there,
          so it counts customers who were already regulars as if they were new.</>
        )}
      </p>
    </div>
  );
}
