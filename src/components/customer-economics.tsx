import Link from "next/link";
import { Lock, UserPlus, Repeat } from "lucide-react";
import type { CustomerMonth } from "@/lib/queries";
import { inr, inrCompact, num, pct, monthLabel, ratio } from "@/lib/format";
import { AnimatedNumber } from "@/components/motion";
import { Explain } from "@/components/explain";

const SOURCE = "Client-reported monthly counts + Shopify totals + paid spend · Sheets → Supabase";

/**
 * Customer Engine — what a customer actually costs and is actually worth.
 * Every stat is clickable and opens its full derivation (Explain).
 *   CAC(new) = paid spend ÷ new customers
 *   LTV      = AOV ÷ (1 − repeat rate)   (geometric repeat model)
 *   LTV:CAC  = the agency's report card
 */
export function CustomerEconomics({ months, slug, measuredLtv }: {
  months: CustomerMonth[]; slug: string;
  measuredLtv?: { ltv: number | null; customers: number; orders: number } | null;
}) {
  const withData = months.filter((m) => m.hasData && m.ltvCac != null);
  const latest = withData[withData.length - 1];
  const prev = withData[withData.length - 2];
  const maxCustomers = Math.max(1, ...withData.map((m) => (m.newCustomers ?? 0) + (m.returningCustomers ?? 0)));

  if (!latest) {
    return (
      <div className="canvas-dark p-6">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No customer data yet — add monthly new/returning customer counts on the{" "}
          <Link href={`/${slug}/internal`} className="underline" style={{ color: "var(--brand)" }}>Internal page</Link>.
        </p>
      </div>
    );
  }

  const mLabel = monthLabel(latest.month.slice(0, 7));
  const customers = latest.newCustomers! + latest.returningCustomers!;

  const ltvCacMath = {
    title: `LTV : CAC = ${ratio(latest.ltvCac!)}× · ${mLabel}`,
    steps: [
      { label: "New customers (client-reported)", value: num(latest.newCustomers!) },
      { label: "Returning customers (client-reported)", value: num(latest.returningCustomers!) },
      { label: "Repeat rate r = returning ÷ all customers", value: pct(latest.repeatRate!) },
      { label: "Blended AOV = store revenue ÷ store orders", value: inr(latest.aov!) },
      { label: "Derived LTV = AOV ÷ (1 − r)", value: inr(latest.ltv!) },
      { label: "Paid spend that month", value: inrCompact(latest.paidSpend) },
      { label: "CAC(new) = spend ÷ new customers", value: inr(latest.cacNew!) },
    ],
    formula: `LTV:CAC = ${inr(latest.ltv!)} ÷ ${inr(latest.cacNew!)} = ${ratio(latest.ltvCac!)}×`,
    note: `Geometric repeat model: expected orders per customer = 1 ÷ (1 − r). 3×+ is healthy for D2C.${prev ? ` Consistency check: ${monthLabel(prev.month.slice(0, 7))} landed at ${ratio(prev.ltvCac!)}× — two independent months agreeing is what makes the model trustworthy.` : ""}`,
    source: SOURCE,
    link: { href: `/${slug}/monthly`, label: "Monthly report →" },
  };

  return (
    <div className="canvas-dark p-6">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1.6fr]">
        {/* ===== left: the verdict ===== */}
        <div>
          <Explain block math={ltvCacMath}>
            <div className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              LTV : CAC · {mLabel} · <span style={{ color: "var(--brand)" }}>click for the math</span>
            </div>
            <div className="hero-number num-gradient tabular mt-1">
              <AnimatedNumber value={latest.ltvCac!} format="ratio" />
              <span className="text-2xl font-semibold">×</span>
            </div>
            <p className="mt-2 max-w-xs text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
              Every <strong style={{ color: "var(--text-primary)" }}>₹1</strong> spent acquiring a customer buys{" "}
              <strong style={{ color: "var(--text-primary)" }}>{inr(latest.ltvCac!)}</strong> of expected lifetime revenue.
            </p>
          </Explain>

          {/* CAC vs LTV bars */}
          <div className="mt-5 flex flex-col gap-2.5">
            <Explain block math={{
              title: `CAC on new customers · ${mLabel}`,
              steps: [
                { label: "Paid spend (Meta + Google)", value: inrCompact(latest.paidSpend) },
                { label: "NEW customers acquired", value: num(latest.newCustomers!) },
              ],
              formula: `CAC(new) = ${inrCompact(latest.paidSpend)} ÷ ${num(latest.newCustomers!)} = ${inr(latest.cacNew!)}`,
              note: "Divided by new customers only — repeat orders shouldn't flatter acquisition cost. The blended CPA (spend ÷ all orders) is a different, softer number.",
              source: SOURCE,
              link: { href: `/${slug}/internal?month=${latest.month.slice(0, 7)}`, label: "Edit inputs →" },
            }}>
              <div className="mb-1 flex items-baseline justify-between text-[11px]">
                <span style={{ color: "var(--text-muted)" }}>CAC · new customer</span>
                <span className="font-bold tabular" style={{ color: "var(--text-primary)" }}>{inr(latest.cacNew!)}</span>
              </div>
              <div className="h-4 w-full rounded-md" style={{ background: "var(--grid)" }}>
                <div className="seg-grow h-full rounded-md"
                  style={{ ["--w" as string]: `${(100 * latest.cacNew!) / latest.ltv!}%`, background: "var(--brand-accent)" }} />
              </div>
            </Explain>
            <Explain block math={{
              title: `Derived LTV · ${mLabel}`,
              steps: [
                { label: "Blended AOV = store revenue ÷ store orders", value: inr(latest.aov!) },
                { label: "Repeat rate r", value: pct(latest.repeatRate!) },
                { label: "Expected orders per customer = 1 ÷ (1 − r)", value: ratio(1 / (1 - latest.repeatRate!)) },
              ],
              formula: `LTV = ${inr(latest.aov!)} ÷ (1 − ${pct(latest.repeatRate!, 0)}) = ${inr(latest.ltv!)}`,
              note: "Revenue LTV via the geometric repeat model — assumption-light, standard for D2C. Upgrades to measured LTV once the Shopify customer-level report is shared.",
              source: SOURCE,
              link: { href: `/${slug}/monthly`, label: "Monthly report →" },
            }}>
              <div className="mb-1 flex items-baseline justify-between text-[11px]">
                <span style={{ color: "var(--text-muted)" }}>Derived LTV</span>
                <span className="font-bold tabular" style={{ color: "var(--text-primary)" }}>{inr(latest.ltv!)}</span>
              </div>
              <div className="h-4 w-full rounded-md" style={{ background: "var(--grid)" }}>
                <div className="seg-grow h-full rounded-md"
                  style={{ ["--w" as string]: "100%", background: "var(--brand)" }} />
              </div>
            </Explain>
          </div>

          {/* per-month stat chips — each explains itself */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Explain block math={{
              title: `New customers · ${mLabel}`,
              steps: [
                { label: `${mLabel} new customers`, value: num(latest.newCustomers!) },
                ...(prev ? [{ label: `${monthLabel(prev.month.slice(0, 7))} new customers`, value: num(prev.newCustomers!) }] : []),
              ],
              formula: prev
                ? `growth = ${num(latest.newCustomers!)} ÷ ${num(prev.newCustomers!)} − 1 = ${Math.round((latest.newCustomers! / prev.newCustomers! - 1) * 100)}%`
                : `${num(latest.newCustomers!)} first-time buyers`,
              note: "First-time buyers as reported by the client from Shopify.",
              source: SOURCE,
              link: { href: `/${slug}/internal?month=${latest.month.slice(0, 7)}`, label: "Edit inputs →" },
            }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>New customers</div>
              <div className="text-lg font-bold tabular" style={{ color: "var(--text-primary)" }}>
                {num(latest.newCustomers!)}
                {prev && (
                  <span className="ml-1.5 text-[11px] font-bold"
                    style={{ color: latest.newCustomers! >= prev.newCustomers! ? "var(--status-good)" : "var(--status-critical)" }}>
                    {latest.newCustomers! >= prev.newCustomers! ? "▲" : "▼"}{Math.abs(Math.round((latest.newCustomers! / prev.newCustomers! - 1) * 100))}%
                  </span>
                )}
              </div>
            </Explain>
            <Explain block math={{
              title: `Repeat rate · ${mLabel}`,
              steps: [
                { label: "Returning customers", value: num(latest.returningCustomers!) },
                { label: "All customers (new + returning)", value: num(customers) },
                ...(prev ? [{ label: `${monthLabel(prev.month.slice(0, 7))} repeat rate`, value: pct(prev.repeatRate!) }] : []),
              ],
              formula: `repeat rate = ${num(latest.returningCustomers!)} ÷ ${num(customers)} = ${pct(latest.repeatRate!)}`,
              note: "Every point of repeat rate compounds LTV — this is the loyalty dial.",
              source: SOURCE,
              link: { href: `/${slug}/monthly`, label: "Monthly report →" },
            }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Repeat rate</div>
              <div className="text-lg font-bold tabular" style={{ color: "var(--text-primary)" }}>
                {pct(latest.repeatRate!)}
                {prev && Math.abs(latest.repeatRate! - prev.repeatRate!) > 0.004 && (
                  <span className="ml-1.5 text-[11px] font-bold"
                    style={{ color: latest.repeatRate! >= prev.repeatRate! ? "var(--status-good)" : "var(--status-critical)" }}>
                    {latest.repeatRate! >= prev.repeatRate! ? "▲" : "▼"}{Math.abs((latest.repeatRate! - prev.repeatRate!) * 100).toFixed(0)}pt
                  </span>
                )}
              </div>
            </Explain>
            <Explain block math={{
              title: `Blended AOV · ${mLabel}`,
              steps: [
                { label: "Store revenue (Shopify, incl. organic)", value: inrCompact(latest.totalRevenue!) },
                { label: "Store orders", value: num(latest.totalOrders!) },
              ],
              formula: `AOV = ${inrCompact(latest.totalRevenue!)} ÷ ${num(latest.totalOrders!)} = ${inr(latest.aov!)}`,
              note: "Blended across new + repeat orders. The new/repeat AOV split unlocks with the Shopify customer report.",
              source: SOURCE,
              link: { href: `/${slug}/monthly`, label: "Monthly report →" },
            }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>AOV blended</div>
              <div className="text-lg font-bold tabular" style={{ color: "var(--text-primary)" }}>{inr(latest.aov!)}</div>
            </Explain>
            <Explain block math={{
              title: `Orders per customer · ${mLabel}`,
              steps: [
                { label: "Store orders", value: num(latest.totalOrders!) },
                { label: "All customers", value: num(customers) },
              ],
              formula: `orders/customer = ${num(latest.totalOrders!)} ÷ ${num(customers)} = ${ratio(latest.totalOrders! / customers)}`,
              note: "Within a single month. Lifetime expected orders = 1 ÷ (1 − repeat rate).",
              source: SOURCE,
              link: { href: `/${slug}/monthly`, label: "Monthly report →" },
            }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Orders / customer</div>
              <div className="text-lg font-bold tabular" style={{ color: "var(--text-primary)" }}>{ratio(latest.totalOrders! / customers)}</div>
            </Explain>
          </div>
        </div>

        {/* ===== right: new vs repeat mix + locked splits + coverage ===== */}
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                New vs returning customers
              </span>
              <span className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span className="flex items-center gap-1"><UserPlus size={11} /> new</span>
                <span className="flex items-center gap-1"><Repeat size={11} /> returning</span>
              </span>
            </div>
            <div className="flex items-end gap-3" style={{ height: 150 }}>
              {withData.map((m) => {
                const total = (m.newCustomers ?? 0) + (m.returningCustomers ?? 0);
                return (
                  <Explain key={m.month} block math={{
                    title: `Customers · ${monthLabel(m.month.slice(0, 7))}`,
                    steps: [
                      { label: "New customers", value: num(m.newCustomers!) },
                      { label: "Returning customers", value: num(m.returningCustomers!) },
                      { label: "Repeat rate", value: pct(m.repeatRate!) },
                      { label: "CAC(new)", value: m.cacNew != null ? inr(m.cacNew) : "—" },
                      { label: "LTV:CAC", value: m.ltvCac != null ? `${ratio(m.ltvCac)}×` : "—" },
                    ],
                    formula: `${num(m.newCustomers!)} new + ${num(m.returningCustomers!)} returning = ${num(total)} customers`,
                    source: SOURCE,
                    link: { href: `/${slug}/internal?month=${m.month.slice(0, 7)}`, label: "Edit this month →" },
                  }}>
                    <div className="flex h-full flex-col items-center justify-end gap-1"
                      title={`${monthLabel(m.month.slice(0, 7))}`}>
                      <span className="text-[11px] font-bold tabular" style={{ color: "var(--text-secondary)" }}>{num(total)}</span>
                      <div className="flex w-16 flex-col overflow-hidden rounded-lg transition-transform group-hover:scale-105"
                        style={{ height: `${Math.max(28, (110 * total) / maxCustomers)}px` }}>
                        <div style={{ flex: m.returningCustomers ?? 0, background: "var(--brand-accent)", opacity: 0.9 }} />
                        <div style={{ flex: m.newCustomers ?? 0, background: "var(--brand)" }} />
                      </div>
                      <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
                        {monthLabel(m.month.slice(0, 7)).split(" ")[0]}
                      </span>
                    </div>
                  </Explain>
                );
              })}
              {withData.length <= 2 && (
                <div className="flex h-full flex-1 items-center justify-center rounded-xl border border-dashed p-4 text-center"
                  style={{ borderColor: "var(--border-hairline)" }}>
                  <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                    {months.length - withData.length} more months unlock when the client shares
                    monthly customer counts —{" "}
                    <Link href={`/${slug}/internal`} className="underline" style={{ color: "var(--brand)" }}>add them here</Link>.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* new/repeat AOV split — real order-level data once ingested, locked until then */}
          <div className="grid grid-cols-2 gap-3">
            {([
              { label: "New-customer AOV", value: latest.newAov, orders: latest.month, key: "new" as const },
              { label: "Repeat-customer AOV", value: latest.repeatAov, orders: latest.month, key: "repeat" as const },
            ]).map((s) =>
              s.value != null ? (
                <Explain key={s.key} block math={{
                  title: `${s.label} · ${mLabel}`,
                  steps: [
                    { label: "Basis", value: s.key === "new" ? "orders in the month of a customer's first-ever purchase" : "orders from customers who'd already bought before" },
                    { label: s.label, value: inr(s.value) },
                    ...(s.key === "new" && latest.repeatAov != null ? [{ label: "Repeat-customer AOV", value: inr(latest.repeatAov) }] : []),
                    ...(s.key === "repeat" && latest.newAov != null ? [{ label: "New-customer AOV", value: inr(latest.newAov) }] : []),
                  ],
                  formula: `${s.label} = order revenue ÷ order count, ${s.key === "new" ? "first-purchase" : "repeat"} orders only`,
                  note: "Measured from the Shopify order-level export — real, not modelled.",
                  source: "Shopify order export · Sheets → Supabase",
                  link: { href: `/${slug}/monthly`, label: "Monthly report →" },
                }}>
                  <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)" }}>
                    <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{s.label}</div>
                    <div className="mt-0.5 text-lg font-bold tabular">{inr(s.value)}</div>
                  </div>
                </Explain>
              ) : (
                <div key={s.key} className="flex items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3"
                  style={{ borderColor: "var(--border-hairline)" }}>
                  <Lock size={14} style={{ color: "var(--text-muted)" }} />
                  <div>
                    <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{s.label}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      unlocks with the Shopify customer report
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {measuredLtv?.ltv != null && (
            <Explain block math={{
              title: "Measured LTV (revenue-to-date per customer)",
              steps: [
                { label: "Total customers observed", value: num(measuredLtv.customers) },
                { label: "Total orders observed", value: num(measuredLtv.orders) },
                { label: "Total revenue across all orders", value: inrCompact(measuredLtv.ltv * measuredLtv.customers) },
              ],
              formula: `measured LTV = total revenue ÷ customers = ${inr(measuredLtv.ltv)}`,
              note: "This is revenue booked so far, not a lifetime forecast — customers acquired recently haven't had time to repeat, so this number understates true LTV and will climb as the order history lengthens. ~12% of orders had no email on file and count as one-off anonymous customers, which also pulls this down slightly. The derived LTV above (AOV ÷ (1 − repeat rate)) is the forward-looking estimate.",
              source: "Shopify order export · Sheets → Supabase",
            }}>
              <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--border-hairline)" }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    Measured LTV · revenue-to-date
                  </span>
                  <span className="text-lg font-bold tabular">{inr(measuredLtv.ltv)}</span>
                </div>
                <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  across {num(measuredLtv.customers)} customers, {num(measuredLtv.orders)} orders · right-censored, climbs over time
                </p>
              </div>
            </Explain>
          )}

          {/* data coverage strip — unlit months link straight to the editor */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Customer-data coverage · {withData.length}/{months.length} months
            </div>
            <div className="flex flex-wrap gap-1.5">
              {months.map((m) => (
                <Link key={m.month} href={`/${slug}/internal?month=${m.month.slice(0, 7)}`}
                  title={`${monthLabel(m.month.slice(0, 7))} — ${m.hasData ? "data present · click to edit" : "click to add customer counts"}`}
                  className="flex h-7 items-center rounded-md px-2 text-[10px] font-bold transition-transform hover:scale-105"
                  style={m.hasData
                    ? { background: "color-mix(in srgb, var(--brand) 25%, transparent)", color: "var(--text-primary)" }
                    : { background: "var(--grid)", color: "var(--text-muted)", border: "1px dashed var(--border-hairline)" }}>
                  {monthLabel(m.month.slice(0, 7)).split(" ")[0]}
                </Link>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>
            Every number above is clickable — the panel shows inputs, formula, and source.
            {latest && prev && ` Consistency: ${monthLabel(prev.month.slice(0, 7))} ${ratio(prev.ltvCac!)}× vs ${monthLabel(latest.month.slice(0, 7))} ${ratio(latest.ltvCac!)}×.`}
          </p>
        </div>
      </div>
    </div>
  );
}
