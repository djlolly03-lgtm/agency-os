import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, getOverview, getTimeseries, getCreatives, getPacing, getDivisionOverview, getMonths,
  getFunnel, getDailyBlended, getAdRangeRollups, getGoals, getManualGoogleMonth, getMonthlyNameRollups,
  getCustomerEconomics, getMeasuredLtv, latestDay, getCampaignMonthly,
} from "@/lib/queries";
import { getCohortRetention, getRfmSegments } from "@/lib/shopify";
import { getRetentionChannels } from "@/lib/retention";
import { RetentionChannels } from "@/components/retention-channels";
import { CohortRetention } from "@/components/cohort-retention";
import { ExecSummary, EXEC_SUMMARY_COUNT } from "@/components/exec-summary";
import { Collapsible } from "@/components/collapsible";
import { CustomerEconomics } from "@/components/customer-economics";
import { PRODUCE, inSeason, classifyProduce, aggregateProduceMonth, seasonRadar, buildSeasonCalendar } from "@/lib/seasons";
import { SeasonRadar } from "@/components/season-radar";
import { SeasonCalendar } from "@/components/season-calendar";
import { Funnel } from "@/components/funnel";
import { DayHeatmap } from "@/components/day-heatmap";
import { computeInsights } from "@/lib/insights";
import { inr, inrCompact, num, ratio, pct, dayLabel, monthLabel } from "@/lib/format";
import { KpiTile } from "@/components/kpi";
import { TrendChart } from "@/components/trend-chart";
import { StatusChip } from "@/components/status-chip";
import { PacingCard } from "@/components/pacing-card";
import { PeriodPicker } from "@/components/period-picker";
import { OnlineOfflineCard, DivisionCards, HeroLoserCards } from "@/components/division-section";
import { FadeIn, AnimatedNumber } from "@/components/motion";
import { Sparkline } from "@/components/sparkline";
import { InsightChips } from "@/components/insight-chips";
import { SectionHeader } from "@/components/section-header";
import { Explain } from "@/components/explain";
import { HeroCinema, SpotlightStage } from "@/components/hero-cinema";
import { GrowthStory } from "@/components/growth-story";
import { MarginEngine } from "@/components/margin-engine";
import { ChannelDuel } from "@/components/channel-duel";
import { RevenueBridge, type BridgeMonth } from "@/components/revenue-bridge";
import { buildPeriods, previousWindow, buildMonthlySeries, shortMonth, monthEndDay } from "@/lib/periods";

