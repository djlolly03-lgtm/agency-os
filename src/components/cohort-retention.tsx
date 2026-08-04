import { Explain } from "@/components/explain";
import { SpotlightStage } from "@/components/hero-cinema";
import { AnimatedNumber } from "@/components/motion";
import { inrCompact, num, pct } from "@/lib/format";
import { shortMonth } from "@/lib/periods";
import type { CohortRow } from "@/lib/shopify";

/**
 * Cohort retention grid — "of the customers who first bought in month X, how
 * many bought again 1, 2, 3… months later." Leads with a plain-English
 * headline + the one comparison that matters (best vs worst cohort), then
 * the grid — same lead-with-the-story pattern as the other acts on this page.
 */
export function CohortRetention({ cohorts, maxOffset }: { cohorts: CohortRow[]; maxOffset: number }) {
  if (!cohorts.length) return null;
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  // month-1 retention: the one offset every cohort but the newest has —
  // the fairest single number to compare cohorts against each other
  const withM1 = cohorts.filter((c) => c.retained.length > 1 && c.retained[1] != null);
  const m1Fracs = withM1.map((c) => ({ c, frac: c.retained[1]! / c.size }));
  const avgM1 = m1Fracs.length ? m1Fracs.reduce((a, b) => a + b.frac, 0) / m1Fracs.length : null;
  const best = m1Fracs.length ? [...m1Fracs].sort((a, b) => b.frac - a.frac)[0] : null;
  const worst = m1Fracs.length > 1 ? [...m1Fracs].sort((a, b) => a.frac - b.frac)[0] : null;

  // a cohort's overall stickiness = average retention across all its known months (excl. M0)
  const avgRetention = (c: CohortRow) => {
    const vals = c.retained.slice(1).filter((v): v is number => v != null).map((v) => v / c.size);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const tierColor = (frac: number) => {
    if (avgM1 == null) return "var(--surface-2)";
    if (frac >= avgM1 * 1.25) return "var(--status-good)";
    if (frac >= avgM1 * 0.75) return "var(--brand)";
    return "var(--brand-accent)";
  };
  const tierOpacity = (frac: number) => Math.max(0.16, Math.min(frac * 2.2, 0.92));

  return (
    <SpotlightStage>
      <div className="canvas-dark p-5 md:p-6">
        {/* headline: the single number that matters */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <Explain block math={{
            title: "Average second-purchase rate",
            steps: m1Fracs.map(({ c, frac }) => ({ label: `${shortMonth(c.cohortMonth)} cohort (${num(c.size)} customers)`, value: pct(frac) })),
            formula: avgM1 != null ? `average = ${m1Fracs.map(({ frac }) => pct(frac, 0)).join(" + ")} ÷ ${m1Fracs.length} = ${pct(avgM1)}` : "not enough data yet",
            note: "The % of a signup month's customers who came back and bought again within the following month — the clearest single read on whether the first purchase experience is working.",
            source: "Shopify order export · Sheets → Supabase",
          }}>
            <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Avg. customers who buy again within a month
            </span>
            <div className="hero-number tabular num-gradient mt-1">
              {avgM1 != null ? <><AnimatedNumber value={avgM1} format="pct" /></> : "—"}
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              out of every 100 first-time buyers, about {avgM1 != null ? Math.round(avgM1 * 100) : "—"} come back within a month
            </p>
          </Explain>

          {best && worst && best.c.cohortMonth !== worst.c.cohortMonth && (
            <div className="max-w-sm text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--status-good)" }}>{shortMonth(best.c.cohortMonth)}</strong> buyers stick around
              best — <strong style={{ color: "var(--text-primary)" }}>{pct(best.frac)}</strong> bought again within a month
              {(() => { const ar = avgRetention(best.c); return ar != null ? `, still ${pct(ar)} active on average since` : ""; })()}.{" "}
              <strong style={{ color: "var(--brand-accent)" }}>{shortMonth(worst.c.cohortMonth)}</strong> is the weakest,
              at just <strong style={{ color: "var(--text-primary)" }}>{pct(worst.frac)}</strong>.
            </div>
          )}
        </div>

        {/* the grid */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-separate text-xs" style={{ borderSpacing: "4px" }}>
            <thead>
              <tr>
                <th className="px-2 py-1 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Signed up</th>
                <th className="px-2 py-1 text-right font-semibold" style={{ color: "var(--text-secondary)" }}>Customers</th>
                {offsets.slice(1).map((o) => (
                  <th key={o} className="px-1 py-1 text-center font-semibold" style={{ color: "var(--text-muted)" }}>
                    +{o} mo
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => {
                const isBest = best?.c.cohortMonth === c.cohortMonth;
                const isWorst = worst?.c.cohortMonth === c.cohortMonth;
                return (
                  <tr key={c.cohortMonth}>
                    <td className="whitespace-nowrap rounded-l-md px-2 py-1.5 font-semibold"
                      style={{
                        color: "var(--text-primary)",
                        borderLeft: isBest ? "3px solid var(--status-good)" : isWorst ? "3px solid var(--brand-accent)" : "3px solid transparent",
                      }}>
                      {shortMonth(c.cohortMonth)}
                      {isBest && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--status-good)" }}>stickiest</span>}
                      {isWorst && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--brand-accent)" }}>weakest</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular" style={{ color: "var(--text-secondary)" }}>
                      {num(c.size)}
                    </td>
                    {offsets.slice(1).map((o) => {
                      const retained = c.retained[o];
                      const revenue = c.revenue[o];
                      if (retained == null) return <td key={o} />;
                      const frac = retained / c.size;
                      return (
                        <td key={o} className="rounded-md text-center tabular"
                          style={{ background: tierColor(frac), opacity: 1, minWidth: 52, height: 34,
                            backgroundImage: `linear-gradient(color-mix(in srgb, ${tierColor(frac)} ${Math.round(tierOpacity(frac) * 100)}%, var(--surface-1)), color-mix(in srgb, ${tierColor(frac)} ${Math.round(tierOpacity(frac) * 100)}%, var(--surface-1)))` }}
                          title={`${shortMonth(c.cohortMonth)} cohort, ${o} month${o > 1 ? "s" : ""} later: ${num(retained)} of ${num(c.size)} bought again (${pct(frac)}) · ${inrCompact(revenue ?? 0)} revenue`}>
                          <span className="font-bold" style={{ color: "#04211b" }}>{pct(frac, 0)}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--status-good)" }} /> above average
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--brand)" }} /> around average
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--brand-accent)" }} /> below average
          </span>
          <span>· each row reads left to right: "of the people who bought for the first time this month, this % bought again N months later" · blank = too soon to tell</span>
        </div>
      </div>
    </SpotlightStage>
  );
}
