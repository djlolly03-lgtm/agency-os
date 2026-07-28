import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, getOverview, getTimeseries, getCreatives, getPacing, getDivisionOverview, getMonths,
  getFunnel, getDailyBlended, getAdRangeRollups, getGoals, getManualGoogleMonth,
} from "@/lib/queries";
import { Funnel } from "@/components/funnel";
import { DayHeatmap } from "@/components/day-heatmap";
import { computeInsights } from "@/lib/insights";
import { inr, inrCompact, num, ratio, pct, dayLabel, monthLabel } from "@/lib/format";
import { KpiTile } from "@/components/kpi";
import { TrendChart } from "@/components/trend-chart";
import { StatusChip } from "@/components/status-chip";
import { PacingCard } from "@/components/pacing-card";
import { MonthPicker } from "@/components/month-picker";
import { OnlineOfflineCard, DivisionCards, HeroLoserCards } from "@/components/division-section";
import { FadeIn, AnimatedNumber } from "@/components/motion";
import { Sparkline } from "@/components/sparkline";
import { InsightChips } from "@/components/insight-chips";
import { SectionHeader } from "@/components/section-header";

export default async function OverviewPage({ params, searchParams }: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { client: slug } = await params;
  const sp = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const months = await getMonths(client.id);
  const selectedMonth = sp.month && months.includes(sp.month + "-01") ? sp.month + "-01" : months[0];
  const isCurrent = selectedMonth === months[0];
  const monthParam = selectedMonth.slice(0, 7);

  const monthEnd = new Date(Date.UTC(
    Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const prevMonthStart = new Date(Date.UTC(
    Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const prevMonthEnd = new Date(Date.UTC(
    Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);

  const [ov, daily, weekly, monthly, creatives, pacing, dv, heatDays, goalRows] = await Promise.all([
    getOverview(client.id),
    getTimeseries(client.id, "day"),
    getTimeseries(client.id, "week"),
    getTimeseries(client.id, "month"),
    getCreatives(client.id),
    getPacing(client.id),
    getDivisionOverview(client.id, selectedMonth),
    getDailyBlended(client.id, 91),
    getGoals(client.id, selectedMonth),
  ]);
  const rangeEnd = monthEnd < dv.asOf ? monthEnd : dv.asOf;
  const funnel = await getFunnel(client.id, { from: selectedMonth, to: rangeEnd });
  const adRollups = await getAdRangeRollups(client.id, { from: selectedMonth, to: rangeEnd });
  const periodLabel = dv.isPartial ? "MTD" : monthLabel(dv.month.slice(0, 7));

  // ---- month-scoped aggregation from the daily timeseries ----
  const inRange = (p: string, from: string, to: string) => p >= from && p <= to;
  const monthRows = daily.filter((r) => inRange(r.period, selectedMonth, rangeEnd));
  const prevRows = daily.filter((r) => inRange(r.period, prevMonthStart,
    isCurrent
      ? // same-days comparison for the running month
        new Date(Date.UTC(Number(prevMonthStart.slice(0, 4)), Number(prevMonthStart.slice(5, 7)) - 1,
          Math.min(Number(rangeEnd.slice(8, 10)), Number(prevMonthEnd.slice(8, 10))))).toISOString().slice(0, 10)
      : prevMonthEnd));

  const sumRows = (rows: typeof daily) => rows.reduce((t, r) => ({
    spend: t.spend + r.spend, revenue: t.revenue + r.revenue, purchases: t.purchases + r.purchases,
    clicks: t.clicks + r.clicks, impressions: t.impressions + r.impressions,
  }), { spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0 });
  const mt = sumRows(monthRows);
  const pv = sumRows(prevRows);

  // Dec 2025 – Apr 2026 have no daily Google rows — their Google numbers are
  // monthly manual inputs. Fold them in so paid totals are honest platform-wide.
  const hasGoogleDaily = monthRows.some((r) => r.platform === "google");
  const manualGoogle = hasGoogleDaily ? null : await getManualGoogleMonth(client.id, selectedMonth);
  if (manualGoogle) {
    mt.spend += manualGoogle.spend; mt.revenue += manualGoogle.revenue; mt.purchases += manualGoogle.purchases;
  }
  const prevHasGoogleDaily = prevRows.some((r) => r.platform === "google");
  const prevManualGoogle = prevHasGoogleDaily ? null : await getManualGoogleMonth(client.id, prevMonthStart);
  if (prevManualGoogle && !isCurrent) {
    // only fold into prev for complete-month comparisons (manual inputs are monthly)
    pv.spend += prevManualGoogle.spend; pv.revenue += prevManualGoogle.revenue; pv.purchases += prevManualGoogle.purchases;
  }

  const mtRoas = mt.spend > 0 ? mt.revenue / mt.spend : 0;
  const pvRoas = pv.spend > 0 ? pv.revenue / pv.spend : 0;
  const mtCpa = mt.purchases > 0 ? mt.spend / mt.purchases : 0;
  const mtAov = mt.purchases > 0 ? mt.revenue / mt.purchases : 0;
  const mtCtr = mt.impressions > 0 ? mt.clicks / mt.impressions : 0;

  const platformTotals = ["meta", "google"].map((pf) => {
    const rows = monthRows.filter((r) => r.platform === pf);
    const s = sumRows(rows);
    if (pf === "google" && manualGoogle) {
      s.spend += manualGoogle.spend; s.revenue += manualGoogle.revenue; s.purchases += manualGoogle.purchases;
    }
    return { platform: pf, spend: s.spend, revenue: s.revenue, roas: s.spend > 0 ? s.revenue / s.spend : 0 };
  }).filter((p) => p.spend > 0);
  const monthSpendTotal = mt.spend || 1;

  // per-day blended series within the month (sparklines + insight CPA trend)
  const byDay = new Map<string, { day: string; spend: number; revenue: number; purchases: number }>();
  for (const r of monthRows) {
    const d = byDay.get(r.period) ?? { day: r.period, spend: 0, revenue: 0, purchases: 0 };
    d.spend += r.spend; d.revenue += r.revenue; d.purchases += r.purchases;
    byDay.set(r.period, d);
  }
  const monthDaily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const sparkRevenue = monthDaily.map((d) => d.revenue);
  const sparkSpend = monthDaily.map((d) => d.spend);
  const sparkRoas = monthDaily.map((d) => (d.spend > 0 ? d.revenue / d.spend : 0));

  // goal for the selected month (explicit, else default prev-month +25%)
  const explicitGoal = goalRows.find((g) => String(g.metric) === "revenue");
  const goal = explicitGoal
    ? { target: Number(explicitGoal.target), isDefault: false }
    : pv.revenue > 0 ? { target: pv.revenue * 1.25, isDefault: true } : null;

  const insights = computeInsights({
    slug, monthLabel: periodLabel, isCurrentMonth: isCurrent, monthParam,
    monthDaily, platformTotals, adRollups, goal, monthRevenue: mt.revenue,
    creatives: isCurrent ? creatives : undefined,
    pacing: isCurrent ? pacing.metrics : undefined,
  });

  const top = creatives.filter((c) => c.active && (c.status === "winner" || c.status === "hidden_gem"))
    .sort((a, b) => b.window_revenue / Math.max(b.window_spend, 1) - a.window_revenue / Math.max(a.window_spend, 1))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      {/* ===== HERO (scoped to selected month) ===== */}
      <FadeIn>
        <section className="canvas-dark hero-stage p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {isCurrent
                ? `Data through ${dayLabel(dv.asOf)} · refreshed daily`
                : `${monthLabel(monthParam)} · complete month`}
            </p>
            <MonthPicker months={months} selected={selectedMonth} basePath={`/${slug}`} />
          </div>
          <div className="mt-6 grid gap-8 md:grid-cols-3">
            {([
              {
                label: `Paid revenue · ${periodLabel}`, value: mt.revenue, format: "inr-compact" as const, suffix: "",
                delta: pv.revenue > 0 ? mt.revenue / pv.revenue - 1 : null,
                sub: `${num(mt.purchases)} orders · AOV ${inr(mtAov)}`
                  + (!dv.onlineIsTracked ? ` · store total ${inrCompact(dv.onlineRevenueMtd)}` : ""),
                spark: sparkRevenue, stroke: "var(--brand)", id: "rev",
              },
              {
                label: `ROAS · ${periodLabel}`, value: mtRoas, format: "ratio" as const, suffix: "×",
                delta: pvRoas > 0 ? mtRoas / pvRoas - 1 : null,
                sub: `CPA ${inr(mtCpa)} · CTR ${pct(mtCtr)}`,
                spark: sparkRoas, stroke: "var(--series-1)", id: "roas",
              },
              {
                label: `Spend · ${periodLabel}`, value: mt.spend, format: "inr-compact" as const, suffix: "",
                delta: null,
                sub: (platformTotals.map((p) => `${p.platform === "meta" ? "Meta" : "Google"} ${pct(p.spend / monthSpendTotal, 0)}`).join(" · ") || "—")
                  + (manualGoogle ? " · Google from monthly report" : ""),
                spark: sparkSpend, stroke: "var(--brand-accent)", id: "spend",
              },
            ]).map((h) => (
              <div key={h.id}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                    {h.label}
                  </span>
                  {h.delta != null && Math.abs(h.delta) >= 0.005 && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular"
                      style={{
                        background: `color-mix(in srgb, ${h.delta > 0 ? "var(--status-good)" : "var(--status-critical)"} 15%, transparent)`,
                        color: h.delta > 0 ? "var(--delta-good)" : "var(--status-critical)",
                      }}
                      title={isCurrent ? "vs last month, same days" : "vs previous month"}>
                      {h.delta > 0 ? "▲" : "▼"} {Math.abs(h.delta * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="hero-number tabular num-gradient mt-1">
                  <AnimatedNumber value={h.value} format={h.format} />
                  {h.suffix && <span className="text-2xl font-semibold">{h.suffix}</span>}
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{h.sub}</span>
                  {h.spark.length > 1 && <Sparkline id={h.id} values={h.spark} stroke={h.stroke} />}
                </div>
              </div>
            ))}
          </div>
        </section>
      </FadeIn>

      {/* ===== INSIGHTS (scoped to selected month) ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader eyebrow="Signals" title="What the data is telling us"
          meta="click any card for the math" />
      </FadeIn>
      <FadeIn delay={0.05}>
        <InsightChips insights={insights} />
      </FadeIn>

      {/* ===== 1. Online vs offline ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader eyebrow="Money flow" title="Where revenue comes from"
          meta="online vs offline · divisions · best & worst" />
      </FadeIn>
      <FadeIn delay={0.05}>
        <OnlineOfflineCard month={dv.month} online={dv.onlineRevenueMtd}
          onlineIsTracked={dv.onlineIsTracked} offline={dv.offlineRevenue} href={`/${slug}/monthly`} />
      </FadeIn>

      {/* ===== 2. Divisions ===== */}
      <FadeIn delay={0.05}>
        <DivisionCards divisions={dv.divisions} slug={slug} month={dv.month} isPartial={dv.isPartial} />
      </FadeIn>

      {/* ===== 3–4. Hero & loser campaigns ===== */}
      <FadeIn delay={0.05}>
        <HeroLoserCards hero={dv.hero} loser={dv.loser} slug={slug} periodLabel={periodLabel} />
      </FadeIn>

      {/* ===== Conversion funnel ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader eyebrow="The funnel" title="From impression to purchase"
          meta={periodLabel} />
      </FadeIn>
      <FadeIn delay={0.05}>
        <div className="canvas-dark p-6">
          <Funnel stages={funnel.stages}
            subtitle="Meta attribution (Google's export has no stage data)"
            footer={`Meta flow: ${inrCompact(funnel.spend)} in → ${inrCompact(funnel.revenue)} out · ${(funnel.spend > 0 ? funnel.revenue / funnel.spend : 0).toFixed(2)}× ROAS on this funnel`} />
        </div>
      </FadeIn>

      {/* ===== Current-month operations: pacing + live KPIs ===== */}
      {isCurrent && (
        <FadeIn delay={0.05}>
          <SectionHeader eyebrow="Operations" title="Pace, pulse, and the daily grind"
            meta="live · current month only" />
        </FadeIn>
      )}
      {isCurrent && (
        <FadeIn delay={0.05}>
          <PacingCard asOf={pacing.asOf} metrics={pacing.metrics} />
        </FadeIn>
      )}
      {isCurrent && (
        <FadeIn delay={0.05}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile
              label="Spend (latest day)" value={inr(ov.today.spend)}
              prev={{ current: ov.today.spend, previous: ov.yesterday.spend }} prevLabel="vs previous day"
            />
            <KpiTile
              label="Orders MTD" value={num(ov.mtd.purchases)}
              prev={{ current: ov.mtd.purchases, previous: ov.prevMtd.purchases }} prevLabel="vs last month (same days)"
            />
            <KpiTile
              label="CPA MTD" value={inr(ov.mtd.cpa)} invert
              prev={{ current: ov.mtd.cpa, previous: ov.prevMtd.cpa }} prevLabel="vs last month"
            />
            <KpiTile label="CPM MTD" value={inr(ov.mtd.cpm)} sub={`CPC ${inr(ov.mtd.cpc)}`} />
          </div>
        </FadeIn>
      )}

      {/* ===== Trend (all history) ===== */}
      <FadeIn delay={0.05}>
        <TrendChart daily={daily} weekly={weekly} monthly={monthly} />
      </FadeIn>

      {/* ===== Daily ROAS heatmap (trailing 13 weeks) ===== */}
      <FadeIn delay={0.05}>
        <DayHeatmap days={heatDays} slug={slug} />
      </FadeIn>

      {/* ===== Top creatives (current operational state) ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader eyebrow="Creative engine" title="What deserves more budget" meta="live status" />
      </FadeIn>
      <FadeIn delay={0.05}>
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Creatives to scale · now</h3>
            <Link href={`/${slug}/creatives`} className="text-xs underline" style={{ color: "var(--text-secondary)" }}>
              All creatives →
            </Link>
          </div>
          {top.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No current winners — see creatives page.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {top.map((c) => (
                <Link key={c.ad_id} href={`/${slug}/creatives/${c.ad_id}`}
                  className="card card-lift block p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-xs font-medium">{c.ad_name}</span>
                    <StatusChip status={c.status} />
                  </div>
                  <div className="text-2xl font-bold tabular">
                    {ratio(c.window_spend > 0 ? c.window_revenue / c.window_spend : 0)}×
                    <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-muted)" }}>ROAS 14d</span>
                  </div>
                  <div className="mt-1 text-xs tabular" style={{ color: "var(--text-secondary)" }}>
                    {inrCompact(c.window_spend)} spend · {num(c.window_purchases)} orders
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
