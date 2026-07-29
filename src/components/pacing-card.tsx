import type { PacingMetric } from "@/lib/queries";
import { inrCompact, num, monthLabel } from "@/lib/format";
import { Explain } from "@/components/explain";

const LABEL: Record<PacingMetric["metric"], string> = {
  revenue: "Revenue", spend: "Spend", orders: "Orders",
};

function fmt(metric: PacingMetric["metric"], v: number) {
  return metric === "orders" ? num(v) : inrCompact(v);
}

/** Month pacing: progress vs goal, expected-by-today marker, run-rate projection. */
export function PacingCard({ asOf, metrics }: { asOf: string; metrics: PacingMetric[] }) {
  const monthName = monthLabel(asOf.slice(0, 7));
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Goals &amp; pacing — {monthName}</h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          day {metrics[0]?.daysElapsed}/{metrics[0]?.daysInMonth} · │ = expected today · ◇ = projected month-end
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((m) => {
          const pct = m.goal > 0 ? Math.min(1, m.actualMtd / m.goal) : 0;
          const expectedPct = m.goal > 0 ? Math.min(1, m.expectedByToday / m.goal) : 0;
          // spend pacing is informational; revenue/orders behind-pace is the problem case
          const behind = m.paceRatio < 0.93 && m.metric !== "spend";
          const ahead = m.paceRatio >= 1.05 && m.metric !== "spend";
          const projShort = m.projected < m.goal;
          return (
            <Explain key={m.metric} block math={{
              title: `${LABEL[m.metric]} pacing · ${monthName}`,
              steps: [
                { label: `Monthly goal${m.goalIsDefault ? " (default: last month +25%)" : ""}`, value: fmt(m.metric, m.goal) },
                { label: `Day of month`, value: `${m.daysElapsed} of ${m.daysInMonth}` },
                { label: `Expected by today = goal × ${m.daysElapsed}/${m.daysInMonth}`, value: fmt(m.metric, m.expectedByToday) },
                { label: `Actual month-to-date`, value: fmt(m.metric, m.actualMtd) },
                { label: `Trailing-7-day daily average × ${m.daysInMonth - m.daysElapsed} days left, added to MTD`, value: fmt(m.metric, m.projected) },
              ],
              formula: `pace = ${fmt(m.metric, m.actualMtd)} ÷ ${fmt(m.metric, m.expectedByToday)} = ${Math.round(m.paceRatio * 100)}% · projection lands at ${m.goal > 0 ? Math.round((m.projected / m.goal) * 100) : 0}% of goal`,
              note: m.goalIsDefault ? "No explicit goal set — set real targets on the Internal page." : undefined,
              source: "Platform daily exports + goals table · Sheets → Supabase",
            }}>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {LABEL[m.metric]}
                </span>
                <span className="text-xs tabular" style={{ color: "var(--text-secondary)" }}>
                  goal {fmt(m.metric, m.goal)}{m.goalIsDefault ? "*" : ""}
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular">
                {fmt(m.metric, m.actualMtd)}
                <span className="ml-2 text-xs font-normal" style={{
                  color: m.metric === "spend" ? "var(--text-secondary)" : behind ? "var(--status-critical)" : ahead ? "var(--delta-good)" : "var(--text-secondary)",
                }}>
                  {m.metric === "spend" ? `${Math.round(m.paceRatio * 100)}% of pace` :
                    behind ? `▼ ${Math.round((1 - m.paceRatio) * 100)}% behind pace` :
                    ahead ? `▲ ${Math.round((m.paceRatio - 1) * 100)}% ahead of pace` : "on pace"}
                </span>
              </div>
              {/* bold meter: fill + expected tick + projected marker */}
              <div className="relative mt-2 h-7 w-full rounded-lg" style={{ background: "var(--grid)" }}>
                <div className="seg-grow flex h-full items-center overflow-hidden rounded-lg px-2"
                  style={{
                    ["--w" as string]: `${pct * 100}%`,
                    background: m.metric === "spend" ? "var(--series-1)" : behind ? "var(--status-serious)" : "var(--brand)",
                  }}>
                  {pct > 0.18 && (
                    <span className="text-[11px] font-bold text-white tabular">{Math.round((m.actualMtd / m.goal) * 100)}%</span>
                  )}
                </div>
                {/* expected-by-today tick */}
                <div className="absolute top-0 h-full w-[2px]"
                  style={{ left: `min(${(expectedPct * 100).toFixed(1)}%, calc(100% - 2px))`, background: "var(--text-primary)", opacity: 0.6 }}
                  title="expected by today" />
                {/* projected marker */}
                <div className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 rounded-[2px] border-2"
                  style={{
                    left: `min(calc(${Math.min(100, (m.projected / m.goal) * 100).toFixed(1)}% - 5px), calc(100% - 12px))`,
                    borderColor: projShort && m.metric !== "spend" ? "var(--status-critical)" : "var(--text-secondary)",
                    background: "var(--surface-1)",
                  }}
                  title="projected month-end" />
              </div>
              <div className="mt-1.5 text-xs tabular" style={{ color: "var(--text-secondary)" }}>
                projected {fmt(m.metric, m.projected)}
                <span style={{ color: projShort && m.metric !== "spend" ? "var(--status-critical)" : "var(--text-muted)" }}>
                  {" "}({m.goal > 0 ? Math.round((m.projected / m.goal) * 100) : 0}% of goal)
                </span>
              </div>
            </Explain>
          );
        })}
      </div>
      {metrics.some((m) => m.goalIsDefault) && (
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          * default goal (last month +25%) — set real targets on the Internal page.
        </p>
      )}
    </div>
  );
}
