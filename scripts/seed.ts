/**
 * Seed the database from the workbook export CSVs in data/.
 * Uses the same ingestion layer as the scheduled Sheets sync.
 *
 * Run: npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";
import { Ingestor, type MetaRow, type GoogleRow } from "../src/lib/ingest";

const DATA = path.join(process.cwd(), "data");

function parseCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(path.join(DATA, file), "utf8").replace(/\r/g, "").trim();
  const lines = text.split("\n");
  const header = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

/** Minimal CSV parser handling quoted cells (names contain commas). */
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

const num = (s: string) => (s === "" || s == null ? 0 : Number(s) || 0);

async function main() {
  const db = await getDb();

  const [client] = await db.query<{ id: string }>(
    `insert into clients (name, slug) values ('Organik Truck', 'organik-truck')
     on conflict (slug) do update set name = excluded.name
     returning id`);
  const clientId = client.id;
  const ing = new Ingestor(db, clientId);

  console.log("Seeding Meta ad-daily facts…");
  const metaRows: MetaRow[] = parseCsv("meta_ad_daily.csv").map((r) => ({
    day: r.day, campaign: r.campaign_name, adSet: r.ad_set_name, ad: r.ad_name,
    delivery: r.delivery || null, adStart: r.ad_start_date || null,
    reach: num(r.reach), impressions: num(r.impressions), frequency: num(r.frequency),
    spend: num(r.spend), linkClicks: num(r.link_clicks), lpViews: num(r.lp_views),
    addsToCart: num(r.adds_to_cart), paymentInfo: num(r.payment_info),
    checkouts: num(r.checkouts), purchases: num(r.purchases), revenue: num(r.revenue),
  }));
  const meta = await ing.ingestMeta(metaRows);

  console.log("Seeding Google campaign-daily facts…");
  const googleRows: GoogleRow[] = parseCsv("google_campaign_daily.csv").map((r) => ({
    day: r.day, campaign: r.campaign_name,
    impressions: num(r.impressions), clicks: num(r.clicks), spend: num(r.spend),
    conversions: num(r.conversions), convValue: num(r.conv_value),
  }));
  const google = await ing.ingestGoogle(googleRows);

  console.log("Seeding manual actuals…");
  const manual = parseCsv("manual_actuals.csv");
  for (const r of manual) {
    await db.query(
      `insert into manual_actuals (client_id, month, metric, value, source)
       values ($1,$2,$3,$4,$5)
       on conflict (client_id, month, metric) do update set value = excluded.value`,
      [clientId, r.month, r.metric, num(r.value), r.source]);
  }

  await ing.refreshCampaignSeen();
  const anomalies = [...meta.anomalies, ...google.anomalies, ...(await ing.detectGaps())];
  await ing.recordRun("seed", meta.upserted + google.upserted + manual.length, anomalies);

  console.log("\n=== Verification: monthly Meta totals ===");
  console.table(await db.query(
    `select to_char(date_trunc('month', day), 'YYYY-MM') as month,
            round(sum(spend)) as spend, sum(purchases)::int as purchases, round(sum(revenue)) as revenue
     from fact_ad_daily group by 1 order by 1`));
  if (anomalies.length) {
    console.log(`anomalies (${anomalies.length}):`);
    anomalies.slice(0, 10).forEach((a) => console.log(` - [${a.kind}] ${a.detail}`));
    if (anomalies.length > 10) console.log(` … and ${anomalies.length - 10} more`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
