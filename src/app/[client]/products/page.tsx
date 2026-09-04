import { notFound } from "next/navigation";
import { getClientBySlug } from "@/lib/queries";
import { getProductPerformance } from "@/lib/offline-data";
import { inrCompact, num, pct } from "@/lib/format";
import { CinemaBanner, BannerStat } from "@/components/hero-cinema";
import { SectionHeader } from "@/components/section-header";
import { FadeIn } from "@/components/motion";

/**
 * Product performance — from the client team's Sep 2026 CSV drop
 * (New vs Returning Customers by Product + Product Wise Sales, merged by
 * product title). Both source files are ALL-TIME SNAPSHOTS, not a time
 * series — there's no month column in either export, so this page shows
 * "as of the last import", not a trend. Re-run scripts/seed_offline_data.ts
 * with fresher exports to move the snapshot forward; ask the client to
 * break future exports out by month if a real trend matters here.
 */
export default async function ProductsPage({ params }: { params: Promise<{ client: string }> }) {
  const { client: slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const rows = await getProductPerformance(client.id);
  if (!rows.length) {
    return (
      <div className="card p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        No product data yet — run <code>npx tsx scripts/seed_offline_data.ts</code> after dropping the
        client&rsquo;s product exports in <code>DATA - OFFLINE/</code>.
      </div>
    );
  }

  const asOf = rows.find((r) => r.asOf)?.asOf ?? null;
  const totalNewCustomers = rows.reduce((s, r) => s + r.newCustomers, 0);
  const totalReversals = rows.reduce((s, r) => s + r.reversals, 0);
  const totalNetSales = rows.reduce((s, r) => s + r.netSales, 0);

  // biggest draws for new customers — the "acquisition by product" answer
  const byNewCustomers = [...rows].sort((a, b) => b.newCustomers - a.newCustomers).slice(0, 15);
  // biggest refund lines — extends the overall refund trend to product level
  const byReversals = [...rows].filter((r) => r.reversals < 0).sort((a, b) => a.reversals - b.reversals).slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <CinemaBanner
        eyebrow="Products"
        line1="What sells, and"
        line2="who it's selling to."
        sub={`Client-provided product exports, as of ${asOf ?? "—"} · all-time totals, not a monthly trend — ask for a monthly re-export if that matters`}
        stats={<>
          <BannerStat label="Products tracked" value={num(rows.length)} />
          <BannerStat label="Net sales, all-time" value={inrCompact(totalNetSales)} />
        </>}
      />

      <FadeIn>
        <SectionHeader eyebrow="Acquisition" title="Which products bring in new customers"
          meta={`${num(totalNewCustomers)} new customers across the catalog, all-time · top 15 by new-customer count`} />
      </FadeIn>
      <FadeIn>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                {["Product", "New customers", "Returning customers", "New share", "Net sales"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byNewCustomers.map((r) => {
                const total = r.newCustomers + r.returningCustomers;
                const share = total > 0 ? r.newCustomers / total : null;
                return (
                  <tr key={r.product} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                    <td className="max-w-[280px] truncate px-4 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.product}
                    </td>
                    <td className="px-4 py-2.5">{num(r.newCustomers)}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{num(r.returningCustomers)}</td>
                    <td className="px-4 py-2.5">{share != null ? pct(share, 0) : "—"}</td>
                    <td className="px-4 py-2.5">{inrCompact(r.netSales)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </FadeIn>

      <FadeIn>
        <SectionHeader eyebrow="Returns" title="Where the refunds concentrate"
          meta={`${inrCompact(Math.abs(totalReversals))} reversed across the catalog, all-time · extends the monthly refund trend to product level`} />
      </FadeIn>
      <FadeIn>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                {["Product", "Net sales", "Reversals", "Reversal rate"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byReversals.map((r) => {
                const gross = r.netSales - r.reversals; // reversals are negative
                const rate = gross > 0 ? Math.abs(r.reversals) / gross : null;
                return (
                  <tr key={r.product} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                    <td className="max-w-[280px] truncate px-4 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.product}
                    </td>
                    <td className="px-4 py-2.5">{inrCompact(r.netSales)}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--status-critical)" }}>{inrCompact(r.reversals)}</td>
                    <td className="px-4 py-2.5">{rate != null ? pct(rate, 1) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </FadeIn>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Source: client-provided Shopify product exports (New vs Returning Customers, Product Wise Sales),
        as of {asOf ?? "—"}. Both are all-time snapshots — there is no month column in either file, so this
        page cannot show a trend until the client re-exports periodically.
      </p>
    </div>
  );
}
