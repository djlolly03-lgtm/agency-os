import { notFound } from "next/navigation";
import { getClientBySlug } from "@/lib/queries";
import { getPincodeOrders } from "@/lib/offline-data";
import { inr, num, monthLabel } from "@/lib/format";
import { CinemaBanner, BannerStat } from "@/components/hero-cinema";
import { SectionHeader } from "@/components/section-header";
import { FadeIn } from "@/components/motion";

/**
 * Pincode & city-wise performance — from the client team's Sep 2026 CSV
 * drop (Pincode Wise Orders Over Time). Genuine monthly history, Nov'25
 * through Aug'26; re-run scripts/seed_offline_data.ts whenever a fresher
 * export lands. City names come from a small PIN-prefix lookup
 * (src/lib/geo.ts) scoped to what's actually in this data — most of it is
 * Mumbai, with a scatter of gifting/shipping orders elsewhere.
 */
export default async function GeographyPage({ params }: { params: Promise<{ client: string }> }) {
  const { client: slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const rows = await getPincodeOrders(client.id);
  if (!rows.length) {
    return (
      <div className="card p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        No pincode data yet — run <code>npx tsx scripts/seed_offline_data.ts</code> after dropping the
        client&rsquo;s pincode export in <code>DATA - OFFLINE/</code>.
      </div>
    );
  }

  const months = [...new Set(rows.map((r) => r.month))].sort();
  const latestMonth = months[months.length - 1];

  // city rollup, all-time
  const byCity = new Map<string, { orders: number; aovSum: number }>();
  for (const r of rows) {
    const e = byCity.get(r.city) ?? { orders: 0, aovSum: 0 };
    e.orders += r.orders; e.aovSum += (r.aov ?? 0) * r.orders;
    byCity.set(r.city, e);
  }
  const cityRows = [...byCity.entries()]
    .map(([city, e]) => ({ city, orders: e.orders, aov: e.orders > 0 ? e.aovSum / e.orders : 0 }))
    .sort((a, b) => b.orders - a.orders);
  const totalOrders = cityRows.reduce((s, c) => s + c.orders, 0);

  // top pincodes, all-time
  const byPin = new Map<string, { city: string; orders: number; aovSum: number }>();
  for (const r of rows) {
    const e = byPin.get(r.postalCode) ?? { city: r.city, orders: 0, aovSum: 0 };
    e.orders += r.orders; e.aovSum += (r.aov ?? 0) * r.orders;
    byPin.set(r.postalCode, e);
  }
  const topPins = [...byPin.entries()]
    .map(([pin, e]) => ({ pin, city: e.city, orders: e.orders, aov: e.orders > 0 ? e.aovSum / e.orders : 0 }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 15);

  // monthly total, for the trend
  const monthly = months.map((m) => ({
    month: m, orders: rows.filter((r) => r.month === m).reduce((s, r) => s + r.orders, 0),
  }));
  const maxMonthly = Math.max(...monthly.map((m) => m.orders), 1);

  return (
    <div className="flex flex-col gap-4">
      <CinemaBanner
        eyebrow="Geography"
        line1="Where the orders"
        line2="actually come from."
        sub={`Client-provided pincode export · ${monthLabel(months[0].slice(0,7))} – ${monthLabel(latestMonth.slice(0,7))} · all-time totals below, refreshed whenever a new export lands`}
        skyline={monthly.map((m) => m.orders)}
        stats={<>
          <BannerStat label="Orders, all-time" value={num(totalOrders)} />
          <BannerStat label="Pincodes reached" value={num(byPin.size)} />
        </>}
      />

      <FadeIn>
        <SectionHeader eyebrow="By city" title="Where the demand concentrates"
          meta="grouped by PIN-code prefix · see src/lib/geo.ts for the mapping" />
      </FadeIn>
      <FadeIn>
        <div className="card p-5">
          <div className="flex flex-col gap-2.5">
            {cityRows.map((c) => (
              <div key={c.city} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-xs font-semibold">{c.city}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-full" style={{ background: "var(--grid)" }}>
                  <div className="h-full rounded-full" style={{
                    width: `${Math.max(2, (c.orders / totalOrders) * 100)}%`,
                    background: c.city === "Mumbai" ? "var(--brand)" : "var(--brand-accent)",
                  }} />
                </div>
                <span className="tabular w-16 shrink-0 text-right text-xs font-bold">{num(c.orders)}</span>
                <span className="tabular w-20 shrink-0 text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {inr(c.aov)} AOV
                </span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      <FadeIn>
        <SectionHeader eyebrow="By pincode" title="Top 15 pincodes, all-time"
          meta="orders and average order value across the full window" />
      </FadeIn>
      <FadeIn>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                {["Pincode", "City", "Orders", "AOV"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPins.map((p) => (
                <tr key={p.pin} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                  <td className="px-4 py-2.5 font-medium">{p.pin}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{p.city}</td>
                  <td className="px-4 py-2.5">{num(p.orders)}</td>
                  <td className="px-4 py-2.5">{inr(p.aov)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeIn>

      <FadeIn>
        <SectionHeader eyebrow="Trend" title="Monthly order volume, by month"
          meta="every pincode summed · use this to check whether geographic reach is growing" />
      </FadeIn>
      <FadeIn>
        <div className="card p-5">
          <div className="grid items-end gap-2" style={{ gridTemplateColumns: `repeat(${monthly.length}, 1fr)`, height: 140 }}>
            {monthly.map((m) => (
              <div key={m.month} className="flex flex-col items-center justify-end gap-1.5">
                <span className="tabular text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
                  {num(m.orders)}
                </span>
                <div className="w-full rounded-t-md" style={{
                  height: Math.max(4, (m.orders / maxMonthly) * 96),
                  background: m.month === latestMonth ? "var(--brand)" : "var(--grid)",
                }} />
                <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                  {monthLabel(m.month.slice(0, 7)).split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Source: client-provided pincode export, {monthLabel(latestMonth.slice(0,7))} being the latest month
        covered. City names are derived from PIN-code prefix, not a client-provided field — see{" "}
        <code>src/lib/geo.ts</code>.
      </p>
    </div>
  );
}
