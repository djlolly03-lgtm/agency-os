import Link from "next/link";
import type { CustomerMonth } from "@/lib/queries";
import { monthLabel } from "@/lib/format";

/**
 * Which months have complete client-reported customer data, and what each
 * incomplete one is still missing.
 *
 * This lives on Setup, not the console. It answers "what do I still need to
 * chase from the client" — a question for whoever maintains the sheet, at
 * the moment they sit down to maintain it. A buyer deciding today's budget
 * has no use for it.
 */
export function CoverageStrip({ months, slug }: { months: CustomerMonth[]; slug: string }) {
  if (!months.length) return null;
  const withData = months.filter((m) => m.hasData && m.ltvCac != null);
  const latestMonth = months[months.length - 1].month;

  const reasonFor = (m: CustomerMonth, short: boolean) => {
    const isLatest = m.month === latestMonth;
    const hasCounts = m.newCustomers != null && m.returningCustomers != null;
    const hasStoreTotal = m.totalOrders != null && m.totalRevenue != null;
    if (isLatest) return short ? "too new" : "just too new — it'll fill in once the month closes";
    if (hasCounts && !hasStoreTotal) return "missing the Shopify store total";
    if (!hasCounts && hasStoreTotal) return short ? "missing customer counts" : "missing new/returning customer counts";
    return short ? "no data reported yet" : "has no data reported yet";
  };
  const missing = months.filter((m) => !m.hasData);

  return (
    <div className="card p-4">
      <h3 className="mb-1 text-sm font-semibold">
        Customer-data coverage — {withData.length} of {months.length} months complete
      </h3>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Click a month to fill in its inputs. Complete months light up.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {months.map((m) => (
          <Link key={m.month} href={`/${slug}/internal?month=${m.month.slice(0, 7)}`}
            title={`${monthLabel(m.month.slice(0, 7))} — ${m.hasData ? "complete · click to edit" : reasonFor(m, true)}`}
            className="flex h-7 items-center rounded-md px-2 text-[10px] font-bold transition-transform hover:scale-105"
            style={m.hasData
              ? { background: "color-mix(in srgb, var(--brand) 25%, transparent)", color: "var(--text-primary)" }
              : { background: "var(--grid)", color: "var(--text-muted)", border: "1px dashed var(--border-hairline)" }}>
            {monthLabel(m.month.slice(0, 7)).split(" ")[0]}
          </Link>
        ))}
      </div>
      {missing.length > 0 && (
        <p className="mt-3 text-[11px] leading-5" style={{ color: "var(--text-muted)" }}>
          {missing.map((m, i) => (
            <span key={m.month}>
              {i > 0 && " · "}
              <strong style={{ color: "var(--text-secondary)" }}>{monthLabel(m.month.slice(0, 7))}</strong> is {reasonFor(m, false)}
            </span>
          ))}. Every other month is fully in — nothing else to chase.
        </p>
      )}
    </div>
  );
}
