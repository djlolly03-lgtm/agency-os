/**
 * Insights engine: interprets the numbers instead of just displaying them.
 * Deterministic and explainable — every insight carries its derivation
 * (inputs → formula → result). All insights are scoped to the SELECTED
 * month; operational "act now" insights (gems, fatigue, pacing) only
 * appear when viewing the current month.
 *
 * Every insight also carries a `severity` (critical / watch / fyi) and an
 * optional `action` — the one-line "so what do I do" that turns an
 * observation into a decision. Severity drives ranking: computeInsights()
 * returns critical items first, so a future "what needs my attention right
 * now" view can just take the front of the array instead of re-deriving
 * priority from scratch. This is the engine change only — no new UI yet;
 * existing consumers (InsightChips, ExecSummary) already just render
 * whatever order the array comes back in, so this reorders what they show
 * without requiring changes on their end.
 */
import type { CreativeRollup, PacingMetric, CustomerMonth } from "./queries";
import type { ProduceMonthAgg } from "./seasons";
import { seasonLabel, classifyProduce, PRODUCE } from "./seasons";

export interface InsightMathStep { label: string; value: string }

export type InsightIcon = "flame" | "trend-down" | "trend-up" | "zap" | "gem" | "target" | "check" | "sun" | "leaf" | "users";

/**
 * critical — actively losing money / needs a decision this week.
 * watch    — an opportunity or a risk worth monitoring, not urgent.
 * fyi      — good news or context; nothing to act on.
 */
export type InsightSeverity = "critical" | "watch" | "fyi";

export interface Insight {
  icon: InsightIcon;
  category: string;               // small uppercase kicker, e.g. "CREATIVE WINNER"
  metric: string;                 // the big stat headline, e.g. "+82%"
  text: string;
  tone: "win" | "warn" | "risk" | "info" | "ai";
  severity: InsightSeverity;
  /**
   * move   — names a specific thing to CHANGE this week: a budget, a
   *          schedule, a creative, an audience. A buyer can act on it today.
   * signal — reports state. True and worth knowing, but nothing to do
   *          with it directly.
   * The console leads with moves; signals sit underneath. Without this
   * split, severity ranking floats status ("LTV:CAC is 1.7×") above
   * instructions ("cap this campaign"), which is how a decision engine
   * quietly turns back into a report.
   */
  kind: "move" | "signal";
  /** one-line recommended next step — omitted when there's genuinely nothing to do */
  action?: string;
  /** which sheet/tab/export the claim rests on — the "every number traces to
   *  raw data" promise, made visible rather than asserted */
  tracesTo?: string;
  /** what it costs to ignore this, in money or forgone ground. Omitted for
   *  good news, where inaction costs nothing. */
  costOfInaction?: string;
  math: {
    steps: InsightMathStep[];
    formula: string;
    note?: string;
  };
  link?: { href: string; label: string };
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { critical: 0, watch: 1, fyi: 2 };
export const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  critical: "Needs action",
  watch: "Worth watching",
  fyi: "For your info",
};

