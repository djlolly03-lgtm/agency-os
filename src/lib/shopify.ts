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

// ---------- cohort retention by day-horizon ----------

export interface CohortHorizon {
  month: string;                    // acquisition month, YYYY-MM-01
  size: number;                     // customers first acquired that month
  /** true for the FIRST cohort only: the order export starts there, so it
   *  sweeps in customers who were already loyal before we could see them.
   *  Its retention reads high for a reason that has nothing to do with
   *  acquisition quality — never include it in a trend. */
  censored: boolean;
  /** share who ordered again within N days of their FIRST order (0–1).
   *  null = the cohort hasn't aged into that horizon yet — the UI must
   *  render that as "—", never as 0. */
  r30: number | null;
  r60: number | null;
  r90: number | null;
  r180: number | null;
}

const HORIZONS = [30, 60, 90, 180] as const;

/**
 * Repeat rate by acquisition month at 30/60/90/180 days — measured from
 * each customer's own first-order date, so every cohort is compared on
 * equal footing (unlike a calendar-month grid, where a customer acquired
 * on the 29th has two days to "repeat in month 0").
 *
 * Computed from order history, NOT from a maintained sheet tab: the data
 * is already here and a derived number can't drift from its source.
 */
export async function getCohortHorizons(clientId: string): Promise<CohortHorizon[] | null> {
  const db = await getDb();
  const rows = await db.query<{ customer_key: string; day: string }>(
    `select customer_key, day::text as day from shopify_orders where client_id = $1`, [clientId]);
  if (!rows.length) return null;

  const orders = new Map<string, string[]>();
  let latest = "0000-00-00";
  for (const r of rows) {
    if (r.day > latest) latest = r.day;
    const list = orders.get(r.customer_key);
    if (list) list.push(r.day); else orders.set(r.customer_key, [r.day]);
  }
  const latestMs = Date.parse(latest + "T00:00:00Z");
  const day = 86400000;

  const byMonth = new Map<string, { size: number; hits: number[]; ripe: boolean[] }>();
  for (const [, days] of orders) {
    days.sort();
    const first = days[0];
    const firstMs = Date.parse(first + "T00:00:00Z");
    const month = first.slice(0, 8) + "01";
    const slot = byMonth.get(month) ?? { size: 0, hits: [0, 0, 0, 0], ripe: [true, true, true, true] };
    slot.size += 1;
    HORIZONS.forEach((h, i) => {
      // the cohort only counts toward a horizon once every member has had
      // the full window — otherwise recent cohorts look artificially bad
      if (firstMs + h * day > latestMs) slot.ripe[i] = false;
      if (days.some((d) => {
        const ms = Date.parse(d + "T00:00:00Z");
        return ms > firstMs && ms <= firstMs + h * day;
      })) slot.hits[i] += 1;
    });
    byMonth.set(month, slot);
  }

  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, s], i) => ({
    month, size: s.size, censored: i === 0,
    r30: s.ripe[0] ? s.hits[0] / s.size : null,
    r60: s.ripe[1] ? s.hits[1] / s.size : null,
    r90: s.ripe[2] ? s.hits[2] / s.size : null,
    r180: s.ripe[3] ? s.hits[3] / s.size : null,
  }));
}

// ---------- win-back queue ----------

export interface WinbackSegment {
  key: RfmSegmentKey;
  label: string;
  count: number;
  historicValue: number;      // lifetime revenue sitting in the segment
  rule: string;               // the filter, in words a buyer can audit
  treatment: string;          // the prescribed move
  rationale: string;          // why that move, for this segment
  derivation: string[];       // how we got to the number, step by step
  sample: WinbackCustomer[];  // first few, highest lifetime spend
  more: number;               // how many beyond the sample
}

export interface RfmResult {
  asOf: string;                 // latest order day (reference for recency)
  totalCustomers: number;       // identifiable (email on file) only
  anonOrders: number;           // orders excluded — no email, can't be contacted
  segments: RfmSegment[];       // fixed order, all six always present
  winback: WinbackCustomer[];   // lost regulars, highest lifetime spend first
  winbackTotal: number;         // all lost regulars (winback is capped for display)
  winbackRevenue: number;       // lifetime revenue sitting with lost regulars
  /** the three segments worth a campaign this month, each fully derivable */
  winbackSegments: WinbackSegment[];
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

