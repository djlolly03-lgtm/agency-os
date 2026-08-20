/**
 * Order-level Shopify ingestion + derived customer stats. Source is a
 * client-maintained supplementary sheet (CUSTOMER_DATA_SHEET_ID), tab
 * "5.Shopify Extract" — Order ID, Order name, Day, Customer name,
 * Customer email, Total sales. Full replace per client on each run
 * (small table, refund lines can repeat an order_id, so there's no
 * natural per-row key to upsert against).
 */
import { getDb } from "./db";
import { sheetsClient } from "./google";

const SHOPIFY_TAB = "5.Shopify Extract";

function toIsoDay(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

export async function ingestShopifyOrders(clientSlug: string): Promise<{ rows: number; customers: number }> {
  const sheetId = process.env.CUSTOMER_DATA_SHEET_ID;
  if (!sheetId) throw new Error("CUSTOMER_DATA_SHEET_ID not set");

  const db = await getDb();
  const [client] = await db.query<{ id: string }>(
    `select id from clients where slug = $1`, [clientSlug]);
  if (!client) throw new Error(`unknown client ${clientSlug}`);

  const sheets = sheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${SHOPIFY_TAB}'!A1:F20000`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values = resp.data.values ?? [];
  const rows = values.slice(1)
    .filter((r) => r[0] && r[2])
    .map((r) => {
      const email = String(r[4] ?? "").trim().toLowerCase();
      const orderId = N(r[0]);
      return {
        orderId,
        orderName: String(r[1] ?? ""),
        day: toIsoDay(N(r[2])),
        customerKey: email || `anon:${orderId}`,
        customerName: String(r[3] ?? ""),
        total: N(r[5]),
      };
    });

  await db.query(`delete from shopify_orders where client_id = $1`, [client.id]);
  const CHUNK = 300;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, r) =>
      `($${r * 7 + 1},$${r * 7 + 2},$${r * 7 + 3},$${r * 7 + 4},$${r * 7 + 5},$${r * 7 + 6},$${r * 7 + 7})`).join(",");
    const params = chunk.flatMap((r) =>
      [client.id, r.orderId, r.orderName, r.day, r.customerKey, r.customerName, r.total]);
    await db.query(
      `insert into shopify_orders (client_id, order_id, order_name, day, customer_key, customer_name, total)
       values ${placeholders}`, params);
  }

  const customers = new Set(rows.map((r) => r.customerKey)).size;
  return { rows: rows.length, customers };
}

export interface ShopifyMonthStats {
  month: string;             // YYYY-MM-01
  newAov: number | null;
  repeatAov: number | null;
  newOrders: number;
  repeatOrders: number;
  newRevenue: number;        // order revenue from first-purchase orders that month
  repeatRevenue: number;     // order revenue from customers who'd bought before
}

export interface ShopifyCustomerStats {
  byMonth: ShopifyMonthStats[];
  ltvMeasured: number | null;   // avg lifetime revenue-to-date per customer, all history
  customers: number;
  orders: number;
}

/**
 * Real new-vs-repeat split, derived from order-level history: a customer
 * counts as "new" in the month of their first-ever order, "repeat" every
 * month after. ltvMeasured is right-censored (recent customers haven't had
 * time to repeat) — presented as revenue-to-date, not a lifetime forecast.
 */
export async function getShopifyCustomerStats(clientId: string): Promise<ShopifyCustomerStats | null> {
  const db = await getDb();
  const rows = await db.query<{ customer_key: string; day: string; total: number }>(
    `select customer_key, day::text as day, total from shopify_orders where client_id = $1`, [clientId]);
  if (!rows.length) return null;

  const firstOrder = new Map<string, string>();
  for (const r of rows) {
    const cur = firstOrder.get(r.customer_key);
    if (!cur || r.day < cur) firstOrder.set(r.customer_key, r.day);
  }

  const byMonth = new Map<string, { newRev: number; newOrders: number; repeatRev: number; repeatOrders: number }>();
  for (const r of rows) {
    const month = r.day.slice(0, 8) + "01";
    const slot = byMonth.get(month) ?? { newRev: 0, newOrders: 0, repeatRev: 0, repeatOrders: 0 };
    const isNew = firstOrder.get(r.customer_key)!.slice(0, 8) === month.slice(0, 8);
    if (isNew) { slot.newRev += N(r.total); slot.newOrders += 1; }
    else { slot.repeatRev += N(r.total); slot.repeatOrders += 1; }
    byMonth.set(month, slot);
  }

  const custTotal = new Map<string, number>();
  for (const r of rows) custTotal.set(r.customer_key, (custTotal.get(r.customer_key) ?? 0) + N(r.total));
  const ltvMeasured = custTotal.size
    ? [...custTotal.values()].reduce((a, b) => a + b, 0) / custTotal.size : null;

  return {
    byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, s]) => ({
      month,
      newAov: s.newOrders > 0 ? s.newRev / s.newOrders : null,
      repeatAov: s.repeatOrders > 0 ? s.repeatRev / s.repeatOrders : null,
      newOrders: s.newOrders, repeatOrders: s.repeatOrders,
      newRevenue: s.newRev, repeatRevenue: s.repeatRev,
    })),
    ltvMeasured, customers: custTotal.size, orders: rows.length,
  };
}

