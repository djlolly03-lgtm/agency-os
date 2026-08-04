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