const inr = (v: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(v))}`;
const compact = (v: number) => {
  const a = Math.abs(v);
  return a >= 1_00_00_000 ? `₹${(v / 1_00_00_000).toFixed(2)} Cr` : a >= 1_00_000 ? `₹${(v / 1_00_000).toFixed(1)} L` : a >= 1_000 ? `₹${(v / 1_000).toFixed(1)}k` : inr(v);
};

export interface MonthInsightInput {
  slug: string;
  monthLabel: string;                       // "Nov 2025" / "MTD"
  isCurrentMonth: boolean;
  monthParam: string;                       // "2025-11"
  /** blended per-day totals within the selected month, ascending */
  monthDaily: Array<{ day: string; spend: number; purchases: number; revenue: number }>;
  /** platform totals within the selected month */
  platformTotals: Array<{ platform: string; spend: number; revenue: number; roas: number }>;
  /** per-ad rollups within the selected month (Meta) */
  adRollups: Array<{ ad_id: string; ad_name: string; campaign: string; spend: number; revenue: number; purchases: number }>;
  /** goal for the month (explicit or default) + actual revenue — for attainment/pacing */
  goal: { target: number; isDefault: boolean } | null;
  monthRevenue: number;
  // current-month-only operational state:
  creatives?: CreativeRollup[];
  pacing?: PacingMetric[];
  /** seasonal produce radar for the selected month */
  seasonal?: { closing: ProduceMonthAgg[]; missed: ProduceMonthAgg[]; offSeason: ProduceMonthAgg[] };
  /** customer economics months (only those with client data) */
  customerMonths?: CustomerMonth[];
  /** campaign × month history — trajectory rules (saturation, platform split) */
  campaignMonthly?: Array<{ month: string; campaign: string; platform: string; spend: number; revenue: number; purchases: number }>;
  /** blended daily totals across all history — day-of-week efficiency */
  dailyAll?: Array<{ day: string; spend: number; revenue: number; purchases: number }>;
  /** latest ingested day — lets trajectory rules drop the in-progress month */
  asOf?: string;
}

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pfName = (p: string) => (p === "meta" ? "Meta" : p === "google" ? "Google" : p);

/**
 * Buyer-lever rules — the three questions a media buyer asks that a
 * single-month snapshot structurally cannot answer:
 *   1. which campaign have we scaled past its ceiling
 *   2. is a product performing on the wrong platform
 *   3. are we buying every weekday as if they convert alike
 * Each returns spend a buyer can move this week, not an observation.
 */
function buyerInsights(input: MonthInsightInput): Insight[] {
  const out: Insight[] = [];
  const { slug, campaignMonthly = [], dailyAll = [] } = input;

  // ---- A. scaled past the ceiling: spend up while ROAS falls ----
  // Compares the FIRST half of a campaign's complete-month history against
  // the SECOND half. A trailing 3-vs-3 window was tried first and missed the
  // account's biggest laggard: one strong month inside the recent window
  // averaged the decline away. Saturation is a slow curve, so the halves see
  // it where a short window doesn't. The in-progress month is excluded —
  // a part-month understates spend and would fake a slowdown.
  const completeOnly = input.asOf
    ? campaignMonthly.filter((r) => r.month.slice(0, 7) < input.asOf!.slice(0, 7))
    : campaignMonthly;
  if (completeOnly.length) {
    const agg = (rows: typeof campaignMonthly) => rows.reduce(
      (t, r) => ({ spend: t.spend + r.spend, revenue: t.revenue + r.revenue }), { spend: 0, revenue: 0 });
    const byCampaign = new Map<string, typeof campaignMonthly>();
    for (const r of completeOnly) {
      const k = `${r.platform}|${r.campaign}`;
      const list = byCampaign.get(k);
      if (list) list.push(r); else byCampaign.set(k, [r]);
    }
    const monthsAsc = [...new Set(completeOnly.map((r) => r.month))].sort();
    const lastTwo = monthsAsc.slice(-2);
    const acct = agg(completeOnly.filter((r) => lastTwo.includes(r.month)));
    const blended = acct.spend > 0 ? acct.revenue / acct.spend : 0;

    const decayed = [...byCampaign.entries()].map(([k, rows]) => {
      const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
      const half = Math.floor(sorted.length / 2);
      const early = agg(sorted.slice(0, half)), late = agg(sorted.slice(half));
      const eRoas = early.spend > 0 ? early.revenue / early.spend : 0;
      const lRoas = late.spend > 0 ? late.revenue / late.spend : 0;
      return {
        name: k.split("|")[1], platform: k.split("|")[0], months: sorted.length,
        early, late, eRoas, lRoas,
        perMonth: late.spend / Math.max(sorted.length - half, 1),
        spendUp: early.spend > 0 ? late.spend / early.spend - 1 : 0,
        roasDown: eRoas > 0 ? 1 - lRoas / eRoas : 0,
      };
    }).filter((c) =>
      c.months >= 4 &&                  // enough history for halves to mean anything
      c.late.spend >= 50_000 &&         // real money still flowing in
      c.spendUp >= 0.25 &&              // we leaned in hard
      c.roasDown >= 0.2 &&              // and it got materially worse
      c.lRoas < blended)                // and it now drags the account
      .sort((a, b) => b.late.spend * (blended - b.lRoas) - a.late.spend * (blended - a.lRoas));

    if (decayed.length && blended > 0) {
      const c = decayed[0];
      const upside = c.perMonth * (blended - c.lRoas);
      out.push({
        icon: "trend-down",
        category: "Scaled past the ceiling",
        kind: "move",
        metric: `${c.lRoas.toFixed(2)}×`,
        text: `“${truncate(c.name, 44)}” returns ${c.lRoas.toFixed(2)}× against a ${blended.toFixed(2)}× account — down from ${c.eRoas.toFixed(2)}× earlier in its life, while its budget rose ${Math.round(c.spendUp * 100)}%.`,
        tone: "risk",
        severity: "critical",
        action: `Cap ${pfName(c.platform)}'s “${truncate(c.name, 30)}” and redeploy — more money has stopped buying more return.`,
        tracesTo: `${pfName(c.platform)} daily export → spend and revenue by campaign, ${c.months} complete months`,
        costOfInaction: `≈${compact(upside)}/month foregone versus running that budget at the account average`,
        math: {
          steps: [
            { label: `Spend, first ${Math.floor(c.months / 2)} months`, value: compact(c.early.spend) },
            { label: "ROAS then", value: `${c.eRoas.toFixed(2)}×` },
            { label: `Spend, latest ${c.months - Math.floor(c.months / 2)} months`, value: compact(c.late.spend) },
            { label: "ROAS now", value: `${c.lRoas.toFixed(2)}×` },
            { label: "Account ROAS, last 2 complete months", value: `${blended.toFixed(2)}×` },
            { label: "This campaign, per month", value: compact(c.perMonth) },
          ],
          formula: `upside = ${compact(c.perMonth)} × (${blended.toFixed(2)} − ${c.lRoas.toFixed(2)}) ≈ ${compact(upside)}/month`,
          note: "Rising spend with falling return is the signature of a campaign bought past saturation — the fix is a budget cap, not new creative. Ranked by recoverable rupees, not by ROAS alone.",
        },
        link: { href: `/${slug}/campaigns`, label: "Open campaigns →" },
      });
    }
  }

  // ---- B. same product, wrong platform ----
  if (campaignMonthly.length) {
    const monthsAsc = [...new Set(campaignMonthly.map((r) => r.month))].sort();
    const window = monthsAsc.slice(-2);
    const byKey = new Map<string, { spend: number; revenue: number }>();
    // campaigns that deliberately span the catalogue can't be attributed to
    // one product line — comparing them platform-to-platform is meaningless
    const MIXED = /all fruits|performance max|pmax|only feed|app promotion/i;
    const LINES: Array<[string, RegExp]> = [
      ["Vegetables", /\bveg(gies|etables?)\b/i],
      ["Groceries", /\bgrocer/i],
    ];
    for (const r of campaignMonthly.filter((x) => window.includes(x.month))) {
      if (MIXED.test(r.campaign)) continue;
      const produce = classifyProduce(r.campaign, null);
      const line = produce ? null : LINES.find(([, re]) => re.test(r.campaign));
      if (!produce && !line) continue;
      const k = `${produce ? produce.key : line![0]}|${r.platform}`;
      const cur = byKey.get(k) ?? { spend: 0, revenue: 0 };
      cur.spend += r.spend; cur.revenue += r.revenue;
      byKey.set(k, cur);
    }
    const byProduce = new Map<string, Array<{ platform: string; spend: number; roas: number }>>();
    for (const [k, v] of byKey) {
      if (v.spend < 8000) continue;                    // both sides need real money
      const [pk, platform] = k.split("|");
      const list = byProduce.get(pk) ?? [];
      list.push({ platform, spend: v.spend, roas: v.revenue / v.spend });
      byProduce.set(pk, list);
    }
    const splits = [...byProduce.entries()]
      .filter(([, l]) => l.length === 2)
      .map(([pk, l]) => {
        const [hi, lo] = [...l].sort((a, b) => b.roas - a.roas);
        return { pk, hi, lo, gap: lo.roas > 0 ? hi.roas / lo.roas - 1 : Infinity };
      })
      .filter((s) => s.gap >= 0.6)
      .sort((a, b) => b.lo.spend - a.lo.spend);

    if (splits.length) {
      const s = splits[0];
      const label = PRODUCE.find((p) => p.key === s.pk)?.label ?? s.pk;
      const googleWins = s.hi.platform === "google";
      const upside = s.lo.spend * (s.hi.roas - s.lo.roas);
      out.push({
        icon: "zap",
        category: "Same product, wrong platform",
        kind: "move",
        metric: `${s.hi.roas.toFixed(2)}× vs ${s.lo.roas.toFixed(2)}×`,
        text: `${label} returns ${s.hi.roas.toFixed(2)}× on ${pfName(s.hi.platform)} but only ${s.lo.roas.toFixed(2)}× on ${pfName(s.lo.platform)} — same product, same weeks.`,
        tone: "warn",
        severity: s.lo.roas < 1 ? "critical" : "watch",
        action: `Move the ${label} budget from ${pfName(s.lo.platform)} to ${pfName(s.hi.platform)}, where the same demand is already converting.`,
        tracesTo: "Campaign names matched to the produce calendar, split by platform · last 2 months",
        costOfInaction: `≈${compact(upside)} of revenue the same budget would have earned on ${pfName(s.hi.platform)}`,
        math: {
          steps: [
            { label: `${pfName(s.hi.platform)} spend`, value: compact(s.hi.spend) },
            { label: `${pfName(s.hi.platform)} ROAS`, value: `${s.hi.roas.toFixed(2)}×` },
            { label: `${pfName(s.lo.platform)} spend`, value: compact(s.lo.spend) },
            { label: `${pfName(s.lo.platform)} ROAS`, value: `${s.lo.roas.toFixed(2)}×` },
          ],
          formula: `upside = ${compact(s.lo.spend)} × (${s.hi.roas.toFixed(2)} − ${s.lo.roas.toFixed(2)}) ≈ ${compact(upside)}`,
          note: `Both sides carry real spend, so this is a platform-fit read rather than a small-sample artefact. Platforms self-attribute — treat the gap directionally, act on its size.${googleWins ? " Part of Google's edge here is brand search, so expect the realised lift to land under the headline gap." : ""}`,
        },
        link: { href: `/${slug}#channels`, label: "Platform comparison →" },
      });
    }
  }

  // ---- C. buying every weekday alike ----
  if (dailyAll.length >= 60) {
    const recent = dailyAll.slice(-120);
    const buckets = Array.from({ length: 7 }, () => ({ spend: 0, revenue: 0, purchases: 0 }));
    for (const d of recent) {
      const idx = new Date(d.day + "T00:00:00Z").getUTCDay();
      buckets[idx].spend += d.spend; buckets[idx].revenue += d.revenue; buckets[idx].purchases += d.purchases;
    }
    const days = buckets.map((b, i) => ({
      name: DOW_NAMES[i], ...b, roas: b.spend > 0 ? b.revenue / b.spend : 0,
    })).filter((d) => d.spend > 0);
    if (days.length === 7) {
      const sorted = [...days].sort((a, b) => b.roas - a.roas);
      const best = sorted[0], worst = sorted[sorted.length - 1];
      const gap = worst.roas > 0 ? best.roas / worst.roas - 1 : 0;
      const spendSpread = Math.max(...days.map((d) => d.spend)) / Math.max(Math.min(...days.map((d) => d.spend)), 1) - 1;
      // only worth saying when the return gap is real AND spend is roughly flat
      // — if budget already follows the good days there is nothing to move
      if (gap >= 0.15 && spendSpread < 0.35) {
        const bottom3 = sorted.slice(-3);
        const moveable = bottom3.reduce((s, d) => s + d.spend, 0) * 0.15;
        const upside = moveable * (best.roas - worst.roas);
        out.push({
          icon: "target",
          category: "Weekday buying",
          kind: "move",
          metric: `${Math.round(gap * 100)}%`,
          text: `${best.name}s return ${best.roas.toFixed(2)}× and ${worst.name}s ${worst.roas.toFixed(2)}× — yet spend is within ${Math.round(spendSpread * 100)}% across every day of the week.`,
          tone: "warn",
          severity: "watch",
          action: `Shift 15% of ${bottom3.map((d) => d.name.slice(0, 3)).join("/")} budget into ${sorted.slice(0, 2).map((d) => d.name.slice(0, 3)).join("/")} — a bid-schedule change, no new campaign needed.`,
          tracesTo: "Blended daily spend and revenue, trailing 120 days, grouped by day of week",
          costOfInaction: `≈${compact(upside)}/month left on the table by buying every weekday at the same weight`,
          math: {
            steps: sorted.map((d) => ({ label: `${d.name} · ${compact(d.spend)} spend`, value: `${d.roas.toFixed(2)}×` })),
            formula: `gap = ${best.roas.toFixed(2)} ÷ ${worst.roas.toFixed(2)} − 1 = ${Math.round(gap * 100)}%`,
            note: "Order date, not delivery date — some of this is genuine weekly demand rhythm rather than media efficiency. Run it for two weeks before committing the budget.",
          },
          link: { href: `/${slug}/campaigns`, label: "Open campaigns →" },
        });
      }
    }
  }

  return out;
}

