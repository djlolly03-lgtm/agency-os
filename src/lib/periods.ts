/**
 * Period model: months are the atom; quarters / halves / years / last-6 /
 * all-time are ranges over them. Everything derives from the list of months
 * that actually have data (getMonths, desc).
 */
import type { CustomerMonth } from "./queries";

export type PeriodKind = "quarter" | "half" | "year" | "l6m" | "all";

export interface Period {
  key: string;            // URL value: "2026-q2" | "2026-h1" | "2026" | "l6m" | "all"
  kind: PeriodKind;
  label: string;          // "Q2 '26"
  longLabel: string;      // "Apr – Jun 2026"
  from: string;           // YYYY-MM-DD (first day)
  to: string;             // YYYY-MM-DD (last day of last month)
  months: string[];       // YYYY-MM-01 covered months WITH data, asc
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthEndDay(monthStart: string): string {
  return new Date(Date.UTC(
    Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

export function shortMonth(monthStart: string): string {
  return `${MON[Number(monthStart.slice(5, 7)) - 1]} ’${monthStart.slice(2, 4)}`;
}

function rangeLabel(months: string[]): string {
  const a = months[0], b = months[months.length - 1];
  const ya = a.slice(0, 4), yb = b.slice(0, 4);
  const ma = MON[Number(a.slice(5, 7)) - 1], mb = MON[Number(b.slice(5, 7)) - 1];
  if (a === b) return `${ma} ${ya}`;
  return ya === yb ? `${ma} – ${mb} ${ya}` : `${ma} ${ya} – ${mb} ${yb}`;
}

function mk(kind: PeriodKind, key: string, label: string, months: string[]): Period {
  return {
    key, kind, label, longLabel: rangeLabel(months),
    from: months[0], to: monthEndDay(months[months.length - 1]), months,
  };
}

/** All selectable periods, oldest → newest within each kind. */
export function buildPeriods(monthsDesc: string[]): Period[] {
  const months = [...monthsDesc].sort();
  if (!months.length) return [];
  const out: Period[] = [];

  // calendar quarters with any data
  const byQuarter = new Map<string, string[]>();
  for (const m of months) {
    const y = m.slice(0, 4), q = Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1;
    const key = `${y}-q${q}`;
    byQuarter.set(key, [...(byQuarter.get(key) ?? []), m]);
  }
  for (const [key, ms] of byQuarter) {
    out.push(mk("quarter", key, `Q${key.slice(6)} ’${key.slice(2, 4)}`, ms));
  }

  // calendar halves with ≥2 months of data
  const byHalf = new Map<string, string[]>();
  for (const m of months) {
    const y = m.slice(0, 4), h = Number(m.slice(5, 7)) <= 6 ? 1 : 2;
    const key = `${y}-h${h}`;
    byHalf.set(key, [...(byHalf.get(key) ?? []), m]);
  }
  for (const [key, ms] of byHalf) {
    if (ms.length >= 2) out.push(mk("half", key, `H${key.slice(6)} ’${key.slice(2, 4)}`, ms));
  }

  // last 6 months (rolling)
  if (months.length > 6) out.push(mk("l6m", "l6m", "Last 6 mo", months.slice(-6)));

  // calendar years
  const byYear = new Map<string, string[]>();
  for (const m of months) byYear.set(m.slice(0, 4), [...(byYear.get(m.slice(0, 4)) ?? []), m]);
  for (const [y, ms] of byYear) out.push(mk("year", y, y, ms));

  // everything
  out.push(mk("all", "all", "All time", months));
  return out;
}

/**
 * The previous same-length window, for deltas — only when every month of
 * that window has data (otherwise the comparison would silently understate).
 */
export function previousWindow(p: Period, monthsWithData: string[]): string[] | null {
  if (p.kind === "all") return null;
  const have = new Set(monthsWithData);
  const len = p.months.length;
  const first = p.months[0];
  const prev: string[] = [];
  for (let i = len; i >= 1; i--) {
    const d = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 - i, 1));
    prev.push(d.toISOString().slice(0, 10));
  }
  return prev.every((m) => have.has(m)) ? prev : null;
}

/**
 * One row per month with everything the hero, the growth story, and the
 * period rollups need. `revenue` prefers the Shopify store total (incl.
 * organic) and falls back to paid-attributed for months without one.
 */
export interface MonthSeries {
  month: string;               // YYYY-MM-01
  paidRevenue: number;         // Meta + Google (incl. manual Google months)
  spend: number;
  paidOrders: number;
  storeRevenue: number | null; // Shopify total (Dashboard tab)
  storeOrders: number | null;
  revenue: number;             // storeRevenue ?? paidRevenue
  source: "store" | "paid";
  orders: number;              // storeOrders ?? paidOrders
  blendedRoas: number | null;  // revenue / spend
  isPartial: boolean;          // running month
}

export function buildMonthlySeries(opts: {
  monthsAsc: string[];
  /** per-month paid sums from the daily timeseries (google dailies only where they exist) */
  paidByMonth: Map<string, { revenue: number; spend: number; purchases: number }>;
  /** manual Google monthlies for months without daily Google rows */
  manualGoogleByMonth: Map<string, { revenue: number; spend: number; purchases: number }>;
  custMonths: CustomerMonth[];
  asOf: string;                // latest data day
}): MonthSeries[] {
  const custBy = new Map(opts.custMonths.map((c) => [c.month, c]));
  return opts.monthsAsc.map((month) => {
    const paid = opts.paidByMonth.get(month) ?? { revenue: 0, spend: 0, purchases: 0 };
    const mg = opts.manualGoogleByMonth.get(month);
    const paidRevenue = paid.revenue + (mg?.revenue ?? 0);
    const spend = paid.spend + (mg?.spend ?? 0);
    const paidOrders = paid.purchases + (mg?.purchases ?? 0);
    const cust = custBy.get(month);
    const storeRevenue = cust?.totalRevenue ?? null;
    const storeOrders = cust?.totalOrders ?? null;
    const revenue = storeRevenue ?? paidRevenue;
    const orders = storeOrders ?? paidOrders;
    return {
      month, paidRevenue, spend, paidOrders, storeRevenue, storeOrders,
      revenue, source: storeRevenue != null ? "store" as const : "paid" as const,
      orders, blendedRoas: spend > 0 ? revenue / spend : null,
      isPartial: month === opts.asOf.slice(0, 8) + "01",
    };
  });
}