export default async function OverviewPage({ params, searchParams }: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ month?: string; period?: string }>;
}) {
  const { client: slug } = await params;
  const sp = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const months = await getMonths(client.id);          // desc
  const asOf = await latestDay(client.id);            // cached; needed before the big fetch
  const monthsAsc = [...months].sort();
  const periods = buildPeriods(months);

  // ---- selection: a month (the atom) or a wider period ----
  const periodSel = sp.period ? periods.find((p) => p.key === sp.period) ?? null : null;
  // This is the OPERATOR's console, so it opens LIVE — the current month to
  // date. Insights about a month that closed three weeks ago are history, not
  // decisions: creative fatigue, hidden gems and pacing only mean anything
  // against spend that is running right now. The client-facing /review page
  // makes the opposite choice and opens on the last COMPLETE month, because
  // that document is the monthly meeting.
  // (Early in a month the MTD totals are small by definition — the hero says
  // "data through <day>" and deltas compare the same days last month.)
  const defaultMonth = months[0];
  const selectedMonth = !periodSel && sp.month && months.includes(sp.month + "-01")
    ? sp.month + "-01" : defaultMonth;
  const isMonthMode = !periodSel;
  const selectedKey = periodSel ? periodSel.key : selectedMonth.slice(0, 7);
  const isCurrent = isMonthMode && selectedMonth === months[0];
  const monthParam = isMonthMode ? selectedMonth.slice(0, 7) : months[0].slice(0, 7);

  const monthEnd = monthEndDay(selectedMonth);
  const prevMonthStart = new Date(Date.UTC(
    Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const prevMonthEnd = new Date(Date.UTC(
    Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);

  const [ov, daily, weekly, monthly, creatives, pacing, dv, heatDays, goalRows, nameRollups, custMonths, measuredLtv] = await Promise.all([
    getOverview(client.id),
    getTimeseries(client.id, "day"),
    getTimeseries(client.id, "week"),
    getTimeseries(client.id, "month"),
    getCreatives(client.id),
    getPacing(client.id),
    periodSel
      ? getDivisionOverview(client.id, undefined, { from: periodSel.from, to: periodSel.to })
      : getDivisionOverview(client.id, selectedMonth),
    getDailyBlended(client.id, 91),
    getGoals(client.id, selectedMonth),
    getMonthlyNameRollups(client.id),
    getCustomerEconomics(client.id),
    getMeasuredLtv(client.id),
  ]);
  const [cohortData, rfm, retentionMonths, campaignMonthly] = await Promise.all([
    getCohortRetention(client.id),
    getRfmSegments(client.id),
    getRetentionChannels(client.id),
    getCampaignMonthly(client.id),
  ]);
  // blended per-day totals across all history — day-of-week rule
  const blendedByDay = new Map<string, { day: string; spend: number; revenue: number; purchases: number }>();
  for (const r of daily) {
    const d = blendedByDay.get(r.period) ?? { day: r.period, spend: 0, revenue: 0, purchases: 0 };
    d.spend += r.spend; d.revenue += r.revenue; d.purchases += r.purchases;
    blendedByDay.set(r.period, d);
  }
  const blendedDaily = [...blendedByDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  const rangeStart = periodSel ? periodSel.from : selectedMonth;
  const rangeEndRaw = periodSel ? periodSel.to : monthEnd;
  const rangeEnd = rangeEndRaw < dv.asOf ? rangeEndRaw : dv.asOf;
  const [funnel, adRollups] = await Promise.all([
    getFunnel(client.id, { from: rangeStart, to: rangeEnd }),
    getAdRangeRollups(client.id, { from: rangeStart, to: rangeEnd }),
  ]);
  const periodLabel = periodSel
    ? periodSel.label
    : dv.isPartial ? "MTD" : monthLabel(selectedMonth.slice(0, 7));

  // ---- manual Google monthlies (months without daily Google rows) ----
  const googleDailyMonths = new Set(
    daily.filter((r) => r.platform === "google").map((r) => r.period.slice(0, 8) + "01"));
  const manualGoogleByMonth = new Map<string, { revenue: number; spend: number; purchases: number }>();
  await Promise.all(monthsAsc.filter((m) => !googleDailyMonths.has(m)).map(async (m) => {
    const g = await getManualGoogleMonth(client.id, m);
    if (g) manualGoogleByMonth.set(m, g);
  }));

  // ---- range-scoped aggregation from the daily timeseries ----
  const inRange = (p: string, from: string, to: string) => p >= from && p <= to;
  const rangeRows = daily.filter((r) => inRange(r.period, rangeStart, rangeEnd));
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
  const mt = sumRows(rangeRows);
  const pv = sumRows(prevRows);

  // fold manual Google monthlies into paid totals for every covered month
  const coveredMonths = periodSel ? periodSel.months : [selectedMonth];
  let manualGoogleSum: { revenue: number; spend: number; purchases: number } | null = null;
  for (const m of coveredMonths) {
    const g = manualGoogleByMonth.get(m);
    if (!g) continue;
    manualGoogleSum = manualGoogleSum
      ? { revenue: manualGoogleSum.revenue + g.revenue, spend: manualGoogleSum.spend + g.spend, purchases: manualGoogleSum.purchases + g.purchases }
      : { ...g };
  }
  if (manualGoogleSum) {
    mt.spend += manualGoogleSum.spend; mt.revenue += manualGoogleSum.revenue; mt.purchases += manualGoogleSum.purchases;
  }
  const prevManualGoogle = manualGoogleByMonth.get(prevMonthStart) ?? null;
  if (prevManualGoogle && !isCurrent && isMonthMode) {
    // only fold into prev for complete-month comparisons (manual inputs are monthly)
    pv.spend += prevManualGoogle.spend; pv.revenue += prevManualGoogle.revenue; pv.purchases += prevManualGoogle.purchases;
  }

  const mtRoas = mt.spend > 0 ? mt.revenue / mt.spend : 0;
  const pvRoas = pv.spend > 0 ? pv.revenue / pv.spend : 0;
  const mtCpa = mt.purchases > 0 ? mt.spend / mt.purchases : 0;
  const mtAov = mt.purchases > 0 ? mt.revenue / mt.purchases : 0;
  const mtCtr = mt.impressions > 0 ? mt.clicks / mt.impressions : 0;

  const platformTotals = ["meta", "google"].map((pf) => {
    const rows = rangeRows.filter((r) => r.platform === pf);
    const s = sumRows(rows);
    if (pf === "google" && manualGoogleSum) {
      s.spend += manualGoogleSum.spend; s.revenue += manualGoogleSum.revenue; s.purchases += manualGoogleSum.purchases;
    }
    return {
      platform: pf, spend: s.spend, revenue: s.revenue, purchases: s.purchases,
      impressions: s.impressions, roas: s.spend > 0 ? s.revenue / s.spend : 0,
      manual: pf === "google" && !!manualGoogleSum,
    };
  }).filter((p) => p.spend > 0);
  const monthSpendTotal = mt.spend || 1;

  // per-day blended series within the range (sparklines + insight CPA trend)
  const byDay = new Map<string, { day: string; spend: number; revenue: number; purchases: number }>();
  for (const r of rangeRows) {
    const d = byDay.get(r.period) ?? { day: r.period, spend: 0, revenue: 0, purchases: 0 };
    d.spend += r.spend; d.revenue += r.revenue; d.purchases += r.purchases;
    byDay.set(r.period, d);
  }
  const monthDaily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const sparkRevenue = monthDaily.map((d) => d.revenue);
  const sparkSpend = monthDaily.map((d) => d.spend);
  const sparkRoas = monthDaily.map((d) => (d.spend > 0 ? d.revenue / d.spend : 0));

  // ---- monthly series: the growth story + period rollups ----
  const paidByMonth = new Map<string, { revenue: number; spend: number; purchases: number }>();
  for (const r of daily) {
    const m = r.period.slice(0, 8) + "01";
    const s = paidByMonth.get(m) ?? { revenue: 0, spend: 0, purchases: 0 };
    s.revenue += r.revenue; s.spend += r.spend; s.purchases += r.purchases;
    paidByMonth.set(m, s);
  }
  const series = buildMonthlySeries({
    monthsAsc, paidByMonth, manualGoogleByMonth, custMonths, asOf: dv.asOf,
  });
  const seriesByMonth = new Map(series.map((s) => [s.month, s]));

  // goal for the selected month (explicit, else default prev-month +25%)
  const explicitGoal = goalRows.find((g) => String(g.metric) === "revenue");
  const goal = isMonthMode
    ? explicitGoal
      ? { target: Number(explicitGoal.target), isDefault: false }
      : pv.revenue > 0 ? { target: pv.revenue * 1.25, isDefault: true } : null
    : null;

  // ---- seasonal intelligence (month-scoped; calendar spans everything) ----
  const monthNum = Number(selectedMonth.slice(5, 7));
  const monthNameRows = nameRollups.filter((r) => r.month === selectedMonth);
  const produceAgg = aggregateProduceMonth(monthNameRows, monthNum);
  const historicalKeys = new Set(
    nameRollups.map((r) => classifyProduce(r.campaign, r.ad)?.key).filter(Boolean) as string[]);
  const radar = seasonRadar(produceAgg, monthNum, historicalKeys);
  const seasonCal = buildSeasonCalendar(nameRollups, monthsAsc);
  const inSeasonNow = isMonthMode
    ? PRODUCE.filter((pr) => pr.months.length < 12 && inSeason(pr, monthNum) && historicalKeys.has(pr.key))
    : [];

  const insights = computeInsights({
    slug, monthLabel: periodLabel, isCurrentMonth: isCurrent, monthParam,
    monthDaily, platformTotals, adRollups, goal, monthRevenue: mt.revenue,
    creatives: isCurrent ? creatives : undefined,
    pacing: isCurrent ? pacing.metrics : undefined,
    seasonal: isMonthMode
      ? { closing: radar.closing, missed: radar.missed, offSeason: radar.offSeason }
      : { closing: [], missed: [], offSeason: [] },
    customerMonths: custMonths,
    campaignMonthly, dailyAll: blendedDaily, asOf,
  });

  // ---- store-revenue view (matches the client's sheet mental model) ----
  let storeTotal: number | null;
  let storeOrders: number | null;
  let organicRev: number | null;
  let blendedRoas: number | null;
  let revDelta: number | null;
  let blendedDelta: number | null;
  let paidOnlyMonths: string[] = [];

  if (isMonthMode) {
    storeTotal = !dv.onlineIsTracked ? dv.onlineRevenueMtd : null;
    storeOrders = custMonths.find((m) => m.month === selectedMonth)?.totalOrders ?? null;
    const prevStore = custMonths.find((m) => m.month === prevMonthStart)?.totalRevenue ?? null;
    organicRev = storeTotal != null ? storeTotal - mt.revenue : null;
    blendedRoas = storeTotal != null && mt.spend > 0 ? storeTotal / mt.spend : null;
    const prevBlended = prevStore != null && pv.spend > 0 ? prevStore / pv.spend : null;
    revDelta = storeTotal != null
      ? (!isCurrent && prevStore ? storeTotal / prevStore - 1 : null)
      : (pv.revenue > 0 ? mt.revenue / pv.revenue - 1 : null);
    blendedDelta = blendedRoas != null && !isCurrent && prevBlended ? blendedRoas / prevBlended - 1 : null;
  } else {
    // period mode: sum the monthly series over the covered months
    const rows = periodSel!.months.map((m) => seriesByMonth.get(m)!).filter(Boolean);
    paidOnlyMonths = rows.filter((r) => r.source === "paid").map((r) => r.month);
    storeTotal = rows.reduce((t, r) => t + r.revenue, 0);
    storeOrders = rows.reduce((t, r) => t + r.orders, 0);
    organicRev = storeTotal - mt.revenue;
    blendedRoas = mt.spend > 0 ? storeTotal / mt.spend : null;
    const hasPartial = rows.some((r) => r.isPartial);
    const prevWin = previousWindow(periodSel!, monthsAsc);
    if (prevWin && !hasPartial) {
      const prevRowsS = prevWin.map((m) => seriesByMonth.get(m)!).filter(Boolean);
      const prevRev = prevRowsS.reduce((t, r) => t + r.revenue, 0);
      const prevSpend = prevRowsS.reduce((t, r) => t + r.spend, 0);
      revDelta = prevRev > 0 ? storeTotal / prevRev - 1 : null;
      const prevBl = prevSpend > 0 ? prevRev / prevSpend : null;
      blendedDelta = blendedRoas != null && prevBl ? blendedRoas / prevBl - 1 : null;
    } else {
      revDelta = null; blendedDelta = null;
    }
  }

  const top = creatives.filter((c) => c.active && (c.status === "winner" || c.status === "hidden_gem"))
    .sort((a, b) => b.window_revenue / Math.max(b.window_spend, 1) - a.window_revenue / Math.max(a.window_spend, 1))
    .slice(0, 4);

  // ---- hero KPI entries ----
  const heroEntries = [
    {
      label: `${storeTotal != null ? "Revenue" : "Paid revenue"} · ${periodLabel}`,
      value: storeTotal ?? mt.revenue, format: "inr-compact" as const, suffix: "",
      delta: revDelta,
      sub: storeTotal != null
        ? `paid ${inrCompact(mt.revenue)} · organic ${inrCompact(organicRev!)}${paidOnlyMonths.length ? "*" : ""} · ${storeOrders != null ? `${num(storeOrders)} orders` : `${num(mt.purchases)} paid orders`}`
        : `${num(mt.purchases)} orders · AOV ${inr(mtAov)}`,
      spark: sparkRevenue, stroke: "var(--brand)", id: "rev",
      math: {
        title: `${storeTotal != null ? "Store revenue" : "Paid revenue"} · ${periodLabel}`,
        steps: [
          ...(periodSel
            ? periodSel.months.map((m) => {
                const r = seriesByMonth.get(m)!;
                return {
                  label: `${shortMonth(m)}${r.isPartial ? " (MTD)" : ""} — ${r.source === "store" ? "store total" : "paid only*"}`,
                  value: inrCompact(r.revenue),
                };
              })
            : []),
          ...platformTotals.map((pf) => ({
            label: `${pf.platform === "meta" ? "Meta" : "Google"} attributed revenue${pf.platform === "google" && manualGoogleSum ? " (manual monthly)" : ""}`,
            value: inrCompact(pf.revenue),
          })),
          { label: "Paid revenue (Meta + Google)", value: inrCompact(mt.revenue) },
          ...(storeTotal != null ? [
            { label: "Organic = store total − paid", value: inrCompact(organicRev!) },
            { label: `Store total (Shopify${periodSel ? ", summed over the period" : ", entered daily in the sheet"})`, value: inrCompact(storeTotal) },
            ...(storeOrders != null ? [{ label: "Store orders", value: num(storeOrders) }] : []),
          ] : [
            { label: "Paid orders (platform-attributed)", value: num(mt.purchases) },
            { label: "AOV = paid revenue ÷ paid orders", value: inr(mtAov) },
          ]),
        ],
        formula: storeTotal != null
          ? `revenue = paid ${inrCompact(mt.revenue)} + organic ${inrCompact(organicRev!)} = ${inrCompact(storeTotal)}`
          : `paid revenue = ${platformTotals.map((pf) => inrCompact(pf.revenue)).join(" + ")} = ${inrCompact(mt.revenue)}`,
        note: paidOnlyMonths.length
          ? `*${paidOnlyMonths.map((m) => shortMonth(m)).join(", ")} ha${paidOnlyMonths.length > 1 ? "ve" : "s"} no Shopify store total on record — paid-attributed revenue is used for ${paidOnlyMonths.length > 1 ? "those months" : "that month"}, so organic is understated.`
          : storeTotal != null
            ? "Matches the sheet's Dashboard total. Store totals sync daily from the Dashboard tab (Shopify numbers incl. organic)."
            : "No store total available for this month — showing platform-attributed revenue only.",
        source: "Dashboard tab (Shopify daily) + platform exports · Sheets → Supabase",
        link: { href: `/${slug}/monthly`, label: "Monthly report →" },
      },
    },
    {
      label: `${blendedRoas != null ? "Blended ROAS" : "ROAS"} · ${periodLabel}`,
      value: blendedRoas ?? mtRoas, format: "ratio" as const, suffix: "×",
      delta: blendedRoas != null ? blendedDelta : (pvRoas > 0 ? mtRoas / pvRoas - 1 : null),
      sub: blendedRoas != null
        ? `paid ROAS ${ratio(mtRoas)}× · CPA ${inr(mtCpa)}`
        : `CPA ${inr(mtCpa)} · CTR ${pct(mtCtr)}`,
      spark: sparkRoas, stroke: "var(--series-1)", id: "roas",
      math: {
        title: `${blendedRoas != null ? "Blended ROAS" : "Paid ROAS"} · ${periodLabel}`,
        steps: [
          ...(blendedRoas != null ? [{ label: "Store revenue (Shopify, incl. organic)", value: inrCompact(storeTotal!) }] : []),
          { label: "Paid revenue (platform-attributed)", value: inrCompact(mt.revenue) },
          { label: "Paid spend", value: inrCompact(mt.spend) },
          { label: "Paid ROAS = paid revenue ÷ spend", value: `${ratio(mtRoas)}×` },
          { label: "CPA = spend ÷ paid orders", value: inr(mtCpa) },
        ],
        formula: blendedRoas != null
          ? `blended ROAS = ${inrCompact(storeTotal!)} ÷ ${inrCompact(mt.spend)} = ${ratio(blendedRoas)}×`
          : `ROAS = ${inrCompact(mt.revenue)} ÷ ${inrCompact(mt.spend)} = ${ratio(mtRoas)}×`,
        note: blendedRoas != null
          ? "Blended = every store rupee (incl. organic) per ad rupee — matches the sheet. Paid ROAS credits only platform-attributed revenue."
          : "Each platform self-attributes revenue — paid return only.",
        source: "Dashboard tab + platform exports · Sheets → Supabase",
        link: { href: `/${slug}/platforms`, label: "Platform comparison →" },
      },
    },
    {
      label: `Spend · ${periodLabel}`, value: mt.spend, format: "inr-compact" as const, suffix: "",
      delta: null,
      sub: (platformTotals.map((p) => `${p.platform === "meta" ? "Meta" : "Google"} ${pct(p.spend / monthSpendTotal, 0)}`).join(" · ") || "—")
        + (manualGoogleSum ? " · Google from monthly report" : ""),
      spark: sparkSpend, stroke: "var(--brand-accent)", id: "spend",
      math: {
        title: `Paid spend · ${periodLabel}`,
        steps: platformTotals.map((pf) => ({
          label: `${pf.platform === "meta" ? "Meta" : "Google"} spend${pf.platform === "google" && manualGoogleSum ? " (incl. manual monthly)" : ""} · ${pct(pf.spend / monthSpendTotal, 0)} share`,
          value: inrCompact(pf.spend),
        })),
        formula: `spend = ${platformTotals.map((pf) => inrCompact(pf.spend)).join(" + ")} = ${inrCompact(mt.spend)}`,
        note: manualGoogleSum ? "Months before May 2026 predate daily Google data — their Google figures come from the monthly report inputs." : undefined,
        source: "Platform daily exports · Sheets → Supabase",
        link: { href: `/${slug}/campaigns?range=${isCurrent ? "mtd" : "all"}`, label: "Campaign breakdown →" },
      },
    },
  ];

  const totalAllTime = series.reduce((t, s) => t + s.revenue, 0);

  // ---- 02 · channel duel: dynamic act title ----
  const duelBest = platformTotals.length >= 2 ? [...platformTotals].sort((a, b) => b.roas - a.roas)[0] : null;
  const duelBig = platformTotals.length >= 2 ? platformTotals.reduce((a, b) => (b.spend > a.spend ? b : a)) : null;
  const pfName = (p: string) => (p === "meta" ? "Meta" : "Google");
  const duelTitle = duelBest && duelBig
    ? duelBest.platform === duelBig.platform
      ? `${pfName(duelBest.platform)} leads on every rupee.`
      : `${pfName(duelBest.platform)} earns more per rupee. ${pfName(duelBig.platform)} gets the money.`
    : "";

  // ---- 01 · efficiency: dynamic act title ----
  const fullSeries = series.filter((s) => !s.isPartial);
  const spendScaleX = fullSeries.length > 1 && fullSeries[0].spend > 0
    ? fullSeries[fullSeries.length - 1].spend / fullSeries[0].spend : null;
  const marginTitle = spendScaleX != null && spendScaleX > 1.5
    ? `Spend scaled ${spendScaleX.toFixed(1)}× — ROAS didn’t flinch.`
    : "The margin engine";

  // ---- 03 · revenue bridge: per-month platform revenue splits ----
  const platRevByMonth = new Map<string, { meta: number; google: number }>();
  for (const r of daily) {
    const m = r.period.slice(0, 8) + "01";
    const slot = platRevByMonth.get(m) ?? { meta: 0, google: 0 };
    if (r.platform === "meta") slot.meta += r.revenue; else slot.google += r.revenue;
    platRevByMonth.set(m, slot);
  }
  for (const [m, g] of manualGoogleByMonth) {
    const slot = platRevByMonth.get(m) ?? { meta: 0, google: 0 };
    slot.google += g.revenue;
    platRevByMonth.set(m, slot);
  }
  const toBridgeMonth = (m: string | undefined): BridgeMonth | null => {
    if (!m) return null;
    const s = seriesByMonth.get(m);
    if (!s || s.storeRevenue == null || s.isPartial) return null;
    const pr = platRevByMonth.get(m) ?? { meta: 0, google: 0 };
    return {
      label: shortMonth(m), meta: pr.meta, google: pr.google,
      organic: s.storeRevenue - pr.meta - pr.google, total: s.storeRevenue,
    };
  };
  // complete-month pair: the selected month (or, on the running month, the
  // last complete one) vs the month before it
  const bridgeCurMonth = isMonthMode ? (isCurrent ? months[1] : selectedMonth) : undefined;
  const bridgePrevMonth = bridgeCurMonth
    ? new Date(Date.UTC(Number(bridgeCurMonth.slice(0, 4)), Number(bridgeCurMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10)
    : undefined;
  const bridgeCur = toBridgeMonth(bridgeCurMonth);
  const bridgePrev = toBridgeMonth(bridgePrevMonth);

  // numbered acts, in render order
  let actNo = 0;
  const num2 = () => String(++actNo).padStart(2, "0");

  // Scope labels: roughly half these acts answer to the period picker and half
  // are all-history by nature. Saying so on each header is the difference
  // between "this is Feb" and "some of this is Feb" — previously unstated.
  const custScopeMonth = custMonths.filter((m) => m.hasData && m.ltvCac != null).slice(-1)[0];
  const custScope = custScopeMonth ? monthLabel(custScopeMonth.month.slice(0, 7)) : "Latest data";

  return (
    <div className="flex flex-col gap-4">
      {/* ===== 3-line summary — the verdict, before the numbers ===== */}
      <FadeIn>
        <ExecSummary insights={insights} periodLabel={periodLabel} clientName={client.name} />
      </FadeIn>

      {/* ===== CINEMA HERO — full-bleed, spotlight reveals the data =====
          No negative margin here anymore: that trick pulled the hero up to
          bleed behind the fixed nav when the hero was the page's first
          element. Now the exec summary sits above it in normal flow, so
          pulling the hero up would drag it over the summary's lower lines
          instead — exactly what was happening. */}
      <div>
        <HeroCinema skyline={sparkRevenue} minHeight="72vh">
          <div className="flex min-h-[72vh] flex-col pb-10 pt-24 sm:pt-28">
            {/* headline */}
            <div className="mt-2 text-center sm:mt-6">
              <h1 className="cinema-h1 text-4xl sm:text-6xl md:text-7xl">
                <span className="line-serif hero-anim hero-reveal" style={{ animationDelay: "0.25s" }}>
                  Fresh produce,
                </span>
                <span className="line-sans hero-anim hero-reveal" style={{ animationDelay: "0.42s" }}>
                  fresher numbers.
                </span>
              </h1>
              <p className="hero-anim hero-fade mx-auto mt-5 text-xs sm:text-sm"
                style={{ animationDelay: "0.6s", color: "rgba(255,255,255,0.65)" }}>
                {periodSel
                  ? `${periodSel.longLabel}${rangeEnd === dv.asOf ? ` · data through ${dayLabel(dv.asOf)}` : ""}`
                  : isCurrent
                    ? `Live · data through ${dayLabel(dv.asOf)} · synced every morning`
                    : `${monthLabel(monthParam)} · complete month`}
                {inSeasonNow.length > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold" style={{ color: "#7ff0d8" }}>in season:</span>{" "}
                    {inSeasonNow.slice(0, 4).map((pr) => pr.label).join(" · ")}
                    {inSeasonNow.length > 4 ? ` +${inSeasonNow.length - 4}` : ""}
                  </>
                )}
              </p>
            </div>

            {/* time controls */}
            <div className="hero-anim hero-fade mt-5 flex justify-center" style={{ animationDelay: "0.7s" }}>
              <PeriodPicker months={months} periods={periods} selectedKey={selectedKey} basePath={`/${slug}`} center />
            </div>

            <div className="min-h-6 flex-1" />

            {/* the numbers */}
            <div className="hero-anim hero-fade grid gap-7 md:grid-cols-3" style={{ animationDelay: "0.85s" }}>
              {heroEntries.map((h) => (
                <Explain key={h.id} block math={h.math}>
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
                        title={isCurrent ? "vs last month, same days" : "vs previous period"}>
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
                </Explain>
              ))}
            </div>

            {/* bottom copy + CTA */}
            <div className="mt-10 flex items-end justify-between gap-6">
              <p className="hero-anim hero-fade hidden max-w-[280px] text-sm leading-relaxed sm:block"
                style={{ animationDelay: "1s", color: "rgba(255,255,255,0.6)" }}>
                Synced every morning from Meta, Google Ads and Shopify. Every number on this
                page opens into the math behind it — click one.
              </p>
              <div className="hero-anim hero-fade flex flex-col items-start gap-3" style={{ animationDelay: "1.1s" }}>
                <p className="max-w-[260px] text-xs leading-relaxed sm:text-sm"
                  style={{ color: "rgba(255,255,255,0.6)" }}>
                  {monthsAsc.length} months on the road — {inrCompact(totalAllTime)} in revenue and counting.
                </p>
                <a href="#story" className="cta-pill">Dig into the data</a>
              </div>
            </div>
          </div>
        </HeroCinema>
      </div>

      <div id="story" />

      {/* ===== Period mode leads with the growth story ===== */}
      {periodSel && (
        <>
          <FadeIn>
            <SectionHeader index={num2()} eyebrow="Growth &amp; efficiency" title={marginTitle}
              meta={`monthly revenue, then revenue vs spend · ${periodSel.label} highlighted`}
              scope="All time" />
          </FadeIn>
          <FadeIn>
            <GrowthStory series={series} accentMonths={periodSel.months} />
          </FadeIn>
          <FadeIn>
            <MarginEngine series={series} />
          </FadeIn>
        </>
      )}

      {/* ===== Customer engine ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader index={num2()} eyebrow="Customer engine" title="What a customer costs — and what one is worth"
          meta="from client-reported monthly customer counts" scope={custScope} />
      </FadeIn>
      <FadeIn delay={0.05}>
        <SpotlightStage>
          <CustomerEconomics months={custMonths} slug={slug} measuredLtv={measuredLtv} rfm={rfm} />
        </SpotlightStage>
      </FadeIn>

      {/* ===== Cohort retention ===== */}
      {cohortData && cohortData.cohorts.length > 1 && (
        <>
          <FadeIn delay={0.05}>
            <SectionHeader index={num2()} eyebrow="Cohorts" title="Who comes back, and when."
              meta="signup month × months since — from the Shopify order history" scope="All time" />
          </FadeIn>
          <FadeIn delay={0.05}>
            <CohortRetention cohorts={cohortData.cohorts} maxOffset={cohortData.maxOffset} />
          </FadeIn>
        </>
      )}

      {/* ===== INSIGHTS (scoped to selection) ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader index={num2()} eyebrow="Signals" title="What the data is telling us"
          meta="the summary's three, plus everything below them" scope={periodLabel} />
      </FadeIn>
      <FadeIn delay={0.05}>
        {/* skip the ones already promoted above the hero — they used to render
            twice on the same page, verbatim */}
        <InsightChips insights={insights} skip={EXEC_SUMMARY_COUNT} />
      </FadeIn>

      {/* ===== Money flow ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader index={num2()} eyebrow="Money flow" title="Where revenue comes from"
          meta="online vs offline · divisions · best & worst" scope={periodLabel} />
      </FadeIn>
      <FadeIn delay={0.05}>
        <OnlineOfflineCard month={dv.month} online={dv.onlineRevenueMtd}
          onlineIsTracked={dv.onlineIsTracked} offline={dv.offlineRevenue} href={`/${slug}/monthly`} />
      </FadeIn>
      <FadeIn delay={0.05}>
        <DivisionCards divisions={dv.divisions} slug={slug} month={dv.month} isPartial={dv.isPartial} />
      </FadeIn>
      <FadeIn delay={0.05}>
        <HeroLoserCards hero={dv.hero} loser={dv.loser} slug={slug} periodLabel={periodLabel} />
      </FadeIn>

      {/* ===== The bridge: where last month's change came from ===== */}
      {bridgePrev && bridgeCur && (
        <>
          <FadeIn delay={0.05}>
            <SectionHeader index={num2()} eyebrow="The bridge"
              title={`${bridgePrev.label} → ${bridgeCur.label}: where the change came from.`}
              meta="Meta · Google · organic — measured, not modelled"
              scope={`${bridgePrev.label} → ${bridgeCur.label}`} />
          </FadeIn>
          <FadeIn delay={0.05}>
            <RevenueBridge prev={bridgePrev} cur={bridgeCur} />
          </FadeIn>
        </>
      )}

      {/* ===== Channels: Meta vs Google ===== */}
      {platformTotals.length >= 2 && (
        <>
          <FadeIn delay={0.05}>
            <SectionHeader index={num2()} eyebrow="Channels" title={duelTitle}
              meta="winner ticks per metric" scope={periodLabel} />
          </FadeIn>
          <FadeIn delay={0.05}>
            <ChannelDuel platforms={platformTotals} periodLabel={periodLabel} />
          </FadeIn>
        </>
      )}

      {/* the third channel the duel never shows — money made from customers
          we already paid for. Awaiting-data state until the tab lands. */}
      <FadeIn delay={0.05}>
        <RetentionChannels rows={retentionMonths} paidRoas={mtRoas > 0 ? mtRoas : null}
          selectedMonth={selectedMonth} />
      </FadeIn>

      {/* ===== Growth story (month mode: after money flow) ===== */}
      {!periodSel && (
        <>
          <FadeIn delay={0.05}>
            <SectionHeader index={num2()} eyebrow="Growth &amp; efficiency" title={marginTitle}
              meta={`all ${monthsAsc.length} months · ${selectedKey === months[0].slice(0, 7) ? "this month" : monthLabel(selectedKey)} highlighted`}
              scope="All time" />
          </FadeIn>
          <FadeIn delay={0.05}>
            <GrowthStory series={series} accentMonths={[selectedMonth]} />
          </FadeIn>
          <FadeIn delay={0.05}>
            <MarginEngine series={series} />
          </FadeIn>
        </>
      )}

      {/* ===== Seasons ===== */}
      <div id="seasons" style={{ scrollMarginTop: "100px" }} />
      <FadeIn delay={0.05}>
        <SectionHeader index={num2()} eyebrow="Seasons" title="Selling what nature ships"
          meta="produce windows vs actual sales · India seasons" scope={periodLabel} />
      </FadeIn>
      {isMonthMode && (
        <FadeIn delay={0.05}>
          <SeasonRadar riding={radar.riding} missed={radar.missed} offSeason={radar.offSeason} />
        </FadeIn>
      )}
      {/* the full produce × month grid is reference material — the radar above
          already answers "what should we be selling right now" */}
      <FadeIn delay={0.05}>
        <Collapsible title="Season calendar — every window, every month"
          teaser={`${seasonCal.length} items across ${monthsAsc.length} months`}>
          <SeasonCalendar rows={seasonCal} months={monthsAsc} />
        </Collapsible>
      </FadeIn>

      {/* ===== Conversion funnel — the single biggest block on the page, and
          Meta-only mid-funnel plumbing. Worth having, not worth a full screen
          of the default scroll: the headline conversion rate rides on the
          summary line, the stage-by-stage detail is one click away. ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader index={num2()} eyebrow="The funnel" title="From impression to purchase"
          meta="Meta attribution — Google's export has no stage data" scope={periodLabel} />
      </FadeIn>
      <FadeIn delay={0.05}>
        <Collapsible
          title="Impression → purchase, stage by stage"
          teaser={`${inrCompact(funnel.spend)} in → ${inrCompact(funnel.revenue)} out · ${(funnel.spend > 0 ? funnel.revenue / funnel.spend : 0).toFixed(2)}× on this funnel`}>
          <Funnel stages={funnel.stages}
            subtitle="Meta attribution (Google's export has no stage data)" />
        </Collapsible>
      </FadeIn>

      {/* ===== Current-month operations: pacing + live KPIs ===== */}
      {isCurrent && (
        <FadeIn delay={0.05}>
          <SectionHeader index={num2()} eyebrow="Operations" title="Pace, pulse, and the daily grind"
            meta="live · current month only" scope="Month to date" />
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

      {/* ===== Exploration tools, not narrative — they answer questions you
          arrive with, so they wait until you go looking. ===== */}
      <FadeIn delay={0.05}>
        <Collapsible title="Explore the raw trend"
          teaser="any metric, any grain · daily ROAS heatmap">
          <div className="flex flex-col gap-4">
            <TrendChart daily={daily} weekly={weekly} monthly={monthly} />
            <DayHeatmap days={heatDays} slug={slug} />
          </div>
        </Collapsible>
      </FadeIn>

      {/* ===== Top creatives (current operational state) ===== */}
      <FadeIn delay={0.05}>
        <SectionHeader index={num2()} eyebrow="Creative engine" title="What deserves more budget"
          meta="live status" scope="Last 14 days" />
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