export function computeInsights(input: MonthInsightInput): Insight[] {
  // Buyer-lever rules lead: within a severity tier they rank ahead of the
  // generic observations because each one names a specific budget to move.
  const out: Insight[] = [...buyerInsights(input)];
  const { slug, monthLabel, isCurrentMonth, monthParam, monthDaily, platformTotals, adRollups } = input;

  // month baseline over Meta ads
  const mSpend = adRollups.reduce((s, a) => s + a.spend, 0);
  const mRev = adRollups.reduce((s, a) => s + a.revenue, 0);
  const baseRoas = mSpend > 0 ? mRev / mSpend : 0;

  // ---- 1. creative winner of the month ----
  const floor = Math.max(2000, mSpend * 0.02);
  const stars = adRollups.filter((a) => a.spend >= floor)
    .map((a) => ({ a, roas: a.revenue / a.spend }))
    .sort((x, y) => y.roas - x.roas);
  if (stars.length && baseRoas > 0 && stars[0].roas > baseRoas * 1.3) {
    const s = stars[0];
    const overBy = Math.round((s.roas / baseRoas - 1) * 100);
    out.push({
      icon: "flame",
      category: "Creative winner",
      kind: "move",
      metric: `+${overBy}%`,
      text: `“${truncate(s.a.ad_name)}” beat the account average — ${s.roas.toFixed(2)}× ROAS on ${compact(s.a.spend)}.`,
      tone: "win",
      severity: "watch",
      action: "Feed it more budget — it's already outperforming the account average.",
      tracesTo: "Meta ad export (Raw Data tab) → spend and revenue by ad",
      costOfInaction: "A proven winner stays under-funded while weaker ads keep their budget",
      math: {
        steps: [
          { label: `Creative spend (${monthLabel})`, value: compact(s.a.spend) },
          { label: `Creative revenue (${monthLabel})`, value: compact(s.a.revenue) },
          { label: "Creative ROAS = revenue ÷ spend", value: `${s.roas.toFixed(2)}×` },
          { label: `Account Meta spend (${monthLabel})`, value: compact(mSpend) },
          { label: `Account Meta revenue (${monthLabel})`, value: compact(mRev) },
          { label: "Account ROAS = revenue ÷ spend", value: `${baseRoas.toFixed(2)}×` },
        ],
        formula: `outperformance = ${s.roas.toFixed(2)} ÷ ${baseRoas.toFixed(2)} − 1 = +${overBy}%`,
        note: `Spend floor ${compact(floor)} so tiny tests can't top the list. Meta ads only (Google has no ad-level data).`,
      },
      link: { href: `/${slug}/creatives/${s.a.ad_id}`, label: "Open this creative →" },
    });
  }

  // ---- 2. CPA trend within the month: last 5 data days vs prior 5 ----
  if (monthDaily.length >= 10) {
    const recent5 = monthDaily.slice(-5), prior5 = monthDaily.slice(-10, -5);
    const agg = (xs: typeof monthDaily) => ({
      spend: xs.reduce((a, x) => a + x.spend, 0),
      purchases: xs.reduce((a, x) => a + x.purchases, 0),
    });
    const r = agg(recent5), p = agg(prior5);
    if (r.purchases > 0 && p.purchases > 0) {
      const recent = r.spend / r.purchases, prior = p.spend / p.purchases;
      const deltaPct = (recent / prior - 1) * 100;
      if (Math.abs(deltaPct) >= 12) {
        const up = deltaPct > 0;
        const range = (xs: typeof monthDaily) => `${xs[0].day.slice(5)} → ${xs[xs.length - 1].day.slice(5)}`;
        out.push({
          icon: up ? "trend-up" : "trend-down",
          category: "Cost per order",
          kind: "signal",
          metric: `${up ? "+" : "−"}${Math.round(Math.abs(deltaPct))}%`,
          text: up
            ? `Cost per order rose to ${inr(recent)} in the last 5 days of the period (was ${inr(prior)}).`
            : `Cost per order dropped to ${inr(recent)} in the last 5 days of the period (was ${inr(prior)}).`,
          tone: up ? "warn" : "win",
          severity: up ? "watch" : "fyi",
          action: up ? "Check targeting and frequency on the recent campaigns — cost per order is climbing." : undefined,
          math: {
            steps: [
              { label: `Spend, last 5 days (${range(recent5)})`, value: compact(r.spend) },
              { label: "Orders, last 5 days", value: String(Math.round(r.purchases)) },
              { label: "CPA recent = spend ÷ orders", value: inr(recent) },
              { label: `Spend, prior 5 days (${range(prior5)})`, value: compact(p.spend) },
              { label: "Orders, prior 5 days", value: String(Math.round(p.purchases)) },
              { label: "CPA prior = spend ÷ orders", value: inr(prior) },
            ],
            formula: `change = ${inr(recent)} ÷ ${inr(prior)} − 1 = ${deltaPct > 0 ? "+" : ""}${Math.round(deltaPct)}%`,
            note: "Blended Meta + Google, platform-attributed orders.",
          },
          link: { href: `/${slug}/campaigns?from=${recent5[0].day}&to=${recent5[4].day}`, label: "See those 5 days →" },
        });
      }
    }
  }

  // ---- 3. platform gap within the month ----
  const meta = platformTotals.find((p) => p.platform === "meta");
  const google = platformTotals.find((p) => p.platform === "google");
  if (meta && google && meta.spend > 0 && google.spend > 0) {
    const gap = google.roas / Math.max(meta.roas, 0.01) - 1;
    if (Math.abs(gap) >= 0.15) {
      const googleBetter = gap > 0;
      const pctGap = Math.round(Math.abs(gap) * 100);
      out.push({
        icon: "zap",
        category: "Platform mix",
        kind: "signal",
        metric: `+${pctGap}%`,
        text: `${googleBetter ? "Google" : "Meta"} outperformed ${googleBetter ? "Meta" : "Google"} on ROAS (${(googleBetter ? google : meta).roas.toFixed(2)}× vs ${(googleBetter ? meta : google).roas.toFixed(2)}×).`,
        tone: "info",
        severity: "watch",
        action: googleBetter
          ? "Consider shifting incremental budget toward Google — after checking how much of its revenue is brand search."
          : "Consider shifting incremental budget toward Meta while the gap holds.",
        math: {
          steps: [
            { label: `Meta spend (${monthLabel})`, value: compact(meta.spend) },
            { label: `Meta revenue (${monthLabel})`, value: compact(meta.revenue) },
            { label: "Meta ROAS", value: `${meta.roas.toFixed(2)}×` },
            { label: `Google spend (${monthLabel})`, value: compact(google.spend) },
            { label: `Google revenue (${monthLabel})`, value: compact(google.revenue) },
            { label: "Google ROAS", value: `${google.roas.toFixed(2)}×` },
          ],
          formula: googleBetter
            ? `gap = ${google.roas.toFixed(2)} ÷ ${meta.roas.toFixed(2)} − 1 = +${pctGap}%`
            : `gap = ${meta.roas.toFixed(2)} ÷ ${google.roas.toFixed(2)} − 1 = +${pctGap}%`,
          note: "Each platform self-attributes — treat cross-platform comparison directionally. Google's ROAS also carries brand-search cannibalization: people already searching for Organik Truck would mostly have converted anyway, which flatters its return vs Meta's colder audiences.",
        },
        link: { href: `/${slug}#channels`, label: "Platform comparison →" },
      });
    }
  }

  // ---- customer economics: the agency report card ----
  const cm = (input.customerMonths ?? []).filter((m) => m.hasData && m.ltvCac != null);
  if (cm.length) {
    const latest = cm[cm.length - 1];
    const prevM = cm.length > 1 ? cm[cm.length - 2] : null;
    const ltvCacSeverity: InsightSeverity = latest.ltvCac! >= 3 ? "fyi" : latest.ltvCac! >= 2 ? "watch" : "critical";
    out.push({
      icon: "users",
      category: "Customer economics",
      kind: "signal",
      metric: `${latest.ltvCac!.toFixed(1)}×`,
      text: `LTV:CAC — every ₹1 of acquisition buys ${inr(latest.ltvCac!)} of expected lifetime revenue${prevM ? ` (${prevM.ltvCac!.toFixed(1)}× the month before)` : ""}.`,
      tone: latest.ltvCac! >= 3 ? "win" : latest.ltvCac! >= 2 ? "info" : "risk",
      severity: ltvCacSeverity,
      action: ltvCacSeverity === "critical"
        ? "CAC is outpacing lifetime value — slow acquisition spend or fix retention before scaling further."
        : ltvCacSeverity === "watch"
          ? "Workable but not yet strongly profitable — watch next month before increasing spend."
          : undefined,
      tracesTo: "Customer counts (customer-data sheet) + Shopify totals + paid spend",
      costOfInaction: ltvCacSeverity === "fyi" ? undefined
        : "Acquisition spend that costs more than the customer returns",
      math: {
        steps: [
          { label: "New customers (client-reported)", value: String(latest.newCustomers) },
          { label: "Returning customers (client-reported)", value: String(latest.returningCustomers) },
          { label: "Repeat rate r = returning ÷ all customers", value: `${Math.round(latest.repeatRate! * 100)}%` },
          { label: "Blended AOV = store revenue ÷ orders", value: inr(latest.aov!) },
          { label: "Derived LTV = AOV ÷ (1 − r)", value: inr(latest.ltv!) },
          { label: "Paid spend that month", value: compact(latest.paidSpend) },
          { label: "CAC(new) = spend ÷ new customers", value: inr(latest.cacNew!) },
        ],
        formula: `LTV:CAC = ${inr(latest.ltv!)} ÷ ${inr(latest.cacNew!)} = ${latest.ltvCac!.toFixed(1)}×`,
        note: "Geometric repeat model — assumption-light and standard. 3×+ is healthy for D2C.",
      },
      link: { href: `/${slug}/monthly`, label: "Monthly report →" },
    });
    if (prevM && Math.abs(latest.repeatRate! - prevM.repeatRate!) >= 0.02) {
      const up2 = latest.repeatRate! > prevM.repeatRate!;
      out.push({
        icon: "users",
        category: "Loyalty trend",
        kind: "signal",
        metric: `${up2 ? "+" : "−"}${Math.abs((latest.repeatRate! - prevM.repeatRate!) * 100).toFixed(0)}pt`,
        text: `Repeat rate ${up2 ? "climbed" : "fell"} to ${Math.round(latest.repeatRate! * 100)}% — ${up2 ? "customers are coming back; every point here compounds LTV" : "returning customers thinned; retention needs attention"}.`,
        tone: up2 ? "win" : "warn",
        severity: up2 ? "fyi" : "watch",
        action: up2 ? undefined : "Retention is thinning — consider a win-back offer or loyalty nudge for lapsing customers.",
      tracesTo: "Client-reported monthly new vs returning customer counts",
      costOfInaction: "Every point of repeat rate compounds into lifetime value — losing one compounds the other way",
        math: {
          steps: [
            { label: `${prevM.month.slice(0, 7)} repeat rate`, value: `${Math.round(prevM.repeatRate! * 100)}%` },
            { label: `${latest.month.slice(0, 7)} repeat rate`, value: `${Math.round(latest.repeatRate! * 100)}%` },
          ],
          formula: `Δ = ${Math.round(latest.repeatRate! * 100)}% − ${Math.round(prevM.repeatRate! * 100)}% = ${up2 ? "+" : "−"}${Math.abs((latest.repeatRate! - prevM.repeatRate!) * 100).toFixed(0)}pt`,
        },
        link: { href: `/${slug}/monthly`, label: "Monthly report →" },
      });
    }
  }

  // ---- seasonal intelligence ----
  if (input.seasonal) {
    const { closing, missed, offSeason } = input.seasonal;
    if (closing.length) {
      const c = closing[0];
      const roas = c.spend > 0 ? c.revenue / c.spend : 0;
      out.push({
        icon: "sun",
        category: "Season closing",
        kind: "move",
        metric: c.produce.label,
        text: `window shuts after ${monthLabel} — ${compact(c.revenue)} so far${roas > 0 ? ` at ${roas.toFixed(2)}×` : ""}. Last call to push${closing.length > 1 ? ` (+${closing.length - 1} more closing)` : ""}.`,
        tone: "warn",
        severity: "watch",
        action: `Push remaining budget on ${c.produce.label} now — the window shuts after ${monthLabel}.`,
      tracesTo: "Campaign and ad names matched to the India produce calendar (src/lib/seasons.ts)",
      costOfInaction: "A season that closes unsold does not reopen for a year",
        math: {
          steps: [
            { label: `${c.produce.label} season (India)`, value: seasonLabel(c.produce) },
            { label: `Revenue this month`, value: compact(c.revenue) },
            { label: `Spend this month`, value: compact(c.spend) },
            ...(closing.length > 1 ? closing.slice(1, 4).map((x) => ({ label: `Also closing: ${x.produce.label}`, value: seasonLabel(x.produce) })) : []),
          ],
          formula: `closing = in season this month AND out of season next month`,
          note: "Season windows are India-market estimates, editable in src/lib/seasons.ts.",
        },
        link: { href: `/${slug}/creatives?q=${encodeURIComponent(c.produce.label.split(" ")[0].toLowerCase())}`, label: `See ${c.produce.label} creatives →` },
      });
    }
    if (missed.length) {
      out.push({
        icon: "leaf",
        category: "Open windows",
        kind: "move",
        metric: String(missed.length),
        text: `in-season item${missed.length > 1 ? "s" : ""} with zero spend — nature is shipping, we aren't selling. Full list in Seasons, below.`,
        tone: "ai",
        severity: "watch",
        action: "Launch campaigns on these in-season items before the window passes.",
      tracesTo: "Produce calendar vs spend by item this month",
      costOfInaction: "In-season demand we are not competing for at all",
        math: {
          steps: missed.slice(0, 5).map((m) => ({ label: m.produce.label, value: `${seasonLabel(m.produce)} · ₹0 spend this month` })),
          formula: `missed = in season this month AND spend = 0 AND sold historically`,
          note: "Only items Organik Truck has sold before are flagged.",
        },
        link: { href: `/${slug}#seasons`, label: "See the full list →" },
      });
    }
    const offSpend = offSeason.reduce((s2, x) => s2 + x.spend, 0);
    if (offSeason.length && offSpend >= 1000) {
      out.push({
        icon: "trend-down",
        category: "Fighting the calendar",
        kind: "move",
        metric: compact(offSpend),
        text: `spent on out-of-season produce — ${offSeason.slice(0, 3).map((m) => m.produce.label).join(", ")}. Expect thinner supply and softer demand.`,
        tone: "warn",
        severity: "watch",
        action: "Reconsider spend on out-of-season produce — expect thinner returns until season resumes.",
      tracesTo: "Produce calendar vs spend by item this month",
      costOfInaction: "Spend fighting supply and demand at the same time",
        math: {
          steps: offSeason.slice(0, 5).map((m) => ({ label: m.produce.label, value: `${compact(m.spend)} spend · season ${seasonLabel(m.produce)}` })),
          formula: `off-season spend = Σ spend on items whose season excludes ${monthLabel}`,
        },
        link: { href: `/${slug}/campaigns?range=mtd`, label: "Review campaigns →" },
      });
    }
  }

  if (input.isCurrentMonth) {
    out.push(...currentMonthInsights(input));
  } else if (input.goal && input.goal.target > 0) {
    // ---- past month: goal attainment ----
    const att = input.monthRevenue / input.goal.target;
    const attSeverity: InsightSeverity = att >= 1 ? "fyi" : att >= 0.85 ? "watch" : "critical";
    out.push({
      icon: att >= 1 ? "check" : "target",
      category: "Goal attainment",
      kind: "signal",
      metric: `${Math.round(att * 100)}%`,
      text: att >= 1
        ? `of the revenue goal was hit — ${compact(input.monthRevenue)} against ${compact(input.goal.target)}.`
        : `of the revenue goal was reached — ${compact(input.monthRevenue)} against ${compact(input.goal.target)}.`,
      tone: att >= 1 ? "win" : att >= 0.85 ? "warn" : "risk",
      severity: attSeverity,
      action: attSeverity === "critical"
        ? "Revenue is meaningfully behind goal — review pacing, spend levels and conversion before next month."
        : attSeverity === "watch"
          ? "Close, but short — worth digging into what held the last stretch back."
          : undefined,
      tracesTo: "Monthly targets (customer-data sheet) vs paid revenue from the platform exports",
      costOfInaction: attSeverity === "fyi" ? undefined
        : "The gap compounds — next month starts further behind",
      math: {
        steps: [
          { label: `Goal${input.goal.isDefault ? " (default: prior month +25%)" : ""}`, value: compact(input.goal.target) },
          { label: `Paid revenue (${monthLabel})`, value: compact(input.monthRevenue) },
        ],
        formula: `attainment = ${compact(input.monthRevenue)} ÷ ${compact(input.goal.target)} = ${Math.round(att * 100)}%`,
        note: input.goal.isDefault ? "No explicit goal was set for this month — default target shown." : undefined,
      },
      link: { href: `/${slug}?month=${monthParam}`, label: "This month's overview →" },
    });
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 10);
}

