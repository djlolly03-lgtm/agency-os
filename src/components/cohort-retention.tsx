import { Explain } from "@/components/explain";
import { SpotlightStage } from "@/components/hero-cinema";
import { inrCompact, num, pct } from "@/lib/format";
import { shortMonth } from "@/lib/periods";
import type { CohortRow } from "@/lib/shopify";

/**
 * Cohort retention grid — "of the customers who first bought in month X, how
 * many bought again 1, 2, 3… months later." Classic e-comm cohort table,
 * built from the real Shopify order history: rows = signup month, columns =
 * months since signup, cell = % of that cohort still active.
 */
export function CohortRetention({ cohorts, maxOffset }: { cohorts: CohortRow[]; maxOffset: number }) {
  if (!cohorts.length) return null;
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  // month-1 retention average across cohorts that have had a chance to show it
  const m1s = cohorts.filter((c) => c.retained.length > 1).map((c) => c.retained[1]! / c.size);
  const avgM1 = m1s.length ? m1s.reduce((a, b) => a + b, 0) / m1s.length : null;

  const colorFor = (frac: number) =>
    `color-mix(in srgb, var(--brand) ${Math.round(Math.min(frac, 1) * 85)}%, var(--surface-1))`;

  return (
    <SpotlightStage>
      <div className="canvas-dark p-5 md:p-6">
        <Explain block math={{
          title: "How to read the cohort grid",
          steps: [
            { label: "Row", value: "the month a customer made their FIRST-EVER purchase" },
            { label: "Column M0, M1, M2…", value: "months since that first purchase" },
            { label: "Cell", value: "% of that cohort who placed another order in that month" },
            ...(avgM1 != null ? [{ label: "Average M1 retention (across mature cohorts)", value: pct(avgM1) }] : []),
          ],
          formula: "retention(cohort, offset) = customers from that cohort who ordered at offset months later ÷ cohort size",
          note: "The newest cohorts haven't had time to show later months yet — those cells are simply blank, not zero.",
          source: "Shopify order export · Sheets → Supabase",
        }}>
          <div className="overflow-x-auto">
            <table className="w-full border-separate text-xs" style={{ borderSpacing: "3px" }}>
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>Cohort</th>
                  <th className="px-2 py-1 text-right font-semibold" style={{ color: "var(--text-secondary)" }}>Size</th>
                  {offsets.map((o) => (
                    <th key={o} className="px-1 py-1 text-center font-semibold" style={{ color: "var(--text-muted)" }}>
                      M{o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohortMonth}>
                    <td className="whitespace-nowrap px-2 py-1 font-semibold" style={{ color: "var(--text-primary)" }}>
                      {shortMonth(c.cohortMonth)}
                    </td>
                    <td className="px-2 py-1 text-right tabular" style={{ color: "var(--text-secondary)" }}>
                      {num(c.size)}
                    </td>
                    {offsets.map((o) => {
                      const retained = c.retained[o];
                      const revenue = c.revenue[o];
                      if (retained == null) return <td key={o} />;
                      const frac = retained / c.size;
                      return (
                        <td key={o} className="rounded-md text-center tabular"
                          style={{ background: colorFor(frac), minWidth: 44, height: 30 }}
                          title={`${shortMonth(c.cohortMonth)} cohort, M${o}: ${num(retained)} of ${num(c.size)} bought again (${pct(frac)}) · ${inrCompact(revenue ?? 0)} revenue`}>
                          <span className="font-bold" style={{ color: frac > 0.35 ? "#04211b" : "var(--text-primary)" }}>
                            {o === 0 ? "—" : pct(frac, 0)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Explain>
        <p className="mt-3 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          Darker = more of that cohort came back. M0 is always the signup month itself (—, not a repeat).
          {avgM1 != null && ` On average, ${pct(avgM1)} of a cohort places a second order within the following month.`}
        </p>
      </div>
    </SpotlightStage>
  );
}
