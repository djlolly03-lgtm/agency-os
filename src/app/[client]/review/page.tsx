import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, getMonths, getMonthlyReport, getDivisionOverview, getCustomerEconomics,
  getCreatives, getMonthlyNameRollups, getAdRangeRollups, getTimeseries, getGoals,
  getReviewNotes, REVIEW_SECTIONS,
} from "@/lib/queries";
import { getRfmSegments } from "@/lib/shopify";
import { getRetentionChannels } from "@/lib/retention";
import { aggregateProduceMonth, classifyProduce, seasonRadar } from "@/lib/seasons";
import { computeInsights } from "@/lib/insights";
import { inr, inrCompact, num, pct, ratio, monthLabel } from "@/lib/format";
import { MonthPicker } from "@/components/month-picker";
import { ReviewNote } from "@/components/review-note";
import { PrintButton } from "@/components/print-button";
import { monthEndDay } from "@/lib/periods";

/**
 * The monthly review — the document the agency currently rebuilds by hand as
 * a slide deck every month. Everything derivable is derived; the three things
 * no data source can produce (challenges, next month's plan, asks) are typed
 * once and stored per month.
 *
 * Laid out for paper: Cmd-P → Save as PDF gives a client-ready document, with
 * page breaks at section boundaries and an ink-friendly palette (see the
 * @media print block in globals.css).
 */
