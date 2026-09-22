/**
 * Import the client-team's offline CSV drop (Sep 2026) — pincode orders,
 * product-level new-vs-returning mix, product-level sales/reversals,
 * Shopify's email marketing engagement, and WhatsApp retention performance.
 * NOT part of the nightly sync: these are one-time exports from the
 * client's own Shopify admin / WhatsApp tool, dropped in ../DATA - OFFLINE/.
 * Re-run this script whenever the client sends fresher files — it deletes
 * and reinserts each client's rows wholesale, same pattern as scripts/seed.ts.
 *
 * Deliberately skips "App Orders Data" (Mixpanel export): only 37 events
 * across 3 of the 10 months, and its "order_id" field is actually a
 * Shopify CART id, not an order id — too thin and not reliably joinable to
 * build a website-vs-app comparison on. See DATA-REQUESTS.md.
 *
 * Run: npx tsx scripts/seed_offline_data.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";

const DATA = path.join(process.cwd(), "..", "DATA - OFFLINE");

function parseCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(path.join(DATA, file), "utf8")
    .replace(/^﻿/, "").replace(/\r/g, "").trim();
  const lines = text.split("\n");
  const header = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

/** Minimal CSV parser handling quoted cells (values contain commas). */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const num = (s: string): number | null => {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

async function main() {
  const db = await getDb();
  const [client] = await db.query<{ id: string }>(
    `select id from clients where slug = 'organik-truck'`);
  if (!client) throw new Error("run scripts/seed.ts first — client doesn't exist yet");
  const clientId = client.id;
  const today = new Date().toISOString().slice(0, 10);

  // ---- Pincode Wise Orders Over Time — genuine monthly time series ----
  console.log("Seeding pincode orders…");
  const pinRows = parseCsv("Pincode Wise Orders Over Time Data - Nov'25 to Aug'26.csv");
  const byMonthPin = new Map<string, { orders: number; qtySum: number; aovSum: number }>();
  for (const r of pinRows) {
    const month = r["Month"];
    const pin = r["Shipping postal code"] || r["Billing postal code"];
    if (!month || !pin) continue;
    const orders = num(r["Orders"]) ?? 0;
    const qty = num(r["Quantity ordered per order"]) ?? 0;
    const aov = num(r["Average order value"]) ?? 0;
    const key = `${month}|${pin}`;
    const e = byMonthPin.get(key) ?? { orders: 0, qtySum: 0, aovSum: 0 };
    e.orders += orders; e.qtySum += qty * orders; e.aovSum += aov * orders;
    byMonthPin.set(key, e);
  }
  await db.query(`delete from pincode_orders where client_id = $1`, [clientId]);
  let pinCount = 0;
  for (const [key, e] of byMonthPin) {
    const [month, pin] = key.split("|");
    await db.query(
      `insert into pincode_orders (client_id, month, postal_code, orders, qty_per_order, aov)
       values ($1,$2,$3,$4,$5,$6)`,
      [clientId, month, pin, e.orders, e.orders > 0 ? e.qtySum / e.orders : null,
        e.orders > 0 ? e.aovSum / e.orders : null]);
    pinCount++;
  }
  console.log(`  ${pinCount} client-month-pincode rows`);

  // ---- New vs Returning Customers by Product — all-time snapshot ----
  console.log("Seeding product customer mix…");
  const mixRows = parseCsv("New vs Returning Customers Data - Nov'25 to Aug'26.csv");
  await db.query(`delete from product_customer_mix where client_id = $1`, [clientId]);
  let mixCount = 0;
  for (const r of mixRows) {
    const product = r["Product title"];
    const seg = r["New or returning customer"]?.toLowerCase();
    if (!product || (seg !== "new" && seg !== "returning")) continue;
    await db.query(
      `insert into product_customer_mix
         (client_id, product_title, segment, customers, orders, aov, qty_ordered, as_of)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (client_id, product_title, segment) do update
         set customers = excluded.customers, orders = excluded.orders,
             aov = excluded.aov, qty_ordered = excluded.qty_ordered, as_of = excluded.as_of`,
      [clientId, product, seg, num(r["Customers"]) ?? 0, num(r["Orders"]) ?? 0,
        num(r["Average order value"]), num(r["Quantity ordered"]), today]);
    mixCount++;
  }
  console.log(`  ${mixCount} product×segment rows`);

  // ---- Product Wise Sales — all-time snapshot, carries refunds ----
  console.log("Seeding product sales…");
  const salesRows = parseCsv("Product Wise Sales Data - Nov'25 to Aug'26.csv");
  await db.query(`delete from product_sales where client_id = $1`, [clientId]);
  let salesCount = 0;
  for (const r of salesRows) {
    const product = r["Product title"];
    const seg = r["New or returning customer"]?.toLowerCase();
    if (!product || (seg !== "new" && seg !== "returning")) continue;
    await db.query(
      `insert into product_sales
         (client_id, product_title, vendor, product_type, segment, net_items_sold,
          gross_sales, discounts, sales_reversals, net_sales, taxes, total_sales, as_of)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (client_id, product_title, segment) do update
         set vendor = excluded.vendor, product_type = excluded.product_type,
             net_items_sold = excluded.net_items_sold, gross_sales = excluded.gross_sales,
             discounts = excluded.discounts, sales_reversals = excluded.sales_reversals,
             net_sales = excluded.net_sales, taxes = excluded.taxes,
             total_sales = excluded.total_sales, as_of = excluded.as_of`,
      [clientId, product, r["Product vendor"] || null, r["Product type"] || null, seg,
        num(r["Net items sold"]), num(r["Gross sales"]), num(r["Discounts"]),
        num(r["Sales reversals"]), num(r["Net sales"]), num(r["Taxes"]), num(r["Total sales"]), today]);
    salesCount++;
  }
  console.log(`  ${salesCount} product×segment rows`);

  // ---- Shopify Email Marketing — feeds the existing manual_actuals /
  // retention-channels pipeline directly (email_sent, email_open_rate),
  // same metric keys the "8. Retention" tab was always meant to fill.
  // WhatsApp stays empty — this export doesn't carry it.
  console.log("Seeding email marketing engagement…");
  const emailRows = parseCsv("Shopify's Email Marketing Data - Nov'25 to Aug'26.csv");
  let emailCount = 0;
  for (const r of emailRows) {
    const month = r["Month"];
    const sends = num(r["Sends"]);
    const views = num(r["Unique views"]);
    if (!month || sends == null) continue;
    const openRate = sends > 0 && views != null ? (views / sends) * 100 : null;
    const entries: Array<[string, number | null]> = [["email_sent", sends], ["email_open_rate", openRate]];
    for (const [metric, value] of entries) {
      if (value == null) continue;
      await db.query(
        `insert into manual_actuals (client_id, month, metric, value, source)
         values ($1,$2,$3,$4,'offline_email_export')
         on conflict (client_id, month, metric) do update
           set value = excluded.value, source = excluded.source, updated_at = now()`,
        [clientId, month, metric, value]);
      emailCount++;
    }
  }
  console.log(`  ${emailCount} monthly metric rows`);

  // ---- WhatsApp retention performance — the other half of the "8.
  // Retention" pipeline; the Shopify email export above only ever carried
  // email. Per-campaign send log, aggregated to the same manual_actuals
  // monthly grain (wa_revenue, wa_sent, wa_open_rate). No spend or order
  // count anywhere in this export, so wa_spend/wa_orders stay unset and the
  // ROAS card falls back to a revenue-led read until spend lands separately.
  console.log("Seeding WhatsApp retention performance…");
  const waRows = parseCsv("WhatsApp Retention Performance - Apr'26 to Aug'26.csv");
  // 13–31 Aug ships every campaign with Opened/CTR/Revenue all exactly 0
  // across 9 consecutive sends, despite realistic Sent volumes (1.5k–7.5k)
  // and every earlier week showing normal 47–83% open-rate variance — that
  // pattern reads as "results not synced back yet" for this export's cutoff,
  // not as nine campaigns that genuinely fell to zero. Excluded from the
  // monthly rollup rather than counted as real zeros; re-run this script
  // once the client re-exports with that stretch filled in.
  const UNREPORTED_FROM = "2026-08-13", UNREPORTED_TO = "2026-08-31";
  const byMonthWa = new Map<string, { revenue: number; sent: number; openedWeighted: number }>();
  let waSkipped = 0;
  for (const r of waRows) {
    const date = r["Date"];
    if (!date) continue;
    if (date >= UNREPORTED_FROM && date <= UNREPORTED_TO) { waSkipped++; continue; }
    const month = date.slice(0, 7) + "-01";
    const sent = num(r["Sent"]) ?? 0;
    const revenue = num(r["Revenue"]) ?? 0;
    const openRate = num(r["Opened"]) ?? 0; // fraction, e.g. 0.725
    const e = byMonthWa.get(month) ?? { revenue: 0, sent: 0, openedWeighted: 0 };
    e.revenue += revenue; e.sent += sent; e.openedWeighted += openRate * sent;
    byMonthWa.set(month, e);
  }
  let waCount = 0;
  for (const [month, e] of byMonthWa) {
    const entries: Array<[string, number | null]> = [
      ["wa_revenue", e.revenue],
      ["wa_sent", e.sent],
      ["wa_open_rate", e.sent > 0 ? (e.openedWeighted / e.sent) * 100 : null],
    ];
    for (const [metric, value] of entries) {
      if (value == null) continue;
      await db.query(
        `insert into manual_actuals (client_id, month, metric, value, source)
         values ($1,$2,$3,$4,'offline_whatsapp_export')
         on conflict (client_id, month, metric) do update
           set value = excluded.value, source = excluded.source, updated_at = now()`,
        [clientId, month, metric, value]);
      waCount++;
    }
  }
  console.log(`  ${waCount} monthly metric rows (${waSkipped} unreported-tail rows skipped)`);

  console.log("\n=== Verification: top 10 pincodes by total orders ===");
  console.table(await db.query(
    `select postal_code, sum(orders)::int as orders, round(avg(aov)) as avg_aov
     from pincode_orders where client_id = $1 group by 1 order by 2 desc limit 10`, [clientId]));
  console.log("\n=== Verification: top 10 products by net sales ===");
  console.table(await db.query(
    `select product_title, sum(net_sales) as net_sales, sum(sales_reversals) as reversals
     from product_sales where client_id = $1 group by 1 order by 2 desc limit 10`, [clientId]));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
