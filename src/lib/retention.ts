/**
 * Retention-channel metrics (WhatsApp remarketing + email marketing) from
 * the customer-data sheet, tab "8. Retention". One row per month:
 *
 *   Month | WhatsApp spend | WhatsApp revenue | WhatsApp orders | Emails sent | Email open rate
 *
 * Values land in manual_actuals (wa_spend, wa_revenue, wa_orders,
 * email_sent, email_open_rate) — the same table every other client-reported
 * monthly uses, so nothing downstream needs a new source.
 *
 * The tab doesn't exist yet — these numbers currently live only in the
 * monthly review deck (July: ₹20.5k spend → ₹3.89L revenue, 342 orders,
 * 18.97× ROAS). Ingestion no-ops gracefully until the team adds the tab;
 * the exact format is documented in DATA-REQUESTS.md.
 */
import { getDb } from "./db";
import { sheetsClient } from "./google";

const RETENTION_TAB = "8. Retention";

const N = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Accepts a sheet date serial, "YYYY-MM(-DD)", "Jul 2026", "Jul'26", "July 2026". */
function parseMonth(v: unknown): string | null {
  if (typeof v === "number" && v > 20000) {
    const ms = Date.UTC(1899, 11, 30) + v * 86400000;
    return new Date(ms).toISOString().slice(0, 8) + "01";
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-01`;
  const named = s.match(/^([A-Za-z]{3,9})\.?\s*'?\s*(\d{2,4})$/);
  if (named) {
    const m = MONTH_NAMES[named[1].slice(0, 3).toLowerCase()];
    if (!m) return null;
    const yr = named[2].length === 2 ? 2000 + Number(named[2]) : Number(named[2]);
    return `${yr}-${String(m).padStart(2, "0")}-01`;
  }
  return null;
}

export async function ingestRetentionChannels(clientSlug: string): Promise<
  { months: number; metrics: number } | { skipped: string }
> {
  const sheetId = process.env.CUSTOMER_DATA_SHEET_ID;
  if (!sheetId) return { skipped: "CUSTOMER_DATA_SHEET_ID not set" };

  const db = await getDb();
  const [client] = await db.query<{ id: string }>(
    `select id from clients where slug = $1`, [clientSlug]);
  if (!client) throw new Error(`unknown client ${clientSlug}`);

  const sheets = sheetsClient();
  let values: unknown[][];
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${RETENTION_TAB}'!A1:F60`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    values = (resp.data.values ?? []) as unknown[][];
  } catch {
    // tab doesn't exist yet — expected until the team adds it
    return { skipped: `tab "${RETENTION_TAB}" not found` };
  }

  let months = 0, metrics = 0;
  for (const row of values.slice(1)) {
    const month = parseMonth(row[0]);
    if (!month) continue;
    // open rate may arrive as a % cell (0.2563) or a typed number (25.63)
    const rawOpen = N(row[5]);
    const openRate = rawOpen != null && rawOpen <= 1 ? rawOpen * 100 : rawOpen;
    const entries: Array<[string, number | null]> = [
      ["wa_spend", N(row[1])],
      ["wa_revenue", N(row[2])],
      ["wa_orders", N(row[3])],
      ["email_sent", N(row[4])],
      ["email_open_rate", openRate],
    ];
    let wrote = false;
    for (const [metric, value] of entries) {
      if (value == null) continue;
      await db.query(
        `insert into manual_actuals (client_id, month, metric, value, source)
         values ($1,$2,$3,$4,'retention_tab')
         on conflict (client_id, month, metric) do update
           set value = excluded.value, source = excluded.source, updated_at = now()`,
        [client.id, month, metric, value]);
      metrics++; wrote = true;
    }
    if (wrote) months++;
  }
  await db.query(
    `insert into sync_runs (client_id, source, rows_upserted, anomalies) values ($1,$2,$3,$4)`,
    [client.id, "retention_tab", metrics, JSON.stringify([])]);
  return { months, metrics };
}

export interface RetentionMonth {
  month: string;                  // YYYY-MM-01
  waSpend: number | null;
  waRevenue: number | null;
  waOrders: number | null;
  emailSent: number | null;
  emailOpenRate: number | null;   // percentage, e.g. 25.63
  waRoas: number | null;
}

/** Months with any retention metrics, ascending. Empty until the tab lands. */
export async function getRetentionChannels(clientId: string): Promise<RetentionMonth[]> {
  const db = await getDb();
  const rows = await db.query<{ month: string; metric: string; value: number }>(
    `select month::text as month, metric, value from manual_actuals
     where client_id = $1
       and metric in ('wa_spend','wa_revenue','wa_orders','email_sent','email_open_rate')`,
    [clientId]);
  const byMonth = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, new Map());
    byMonth.get(r.month)!.set(String(r.metric), Number(r.value));
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, m]) => {
    const waSpend = m.get("wa_spend") ?? null;
    const waRevenue = m.get("wa_revenue") ?? null;
    return {
      month,
      waSpend, waRevenue,
      waOrders: m.get("wa_orders") ?? null,
      emailSent: m.get("email_sent") ?? null,
      emailOpenRate: m.get("email_open_rate") ?? null,
      waRoas: waSpend != null && waSpend > 0 && waRevenue != null ? waRevenue / waSpend : null,
    };
  });
}