  const members = new Map<RfmSegmentKey, WinbackCustomer[]>();
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
    const list = members.get(key);
    const row = { name: c.name, email, orders: c.orders, lifetimeSpend: c.total, lastOrder: c.last };
    if (list) list.push(row); else members.set(key, [row]);
  }
  for (const list of members.values()) list.sort((a, b) => b.lifetimeSpend - a.lifetimeSpend);
  const lost = members.get("lost_regulars") ?? [];

  // The three segments worth a campaign this month. Derivation steps state
  // only what this pipeline actually does — no opt-in status, bounce history
  // or send-suppression, because none of that reaches us (see DATA-REQUESTS
  // #16 for the phone/address column that would widen the reachable base).
  const A = RFM_RULES.activeDays, L = RFM_RULES.lapsedDays;
  const campaignable: Array<{ key: RfmSegmentKey; rule: string; treatment: string; rationale: string }> = [
    {
      key: "lost_regulars",
      rule: `lifetime_orders >= 2 AND days_since_last_order > ${L}`,
      treatment: "WhatsApp win-back with an offer — highest lifetime spend first",
      rationale: "They have already proven they reorder, so this is reactivation rather than persuasion — the cheapest conversion available. Sorted by lifetime spend so the first batch carries the most recoverable value.",
    },
    {
      key: "slipping",
      rule: `lifetime_orders >= 2 AND days_since_last_order between ${A + 1} and ${L}`,
      treatment: "Light WhatsApp nudge, no discount",
      rationale: "One missed cycle, not a lapse. A discount here trains regulars to wait for one — a reminder that their usual items are back in season does the same job without margin.",
    },
    {
      key: "cooling_one",
      rule: `lifetime_orders = 1 AND days_since_last_order between ${A + 1} and ${L}`,
      treatment: "Second-purchase prompt — the produce they bought, back in stock",
      rationale: "The second order is where this account leaks hardest: most customers never place one. Reaching them inside 90 days, while the brand is still familiar, is the single largest growth lever in the base.",
    },
  ];

  const winbackSegments: WinbackSegment[] = campaignable.map(({ key, rule, treatment, rationale }) => {
    const list = members.get(key) ?? [];
    const s = seg.get(key)!;
    const band = key === "lost_regulars" ? `more than ${L} days ago` : `between ${A + 1} and ${L} days ago`;
    const orderRule = key === "cooling_one" ? "exactly one order" : "two or more orders";
    return {
      key, label: SEGMENT_META[key].label,
      count: s.customers, historicValue: s.lifetimeRevenue,
      rule, treatment, rationale,
      derivation: [
        `Start from the Shopify order export: ${rows.length.toLocaleString("en-IN")} orders on file, through ${asOf}.`,
        `Drop ${anonOrders.toLocaleString("en-IN")} orders with no email — they cannot be contacted, so they cannot be campaigned to. ${cust.size.toLocaleString("en-IN")} identifiable customers remain.`,
        `Collapse to one row per customer: order count, lifetime spend, and most recent order date.`,
        `Keep customers with ${orderRule} whose last order was ${band} (measured against ${asOf}, the latest order on file — not today's date).`,
        `${s.customers.toLocaleString("en-IN")} customers qualify, carrying ₹${Math.round(s.lifetimeRevenue).toLocaleString("en-IN")} of lifetime spend.`,
      ],
      sample: list.slice(0, 5),
      more: Math.max(0, list.length - 5),
    };
  });

  return {
    asOf,
    totalCustomers: cust.size,
    anonOrders,
    segments: keys.map((k) => ({ key: k, ...SEGMENT_META[k], ...seg.get(k)! })),
    winback: lost.slice(0, 30),
    winbackTotal: lost.length,
    winbackRevenue: lost.reduce((s, c) => s + c.lifetimeSpend, 0),
    winbackSegments,
    fivePlusCustomers,
    fivePlusRevenueShare: allRevenue > 0 ? fivePlusRevenue / allRevenue : 0,
  };
}
