/**
 * Google Sheets → DB sync. Reads the two manual-input tabs from the workbook
 * and upserts through the shared Ingestor. Safe to run any number of times.
 */
import { getDb } from "./db";
import { Ingestor, type MetaRow, type GoogleRow, type Anomaly } from "./ingest";
import { sheetsClient } from "./google";

const META_TAB = "Raw Data";
const GOOGLE_TAB = "Raw Data - Google";

/** Sheets serial/date-string → YYYY-MM-DD (sheet uses date-formatted cells). */
function toIsoDay(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  // already ISO-ish
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy or mm/dd/yyyy — the sheet renders dates unambiguously as yyyy-mm-dd
  // with UNFORMATTED_VALUE we get a serial number instead:
  const n = Number(s);
  if (!Number.isNaN(n) && n > 20000 && n < 80000) {
    // Google Sheets epoch: 1899-12-30
    const ms = Date.UTC(1899, 11, 30) + n * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const num = (v: unknown): number => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

export async function runSheetSync(clientSlug: string): Promise<{
  meta: number; google: number; anomalies: Anomaly[];
}> {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) throw new Error("SHEET_ID not set");

  const db = await getDb();
  const [client] = await db.query<{ id: string }>(
    `select id from clients where slug = $1`, [clientSlug]);
  if (!client) throw new Error(`unknown client ${clientSlug}`);

  const sheets = sheetsClient();
  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges: [`'${META_TAB}'!A1:AL`, `'${GOOGLE_TAB}'!A1:K`],
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  const [metaRange, googleRange] = resp.data.valueRanges ?? [];
  const anomalies: Anomaly[] = [];

  // ---- Meta tab ----
  const metaValues = metaRange?.values ?? [];
  const metaHeader = (metaValues[0] ?? []).map((h: unknown) => String(h).trim());
  const col = (name: string) => metaHeader.findIndex((h: string) => h.toLowerCase().startsWith(name.toLowerCase()));
  const ci = {
    day: col("Day"), campaign: col("Campaign name"), adSet: col("Ad set name"), ad: col("Ad name"),
    delivery: col("Campaign delivery"), reach: col("Reach"), impressions: col("Impressions"),
    frequency: col("Frequency"), spend: col("Amount spent"), starts: col("Starts"),
    linkClicks: col("Link clicks"), lpViews: col("Landing page views"),
    atc: col("Adds to cart"), payInfo: col("Adds of payment info"), checkouts: col("Checkouts initiated"),
    purchases: col("Purchases"), revenue: col("Purchases conversion value"),
  };
  for (const [k, v] of Object.entries(ci)) {
    if (v < 0) anomalies.push({ kind: "schema_change", detail: `Meta tab: column "${k}" not found — sheet layout changed?` });
  }

  const metaRows: MetaRow[] = [];
  for (const row of metaValues.slice(1)) {
    const day = toIsoDay(row[ci.day]);
    if (!day) continue;
    metaRows.push({
      day,
      campaign: String(row[ci.campaign] ?? "").trim(),
      adSet: String(row[ci.adSet] ?? "").trim(),
      ad: String(row[ci.ad] ?? "").trim(),
      delivery: row[ci.delivery] ? String(row[ci.delivery]) : null,
      adStart: toIsoDay(row[ci.starts]),
      reach: num(row[ci.reach]), impressions: num(row[ci.impressions]), frequency: num(row[ci.frequency]),
      spend: num(row[ci.spend]), linkClicks: num(row[ci.linkClicks]), lpViews: num(row[ci.lpViews]),
      addsToCart: num(row[ci.atc]), paymentInfo: num(row[ci.payInfo]), checkouts: num(row[ci.checkouts]),
      purchases: num(row[ci.purchases]), revenue: num(row[ci.revenue]),
    });
  }

  // ---- Google tab ----
  const gValues = googleRange?.values ?? [];
  const gHeader = (gValues[0] ?? []).map((h: unknown) => String(h).trim().toLowerCase());
  const gcol = (name: string) => gHeader.findIndex((h: string) => h.startsWith(name));
  const gi = {
    day: gcol("day"), campaign: gcol("campaign"), impressions: gcol("impr"),
    clicks: gcol("click"), cost: gcol("cost"), conversions: gcol("conversions"),
    convValue: gcol("conv. value"),
  };
  const googleRows: GoogleRow[] = [];
  for (const row of gValues.slice(1)) {
    const day = toIsoDay(row[gi.day]);
    if (!day) continue;
    googleRows.push({
      day, campaign: String(row[gi.campaign] ?? "").trim(),
      impressions: num(row[gi.impressions]), clicks: num(row[gi.clicks]),
      spend: num(row[gi.cost]), conversions: num(row[gi.conversions]), convValue: num(row[gi.convValue]),
    });
  }

  const ing = new Ingestor(db, client.id);
  const m = await ing.ingestMeta(metaRows);
  const g = await ing.ingestGoogle(googleRows);
  await ing.refreshCampaignSeen();
  anomalies.push(...m.anomalies, ...g.anomalies, ...(await ing.detectGaps()));
  await ing.recordRun("sheet", m.upserted + g.upserted, anomalies);

  return { meta: m.upserted, google: g.upserted, anomalies };
}
