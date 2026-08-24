import Link from "next/link";
import type { CustomerMonth } from "@/lib/queries";
import type { RfmResult } from "@/lib/shopify";
import { inr, inrCompact, num, pct, ratio, monthLabel } from "@/lib/format";
import { Explain } from "@/components/explain";

const SOURCE = "Client-reported monthly counts + Shopify totals + paid spend · Sheets → Supabase";

/**
 * The customer engine, console-sized: four numbers and the one list worth
 * acting on.
 *
 * The full engine — monthly cohort bars, AOV splits, measured LTV, the
 * coverage strip, the six-segment grid — was the largest block on a page
 * whose promise is "what needs me today", and every figure in it is a month
 * old because the customer export is refreshed by hand. The depth still
 * exists: the Review tells the customer story at a monthly cadence, and the
 * coverage strip now lives on Setup with the rest of the data plumbing.
 */
export function CustomerSnapshot({ months, slug, rfm }: {
  months: CustomerMonth[]; slug: string; rfm?: RfmResult | null;
}) {
  const withData = months.filter((m) => m.hasData && m.ltvCac != null);
  const latest = withData[withData.length - 1];
  const prev = withData[withData.length - 2];

  if (!latest) {
    return (
      <div className="card px-5 py-4 text-sm" style={{ color: "var(--text-secondary)" }}>
        No customer data yet — add monthly new/returning counts on{" "}
        <Link href={`/${slug}/internal`} className="underline" style={{ color: "var(--brand)" }}>Setup</Link>.
      </div>
    );
  }

  const mLabel = monthLabel(latest.month.slice(0, 7));
  const customers = latest.newCustomers! + latest.returningCustomers!;
  const lostRegulars = rfm?.segments.find((s) => s.key === "lost_regulars");

  const stat = (label: string, value: string, sub?: React.ReactNode, math?: Parameters<typeof Explain>[0]["math"]) => {
    const inner = (
      <>
        <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</div>
        <div className="tabular mt-0.5 text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{value}</div>
        {sub && <div className="text-[11px] leading-4" style={{ color: "var(--text-secondary)" }}>{sub}</div>}
      </>
    );
    return math ? <Explain block math={math}>{inner}</Explain> : <div>{inner}</div>;
  };

  return (
    <div className="card flex flex-col gap-4 px-5 py-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stat("LTV : CAC", `${ratio(latest.ltvCac!)}×`,
          prev ? `${ratio(prev.ltvCac!)}× the month before` : undefined,
          {
            title: `LTV : CAC · ${mLabel}`,
            steps: [
              { label: "New customers (client-reported)", value: num(latest.newCustomers!) },
              { label: "Returning customers", value: num(latest.returningCustomers!) },
              { label: "Repeat rate r = returning ÷ all", value: pct(latest.repeatRate!) },
              { label: "Blended AOV = store revenue ÷ orders", value: inr(latest.aov!) },
              { label: "Derived LTV = AOV ÷ (1 − r)", value: inr(latest.ltv!) },
              { label: "Paid spend", value: inrCompact(latest.paidSpend) },
              { label: "CAC(new) = spend ÷ new customers", value: inr(latest.cacNew!) },
            ],
            formula: `LTV:CAC = ${inr(latest.ltv!)} ÷ ${inr(latest.cacNew!)} = ${ratio(latest.ltvCac!)}×`,
            note: "Geometric repeat model. 3×+ is healthy for D2C.",
            source: SOURCE,
            link: { href: `/${slug}/review`, label: "Full customer story in the Review →" },
          })}

        {stat("CAC · new customer", inr(latest.cacNew!), `vs ${inr(latest.ltv!)} lifetime value`)}

        {stat("Repeat rate", pct(latest.repeatRate!),
          prev && Math.abs(latest.repeatRate! - prev.repeatRate!) > 0.004 ? (
            <span style={{ color: latest.repeatRate! >= prev.repeatRate! ? "var(--status-good)" : "var(--status-critical)" }}>
              {latest.repeatRate! >= prev.repeatRate! ? "▲" : "▼"}{Math.abs((latest.repeatRate! - prev.repeatRate!) * 100).toFixed(0)}pt vs last month
            </span>
          ) : `${num(customers)} customers`)}

        {stat("New customers", num(latest.newCustomers!),
          prev?.newCustomers ? `vs ${num(prev.newCustomers)} last month` : undefined)}
      </div>

      {lostRegulars && lostRegulars.customers > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t pt-3 text-[12.5px] leading-5"
          style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}>
          <strong className="tabular" style={{ color: "var(--status-critical)" }}>{inrCompact(lostRegulars.lifetimeRevenue)}</strong>
          <span>of lifetime spend sits with</span>
          <strong className="tabular" style={{ color: "var(--text-primary)" }}>{num(lostRegulars.customers)}</strong>
          <span>lost regulars — proven repeat buyers who have gone quiet.</span>
          <Link href={`/${slug}/internal#winback`} className="underline" style={{ color: "var(--brand)" }}>
            Win-back list →
          </Link>
        </div>
      )}
    </div>
  );
}