export default async function ReviewPage({ params, searchParams }: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { client: slug } = await params;
  const sp = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const months = await getMonths(client.id);                 // desc
  // default to the last COMPLETE month — a review of a half-finished month
  // is the one thing nobody wants to present
  const defaultMonth = months.length > 1 ? months[1] : months[0];
  const month = sp.month && months.includes(sp.month + "-01") ? sp.month + "-01" : defaultMonth;
  const mLabel = monthLabel(month.slice(0, 7));
  const monthEnd = monthEndDay(month);
  const prevMonth = new Date(Date.UTC(
    Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);

  const [report, dv, custMonths, rfm, creatives, nameRollups, adRollups, daily, goalRows, retention, notes] =
    await Promise.all([
      getMonthlyReport(client.id),
      getDivisionOverview(client.id, month),
      getCustomerEconomics(client.id),
      getRfmSegments(client.id),
      getCreatives(client.id),
      getMonthlyNameRollups(client.id),
      getAdRangeRollups(client.id, { from: month, to: monthEnd }),
      getTimeseries(client.id, "day"),
      getGoals(client.id, month),
      getRetentionChannels(client.id),
      getReviewNotes(client.id, month),
    ]);

  const row = report.find((r) => r.month === month);
  const prevRow = report.find((r) => r.month === prevMonth);
  if (!row) notFound();

  // ---- channel table, exactly the shape the deck uses (Direct = organic) ----
  const paidSpend = row.meta.spend + row.google.spend;
  const paidRevenue = row.meta.revenue + row.google.revenue;
  const paidOrders = row.meta.purchases + row.google.purchases;
  const totalRevenue = row.totalRevenue ?? paidRevenue;
  const totalOrders = row.totalOrders ?? paidOrders;
  const directRevenue = row.organicRevenue ?? 0;
  const directOrders = row.organicOrders ?? 0;

  // Direct's ORDER count is a residual (store orders − platform-claimed orders),
  // and the platforms double-claim orders they both touched. The residual
  // revenue is sound; the residual order count isn't, so dividing the two
  // invents an AOV (it read ₹3,257 vs a ₹1,098 blended average — it would
  // look like organic buyers spend 3× more). Revenue only for that row.
  const channelRows: Array<{ name: string; spend: number | null; orders: number | null; revenue: number }> = [
    { name: "Meta Ads", spend: row.meta.spend, orders: row.meta.purchases, revenue: row.meta.revenue },
    { name: "Google Ads", spend: row.google.spend, orders: row.google.purchases, revenue: row.google.revenue },
    ...(row.totalRevenue != null
      ? [{ name: "Direct / organic", spend: null, orders: null, revenue: directRevenue }]
      : []),
  ].filter((c) => c.revenue > 0 || (c.spend ?? 0) > 0);

  // ---- insights for the month ----
  const rangeRows = daily.filter((d) => d.period >= month && d.period <= monthEnd);
  const byDay = new Map<string, { day: string; spend: number; revenue: number; purchases: number }>();
  for (const r of rangeRows) {
    const d = byDay.get(r.period) ?? { day: r.period, spend: 0, revenue: 0, purchases: 0 };
    d.spend += r.spend; d.revenue += r.revenue; d.purchases += r.purchases;
    byDay.set(r.period, d);
  }
  const monthDaily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const platformTotals = [
    { platform: "meta", spend: row.meta.spend, revenue: row.meta.revenue, roas: row.meta.spend > 0 ? row.meta.revenue / row.meta.spend : 0 },
    { platform: "google", spend: row.google.spend, revenue: row.google.revenue, roas: row.google.spend > 0 ? row.google.revenue / row.google.spend : 0 },
  ].filter((p) => p.spend > 0);
  const explicitGoal = goalRows.find((g) => String(g.metric) === "revenue");
  const goal = explicitGoal
    ? { target: Number(explicitGoal.target), isDefault: false }
    : prevRow ? { target: (prevRow.totalRevenue ?? 0) * 1.25, isDefault: true } : null;

  const insights = computeInsights({
    slug, monthLabel: mLabel, isCurrentMonth: false, monthParam: month.slice(0, 7),
    monthDaily, platformTotals, adRollups, goal, monthRevenue: paidRevenue,
    seasonal: undefined, customerMonths: custMonths,
  });

  // ---- seasons ----
  const monthNum = Number(month.slice(5, 7));
  const produceAgg = aggregateProduceMonth(nameRollups.filter((r) => r.month === month), monthNum);
  const historicalKeys = new Set(
    nameRollups.map((r) => classifyProduce(r.campaign, r.ad)?.key).filter(Boolean) as string[]);
  const radar = seasonRadar(produceAgg, monthNum, historicalKeys);

  // ---- customers ----
  const cust = custMonths.find((m) => m.month === month);
  const custPrev = custMonths.find((m) => m.month === prevMonth);

  // ---- categories: this month + the two before, like the deck's 3-month table ----
  const catMonths = [prevMonth, month];
  const twoBack = new Date(Date.UTC(
    Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 3, 1)).toISOString().slice(0, 10);
  if (months.includes(twoBack)) catMonths.unshift(twoBack);
  const divisionByMonth = await Promise.all(
    catMonths.filter((m) => months.includes(m)).map(async (m) => ({
      month: m, dv: await getDivisionOverview(client.id, m),
    })));

  // ---- creative ----
  const scale = creatives.filter((c) => c.active && (c.status === "winner" || c.status === "hidden_gem"))
    .sort((a, b) => b.window_revenue / Math.max(b.window_spend, 1) - a.window_revenue / Math.max(a.window_spend, 1))
    .slice(0, 5);
  const fatiguing = creatives.filter((c) => c.status === "fatiguing").length;

  const retentionRow = retention.find((r) => r.month === month);
  const revDelta = prevRow?.totalRevenue && row.totalRevenue
    ? row.totalRevenue / prevRow.totalRevenue - 1 : null;

  const stat = (label: string, value: string, sub?: string) => (
    <div key={label}>
      <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</div>
      {/* solid, not .num-gradient — the gradient is tuned for the dark cinema
          canvas and renders as a near-invisible ghost on this light card */}
      <div className="mt-0.5 text-2xl font-bold tabular" style={{ color: "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );

  return (
    <div className="review-page flex flex-col gap-5">
      {/* ===== toolbar (screen only) ===== */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <MonthPicker months={months} selected={month} basePath={`/${slug}/review`} />
        <div className="flex items-center gap-3">
          <Link href={`/${slug}?month=${month.slice(0, 7)}`} className="text-xs underline"
            style={{ color: "var(--text-secondary)" }}>
            Open the live dashboard →
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* ===== cover ===== */}
      <header className="review-block card px-6 py-6">
        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--brand)" }}>
          {client.name} · Performance review
        </div>
        <h1 className="review-h2 mt-1" style={{ fontSize: "2.1rem" }}>
          {mLabel} — the month in full, and what happens next.
        </h1>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Prepared by Pixel Mint Media · every figure recomputed from Meta, Google Ads and Shopify
          on {new Date().toISOString().slice(0, 10)} — no pasted snapshots.
        </p>
      </header>

      {/* ===== 1. headline numbers + channel table (the deck's core slide) ===== */}
      <section className="review-block card px-6 py-5">
        <h2 className="review-h2">Marketing performance</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {stat("Total revenue", inrCompact(totalRevenue),
            revDelta != null ? `${revDelta >= 0 ? "▲" : "▼"} ${Math.abs(revDelta * 100).toFixed(0)}% vs ${monthLabel(prevMonth.slice(0, 7))}` : undefined)}
          {stat("Ad spend", inrCompact(paidSpend))}
          {stat("Orders", num(totalOrders))}
          {stat("Blended ROAS", `${ratio(row.blendedRoas)}×`, `paid ${ratio(row.paidRoas)}×`)}
          {stat("Avg. order value", row.aov != null ? inr(row.aov) : "—")}
        </div>

        <table className="review-table mt-5">
          <thead>
            <tr>
              <th>Channel</th><th>Ad spend</th><th>Orders</th><th>Revenue</th>
              <th>AOV</th><th>ROAS</th><th>Share of revenue</th>
            </tr>
          </thead>
          <tbody>
            {channelRows.map((c) => (
              <tr key={c.name}>
                <td className="font-medium">{c.name}</td>
                <td className="tabular">{c.spend != null ? inrCompact(c.spend) : "—"}</td>
                <td className="tabular">{c.orders != null && c.orders > 0 ? num(c.orders) : "—"}</td>
                <td className="tabular">{inrCompact(c.revenue)}</td>
                <td className="tabular">{c.orders != null && c.orders > 0 ? inr(c.revenue / c.orders) : "—"}</td>
                <td className="tabular">{c.spend != null && c.spend > 0 ? `${ratio(c.revenue / c.spend)}×` : "N/A"}</td>
                <td className="tabular">{totalRevenue > 0 ? pct(c.revenue / totalRevenue, 1) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="tabular">{inrCompact(paidSpend)}</td>
              <td className="tabular">{num(totalOrders)}</td>
              <td className="tabular">{inrCompact(totalRevenue)}</td>
              <td className="tabular">{row.aov != null ? inr(row.aov) : "—"}</td>
              <td className="tabular">{ratio(row.blendedRoas)}×</td>
              <td className="tabular">100%</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-[11px] leading-5" style={{ color: "var(--text-muted)" }}>
          Meta and Google figures are platform-attributed — each platform self-reports, and both
          can claim the same order, so channel rows deliberately don&rsquo;t sum to the total.
          Direct/organic is the remainder of the Shopify store total, which makes it the honest
          home for that overlap; its order count and AOV are left blank for the same reason
          (a residual order count divided into residual revenue isn&rsquo;t a real average).
          The <strong>Total</strong> row is the one that reconciles to Shopify.
        </p>
      </section>

      {/* ===== 2. what the month is telling us ===== */}
      {insights.length > 0 && (
        <section className="review-block card px-6 py-5">
          <h2 className="review-h2">What the numbers are saying</h2>
          <div className="flex flex-col gap-3">
            {insights.slice(0, 5).map((ins, i) => (
              <div key={i} className="flex flex-col">
                <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                  <strong className="tabular">{ins.metric}</strong> {ins.text}
                </div>
                {ins.action && (
                  <div className="text-[12px] leading-5" style={{ color: "var(--text-secondary)" }}>
                    → {ins.action}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== 3. customers ===== */}
      {cust?.hasData && (
        <section className="review-block card px-6 py-5">
          <h2 className="review-h2">Customers</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stat("New customers", num(cust.newCustomers!),
              custPrev?.newCustomers ? `vs ${num(custPrev.newCustomers)} last month` : undefined)}
            {stat("Repeat rate", pct(cust.repeatRate!),
              custPrev?.repeatRate != null ? `vs ${pct(custPrev.repeatRate)}` : undefined)}
            {stat("CAC (new)", cust.cacNew != null ? inr(cust.cacNew) : "—")}
            {stat("LTV : CAC", cust.ltvCac != null ? `${ratio(cust.ltvCac)}×` : "—",
              cust.ltv != null ? `LTV ${inr(cust.ltv)}` : undefined)}
          </div>
          {cust.newRevenue != null && cust.repeatRevenue != null && cust.newRevenue + cust.repeatRevenue > 0 && (
            <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-primary)" }}>
              <strong>{pct(cust.repeatRevenue / (cust.newRevenue + cust.repeatRevenue), 0)}</strong> of
              tracked revenue came from customers who had bought before
              ({inrCompact(cust.repeatRevenue)} returning vs {inrCompact(cust.newRevenue)} new) — revenue
              that arrives without new acquisition spend.
            </p>
          )}
          {rfm && (
            <table className="review-table mt-4">
              <thead>
                <tr><th>Segment</th><th>Customers</th><th>Lifetime revenue</th><th>What it means</th></tr>
              </thead>
              <tbody>
                {rfm.segments.filter((s) => s.customers > 0).map((s) => (
                  <tr key={s.key}>
                    <td className="font-medium">{s.label}</td>
                    <td className="tabular">{num(s.customers)}</td>
                    <td className="tabular">{inrCompact(s.lifetimeRevenue)}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{s.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ===== 4. categories ===== */}
      {divisionByMonth.length > 0 && (
        <section className="review-block card px-6 py-5">
          <h2 className="review-h2">Category performance</h2>
          <table className="review-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>F&amp;V spend</th><th>F&amp;V revenue</th><th>F&amp;V ROAS</th>
                <th>Groceries spend</th><th>Groceries revenue</th><th>Groceries ROAS</th>
              </tr>
            </thead>
            <tbody>
              {divisionByMonth.map(({ month: m, dv: d }) => {
                const fv = d.divisions.find((x) => x.division === "fruits_veggies")!;
                const gr = d.divisions.find((x) => x.division === "groceries")!;
                return (
                  <tr key={m}>
                    <td className="font-medium">{monthLabel(m.slice(0, 7))}</td>
                    <td className="tabular">{inrCompact(fv.spend)}</td>
                    <td className="tabular">{inrCompact(fv.revenue)}</td>
                    <td className="tabular">{ratio(fv.roas)}×</td>
                    <td className="tabular">{inrCompact(gr.spend)}</td>
                    <td className="tabular">{inrCompact(gr.revenue)}</td>
                    <td className="tabular">{ratio(gr.roas)}×</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Categories are classified from campaign names — paid-attributed revenue only, so these
            totals sit below the client&rsquo;s own category sales (which include organic).
          </p>
        </section>
      )}

      {/* ===== 5. creative ===== */}
      <section className="review-block card px-6 py-5">
        <h2 className="review-h2">Creative</h2>
        <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          {scale.length} creative{scale.length === 1 ? "" : "s"} earning above the account average right now
          {fatiguing > 0 ? `, ${fatiguing} fatiguing and due for a refresh` : ""}.
        </p>
        {scale.length > 0 && (
          <table className="review-table">
            <thead>
              <tr><th>Creative</th><th>Spend (14d)</th><th>Revenue (14d)</th><th>ROAS</th></tr>
            </thead>
            <tbody>
              {scale.map((c) => (
                <tr key={c.ad_id}>
                  <td className="font-medium">{c.ad_name}</td>
                  <td className="tabular">{inrCompact(c.window_spend)}</td>
                  <td className="tabular">{inrCompact(c.window_revenue)}</td>
                  <td className="tabular">{ratio(c.window_revenue / Math.max(c.window_spend, 1))}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ===== 6. seasons ===== */}
      {(radar.riding.length > 0 || radar.missed.length > 0) && (
        <section className="review-block card px-6 py-5">
          <h2 className="review-h2">Selling with the season</h2>
          {radar.riding.length > 0 && (
            <p className="text-sm leading-6" style={{ color: "var(--text-primary)" }}>
              <strong>Rode the window:</strong>{" "}
              {radar.riding.slice(0, 6).map((r) => `${r.produce.label} (${inrCompact(r.revenue)})`).join(", ")}.
            </p>
          )}
          {radar.missed.length > 0 && (
            <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--text-primary)" }}>
              <strong>In season, no spend:</strong>{" "}
              {radar.missed.slice(0, 8).map((r) => r.produce.label).join(", ")} — open windows for next month.
            </p>
          )}
        </section>
      )}

      {/* ===== 7. retention channels ===== */}
      {retentionRow && (
        <section className="review-block card px-6 py-5">
          <h2 className="review-h2">Retention channels</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stat("WhatsApp ROAS", retentionRow.waRoas != null ? `${ratio(retentionRow.waRoas)}×` : "—",
              retentionRow.waSpend != null ? `${inrCompact(retentionRow.waSpend)} spend` : undefined)}
            {stat("WhatsApp revenue", retentionRow.waRevenue != null ? inrCompact(retentionRow.waRevenue) : "—",
              retentionRow.waOrders != null ? `${num(retentionRow.waOrders)} orders` : undefined)}
            {stat("Emails sent", retentionRow.emailSent != null ? num(retentionRow.emailSent) : "—")}
            {stat("Open rate", retentionRow.emailOpenRate != null ? pct(retentionRow.emailOpenRate / 100) : "—")}
          </div>
        </section>
      )}

      {/* ===== 8–10. the narrative — typed once, kept per month ===== */}
      <div className="page-break" />
      <section className="review-block card px-6 py-5">
        <h2 className="review-h2">Challenges, plan, and asks</h2>
        <p className="no-print mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
          The only part of this review a data source can&rsquo;t write. Click any section to edit —
          it saves as you go, and prints as prose.
        </p>
        <div className="flex flex-col gap-5">
          {REVIEW_SECTIONS.map((s) => (
            <ReviewNote key={s.key} slug={slug} month={month} section={s.key}
              label={s.label} hint={s.hint} initial={notes[s.key] ?? ""} />
          ))}
        </div>
      </section>

      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {client.name} · {mLabel} review · Pixel Mint Media
      </p>
    </div>
  );
}