function monthOffset(from: string, months: number): string {
  const [y, m] = from.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 8) + "01";
}
function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

export interface CohortRow {
  cohortMonth: string;
  size: number;                          // customers first-acquired this month
  retained: (number | null)[];           // index i = customers still buying at month i (i=0 always = size)
  revenue: (number | null)[];            // revenue from this cohort at month i
}

/**
 * Classic cohort retention grid: rows = signup month, columns = months since
 * signup. Cell = how many of that cohort bought again that many months later.
 */
export async function getCohortRetention(clientId: string): Promise<{ cohorts: CohortRow[]; maxOffset: number } | null> {
  const db = await getDb();
  const rows = await db.query<{ customer_key: string; day: string; total: number }>(
    `select customer_key, day::text as day, total from shopify_orders where client_id = $1`, [clientId]);
  if (!rows.length) return null;

  const firstOrder = new Map<string, string>();
  for (const r of rows) {
    const cur = firstOrder.get(r.customer_key);
    if (!cur || r.day < cur) firstOrder.set(r.customer_key, r.day);
  }
  const cohortOf = new Map<string, string>();
  for (const [k, d] of firstOrder) cohortOf.set(k, d.slice(0, 8) + "01");

  // per customer, per calendar month: order count + revenue
  const byCustomerMonth = new Map<string, Map<string, number>>();
  let latestMonth = "0000-00-00";
  for (const r of rows) {
    const month = r.day.slice(0, 8) + "01";
    if (month > latestMonth) latestMonth = month;
    if (!byCustomerMonth.has(r.customer_key)) byCustomerMonth.set(r.customer_key, new Map());
    const m = byCustomerMonth.get(r.customer_key)!;
    m.set(month, (m.get(month) ?? 0) + N(r.total));
  }

  const cohortMonths = [...new Set(cohortOf.values())].sort();
  const custByCohort = new Map<string, string[]>();
  for (const [k, c] of cohortOf) custByCohort.set(c, [...(custByCohort.get(c) ?? []), k]);

  let maxOffset = 0;
  const cohorts: CohortRow[] = cohortMonths.map((cohortMonth) => {
    const custs = custByCohort.get(cohortMonth)!;
    const span = monthDiff(cohortMonth, latestMonth);
    maxOffset = Math.max(maxOffset, span);
    const retained: (number | null)[] = [];
    const revenue: (number | null)[] = [];
    for (let i = 0; i <= span; i++) {
      const target = monthOffset(cohortMonth, i);
      let count = 0, rev = 0;
      for (const c of custs) {
        const v = byCustomerMonth.get(c)?.get(target);
        if (v != null) { count++; rev += v; }
      }
      retained.push(count);
      revenue.push(rev);
    }
    return { cohortMonth, size: custs.length, retained, revenue };
  });

  return { cohorts, maxOffset };
}

// ---------- RFM segments & win-back ----------

/**
 * Rule-based RFM — deliberately NOT quintile scoring, so every bucket is
 * explainable in one sentence. Frequency: repeat (2+ orders) vs one-time.
 * Recency: active ≤45d, cooling 46–90d, lapsed >90d — produce cadence is
 * roughly monthly, so 45d ≈ one missed cycle, 90d ≈ three.
 * "Today" is data-relative (latest order day), same convention as queries.ts.
 */
export const RFM_RULES = { activeDays: 45, lapsedDays: 90 };

export type RfmSegmentKey =
  | "champions" | "slipping" | "lost_regulars"
  | "fresh" | "cooling_one" | "one_and_done";

export interface RfmSegment {
  key: RfmSegmentKey;
  label: string;
  desc: string;                 // the action, not just the definition
  customers: number;
  lifetimeRevenue: number;
}