/** Operational "act now" insights — only meaningful for the current month. */
function currentMonthInsights(input: MonthInsightInput): Insight[] {
  const out: Insight[] = [];
  const { slug, creatives = [], pacing = [] } = input;

  const active = creatives.filter((c) => c.active && c.window_spend > 0);
  const winSpend = active.reduce((s, c) => s + c.window_spend, 0);
  const winRev = active.reduce((s, c) => s + c.window_revenue, 0);
  const baseRoas = winSpend > 0 ? winRev / winSpend : 0;

  // fatigue exposure
  const fatiguing = creatives.filter((c) => c.status === "fatiguing");
  const fatigueSpend = fatiguing.reduce((s, c) => s + c.window_spend, 0);
  if (fatiguing.length && winSpend > 0 && fatigueSpend / winSpend >= 0.08) {
    out.push({
      icon: "trend-down",
      category: "Creative fatigue",
      kind: "move",
      metric: `${Math.round((100 * fatigueSpend) / winSpend)}%`,
      text: `of current spend sits on ${fatiguing.length} fatiguing creative${fatiguing.length > 1 ? "s" : ""} — refresh or rotate.`,
      tone: "risk",
      severity: "critical",
      action: "Refresh or pause the fatiguing creatives before more budget is wasted on declining ROAS.",
      tracesTo: "Meta ad export → 14-day vs prior 28-day ROAS by ad",
      costOfInaction: "Budget flowing into creatives whose returns are already falling",
      math: {
        steps: [
          { label: "Fatiguing = 14d ROAS fell ≥40% vs prior 28d", value: `${fatiguing.length} creatives` },
          ...fatiguing.slice(0, 4).map((c) => ({
            label: truncate(c.ad_name, 36),
            value: `${compact(c.window_spend)} · ROAS fell ${dropPct(c)}%`,
          })),
          { label: "Spend on fatiguing creatives (14d)", value: compact(fatigueSpend) },
          { label: "Total active spend (14d)", value: compact(winSpend) },
        ],
        formula: `exposure = ${compact(fatigueSpend)} ÷ ${compact(winSpend)} = ${Math.round((100 * fatigueSpend) / winSpend)}%`,
      },
      link: { href: `/${slug}/creatives?status=fatiguing`, label: "See fatiguing creatives →" },
    });
  }

  // hidden gems
  const gems = creatives.filter((c) => c.status === "hidden_gem");
  if (gems.length) {
    const top = [...gems].sort((a, b) =>
      b.window_revenue / Math.max(b.window_spend, 1) - a.window_revenue / Math.max(a.window_spend, 1)).slice(0, 4);
    out.push({
      icon: "gem",
      category: "Scale opportunity",
      kind: "move",
      metric: String(gems.length),
      text: `hidden gem${gems.length > 1 ? "s" : ""} running high ROAS on tiny budgets — feed the winners.`,
      tone: "ai",
      severity: "watch",
      action: "Increase budget carefully on these — the algorithm found a profitable pocket at low spend.",
      tracesTo: "Meta ad export → 14-day ROAS and spend share by ad",
      costOfInaction: "Proven pockets left unscaled while budget sits on average performers",
      math: {
        steps: [
          { label: "Hidden gem = 14d ROAS ≥ 1.5× account, on <5% of spend", value: `${gems.length} qualify` },
          { label: "Account ROAS (14d)", value: `${baseRoas.toFixed(2)}×` },
          ...top.map((c) => ({
            label: truncate(c.ad_name, 36),
            value: `${(c.window_revenue / Math.max(c.window_spend, 1)).toFixed(2)}× on ${compact(c.window_spend)}`,
          })),
        ],
        formula: `qualifies if ROAS ≥ 1.5 × ${baseRoas.toFixed(2)} = ${(1.5 * baseRoas).toFixed(2)}× AND spend share < 5%`,
        note: "High ROAS at low spend often means the algorithm found a pocket — scale carefully. Below ~₹2k of spend a ROAS figure is closer to noise than signal (ops rule of thumb: real reads start at ₹4–5k/day bid-cap budgets).",
      },
      link: { href: `/${slug}/creatives?status=hidden_gem`, label: "See hidden gems →" },
    });
  }

  // pacing
  const rev = pacing.find((p) => p.metric === "revenue");
  if (rev && rev.goal > 0 && (rev.paceRatio < 0.9 || rev.paceRatio >= 1.05)) {
    const behind = rev.paceRatio < 0.9;
    out.push({
      icon: behind ? "target" : "check",
      category: "Revenue pacing",
      kind: "signal",
      metric: `${Math.round((100 * rev.projected) / rev.goal)}%`,
      text: behind
        ? `of goal is where this month lands at the current run rate — pacing ${Math.round((1 - rev.paceRatio) * 100)}% behind.`
        : `of goal projected — pacing ${Math.round((rev.paceRatio - 1) * 100)}% ahead.`,
      tone: behind ? "risk" : "win",
      severity: behind ? "critical" : "fyi",
      action: behind ? "Increase spend or fix conversion issues now to catch up before month-end." : undefined,
      tracesTo: "Month-to-date platform exports vs the month goal",
      costOfInaction: "Month-end arrives whether or not the gap was closed",
      math: {
        steps: [
          { label: `Monthly goal${rev.goalIsDefault ? " (default: last month +25%)" : ""}`, value: compact(rev.goal) },
          { label: "Day of month", value: `${rev.daysElapsed} of ${rev.daysInMonth}` },
          { label: `Expected by today = goal × ${rev.daysElapsed}/${rev.daysInMonth}`, value: compact(rev.expectedByToday) },
          { label: "Actual revenue MTD", value: compact(rev.actualMtd) },
          { label: `Projection = MTD + trailing-7d daily average × ${rev.daysInMonth - rev.daysElapsed} remaining days`, value: compact(rev.projected) },
        ],
        formula: `pace = ${compact(rev.actualMtd)} ÷ ${compact(rev.expectedByToday)} = ${Math.round(rev.paceRatio * 100)}%`,
        note: rev.goalIsDefault ? "No explicit goal set — using last month +25%. Set a real goal on the Internal page." : undefined,
      },
      link: { href: `/${slug}/internal`, label: rev.goalIsDefault ? "Set real goals →" : "Adjust goals →" },
    });
  }

  return out;
}

function truncate(s: string, n = 42): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function dropPct(c: CreativeRollup): number {
  const winRoas = c.window_spend > 0 ? c.window_revenue / c.window_spend : 0;
  const priorRoas = c.prior_spend > 0 ? c.prior_revenue / c.prior_spend : 0;
  return priorRoas > 0 ? Math.round((1 - winRoas / priorRoas) * 100) : 0;
}

export const TONE_COLOR: Record<Insight["tone"], string> = {
  win: "var(--status-good)",
  warn: "var(--status-warning)",
  risk: "var(--status-critical)",
  info: "var(--series-1)",
  ai: "var(--ai)",
};