export interface WinbackCustomer {
  name: string;
  email: string;
  orders: number;
  lifetimeSpend: number;
  lastOrder: string;            // YYYY-MM-DD
}

export interface RfmResult {
  asOf: string;                 // latest order day (reference for recency)
  totalCustomers: number;       // identifiable (email on file) only
  anonOrders: number;           // orders excluded — no email, can't be contacted
  segments: RfmSegment[];       // fixed order, all six always present
  winback: WinbackCustomer[];   // lost regulars, highest lifetime spend first
  winbackTotal: number;         // all lost regulars (winback is capped for display)
  winbackRevenue: number;       // lifetime revenue sitting with lost regulars
  // the concentration story: heavy repeaters as a lookalike seed
  fivePlusCustomers: number;    // customers with 5+ orders
  fivePlusRevenueShare: number; // their share of all identifiable lifetime revenue (0–1)
}

const SEGMENT_META: Record<RfmSegmentKey, { label: string; desc: string }> = {
  champions: { label: "Champions", desc: "repeat buyers, ordered recently — protect them" },
  slipping: { label: "Slipping away", desc: "repeat buyers going quiet — nudge them this week" },
  lost_regulars: { label: "Lost regulars", desc: "repeat buyers gone 90+ days — send a win-back offer" },
  fresh: { label: "New faces", desc: "one recent order — push the second purchase now" },
  cooling_one: { label: "One order, cooling", desc: "first order didn't stick yet — remind them" },
  one_and_done: { label: "One-and-done", desc: "tried once, long gone — lowest priority" },
};

export async function getRfmSegments(clientId: string): Promise<RfmResult | null> {
  const db = await getDb();
  const rows = await db.query<{ customer_key: string; customer_name: string; day: string; total: number }>(
    `select customer_key, customer_name, day::text as day, total
     from shopify_orders where client_id = $1`, [clientId]);
  if (!rows.length) return null;

  let asOf = "0000-00-00";
  let anonOrders = 0;
  const cust = new Map<string, { name: string; orders: number; total: number; last: string }>();
  for (const r of rows) {
    if (r.day > asOf) asOf = r.day;
    if (r.customer_key.startsWith("anon:")) { anonOrders++; continue; }
    const c = cust.get(r.customer_key) ?? { name: r.customer_name, orders: 0, total: 0, last: "0000-00-00" };
    c.orders += 1;
    c.total += N(r.total);
    if (r.day > c.last) { c.last = r.day; if (r.customer_name) c.name = r.customer_name; }
    cust.set(r.customer_key, c);
  }

  const refMs = Date.parse(asOf + "T00:00:00Z");
  const seg = new Map<RfmSegmentKey, { customers: number; lifetimeRevenue: number }>();
  const keys: RfmSegmentKey[] = ["champions", "slipping", "lost_regulars", "fresh", "cooling_one", "one_and_done"];
  for (const k of keys) seg.set(k, { customers: 0, lifetimeRevenue: 0 });

  const lost: WinbackCustomer[] = [];
  let fivePlusCustomers = 0, fivePlusRevenue = 0, allRevenue = 0;
  for (const [email, c] of cust) {
    allRevenue += c.total;
    if (c.orders >= 5) { fivePlusCustomers++; fivePlusRevenue += c.total; }
    const daysSince = Math.floor((refMs - Date.parse(c.last + "T00:00:00Z")) / 86400000);
    const repeat = c.orders >= 2;
    const band = daysSince <= RFM_RULES.activeDays ? 0 : daysSince <= RFM_RULES.lapsedDays ? 1 : 2;
    const key: RfmSegmentKey = repeat
      ? band === 0 ? "champions" : band === 1 ? "slipping" : "lost_regulars"
      : band === 0 ? "fresh" : band === 1 ? "cooling_one" : "one_and_done";
    const s = seg.get(key)!;
    s.customers += 1;
    s.lifetimeRevenue += c.total;
    if (key === "lost_regulars") {
      lost.push({ name: c.name, email, orders: c.orders, lifetimeSpend: c.total, lastOrder: c.last });
    }
  }
  lost.sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);

  return {
    asOf,
    totalCustomers: cust.size,
    anonOrders,
    segments: keys.map((k) => ({ key: k, ...SEGMENT_META[k], ...seg.get(k)! })),
    winback: lost.slice(0, 30),
    winbackTotal: lost.length,
    winbackRevenue: lost.reduce((s, c) => s + c.lifetimeSpend, 0),
    fivePlusCustomers,
    fivePlusRevenueShare: allRevenue > 0 ? fivePlusRevenue / allRevenue : 0,
  };
}
