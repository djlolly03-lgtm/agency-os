/**
 * Shared ingestion layer — used by both the one-time CSV seed and the
 * scheduled Google Sheets sync. Entity resolution by name (Sheets era),
 * idempotent (ad_id, day) upserts, anomaly detection logged to sync_runs.
 */
import type { Db } from "./db";

export interface MetaRow {
  day: string;            // YYYY-MM-DD
  campaign: string;
  adSet: string;
  ad: string;
  delivery: string | null;
  adStart: string | null; // YYYY-MM-DD
  reach: number; impressions: number; frequency: number;
  spend: number; linkClicks: number; lpViews: number;
  addsToCart: number; paymentInfo: number; checkouts: number;
  purchases: number; revenue: number;
}

export interface GoogleRow {
  day: string;
  campaign: string;
  impressions: number; clicks: number; spend: number;
  conversions: number; convValue: number;
}

export interface Anomaly { kind: string; detail: string }

export function inferFormat(adName: string): string {
  const n = adName.toLowerCase();
  if (/reel|video/.test(n)) return "video";
  if (/carousel/.test(n)) return "carousel";
  if (/static|single image|image/.test(n)) return "static";
  if (/post/.test(n)) return "post";
  return "unknown";
}

export class Ingestor {
  private campaignIds = new Map<string, string>();
  private adSetIds = new Map<string, string>();
  private adIds = new Map<string, string>();

  constructor(private db: Db, private clientId: string) {}

  async accountId(platform: "meta" | "google"): Promise<string> {
    const rows = await this.db.query<{ id: string }>(
      `select id from ad_accounts where client_id = $1 and platform = $2`,
      [this.clientId, platform]);
    if (rows.length) return rows[0].id;
    const [r] = await this.db.query<{ id: string }>(
      `insert into ad_accounts (client_id, platform) values ($1, $2) returning id`,
      [this.clientId, platform]);
    return r.id;
  }

  private async ensureCampaign(account: string, name: string): Promise<string> {
    const key = `${account}|${name}`;
    const hit = this.campaignIds.get(key);
    if (hit) return hit;
    const [r] = await this.db.query<{ id: string }>(
      `insert into campaigns (ad_account_id, name) values ($1, $2)
       on conflict (ad_account_id, name) do update set name = excluded.name returning id`,
      [account, name]);
    this.campaignIds.set(key, r.id);
    return r.id;
  }

  private async ensureAdSet(campaign: string, name: string): Promise<string> {
    const key = `${campaign}|${name}`;
    const hit = this.adSetIds.get(key);
    if (hit) return hit;
    const [r] = await this.db.query<{ id: string }>(
      `insert into ad_sets (campaign_id, name) values ($1, $2)
       on conflict (campaign_id, name) do update set name = excluded.name returning id`,
      [campaign, name]);
    this.adSetIds.set(key, r.id);
    return r.id;
  }

  private async ensureAd(adSet: string, name: string, launched: string | null): Promise<string> {
    const key = `${adSet}|${name}`;
    const hit = this.adIds.get(key);
    if (hit) return hit;
    const [r] = await this.db.query<{ id: string }>(
      `insert into ads (ad_set_id, name, format, launched_on)
       values ($1, $2, $3, nullif($4,'')::date)
       on conflict (ad_set_id, name) do update
         set launched_on = least(coalesce(ads.launched_on, excluded.launched_on), excluded.launched_on)
       returning id`,
      [adSet, name, inferFormat(name), launched ?? ""]);
    this.adIds.set(key, r.id);
    return r.id;
  }

  /** Aggregate same-(ad, day) duplicates, then upsert with replace semantics. */
  async ingestMeta(rows: MetaRow[]): Promise<{ upserted: number; anomalies: Anomaly[] }> {
    const anomalies: Anomaly[] = [];
    const metaAccount = await this.accountId("meta");
    type Agg = { adId: string; day: string; delivery: string | null; n: number[] };
    const agg = new Map<string, Agg>();
    let dupes = 0;

    for (const r of rows) {
      if (!r.day || !r.campaign) continue;
      const camp = await this.ensureCampaign(metaAccount, r.campaign);
      const adSet = await this.ensureAdSet(camp, r.adSet || r.campaign);
      const adId = await this.ensureAd(adSet, r.ad || r.adSet || r.campaign, r.adStart);
      const key = `${adId}|${r.day}`;
      const vals = [r.spend, r.impressions, r.reach, r.frequency, r.linkClicks, r.lpViews,
        r.addsToCart, r.paymentInfo, r.checkouts, r.purchases, r.revenue];
      const prev = agg.get(key);
      if (prev) {
        dupes++;
        prev.n = prev.n.map((v, i) => (i === 3 ? Math.max(v, vals[i]) : v + vals[i]));
      } else {
        agg.set(key, { adId, day: r.day, delivery: r.delivery, n: vals });
      }
    }
    if (dupes) anomalies.push({ kind: "duplicate_rows", detail: `${dupes} same-(ad, day) rows merged` });

    // batched multi-row upserts (14 params/row; 200 rows/statement) — one
    // network round trip per chunk instead of per row
    const rows14 = [...agg.values()].map(({ adId, day, delivery, n }) =>
      [adId, day, n[0], n[1], n[2] || null, n[3] || null, n[4], n[5], n[6], n[7], n[8], n[9], n[10], delivery]);
    const CHUNK = 200;
    for (let i = 0; i < rows14.length; i += CHUNK) {
      const chunk = rows14.slice(i, i + CHUNK);
      const placeholders = chunk.map((_, r) =>
        `(${Array.from({ length: 14 }, (_, c) => `$${r * 14 + c + 1}`).join(",")})`).join(",");
      await this.db.query(
        `insert into fact_ad_daily
           (ad_id, day, spend, impressions, reach, frequency, link_clicks, lp_views,
            adds_to_cart, payment_info, checkouts, purchases, revenue, delivery)
         values ${placeholders}
         on conflict (ad_id, day) do update set
           spend = excluded.spend, impressions = excluded.impressions,
           reach = excluded.reach, frequency = excluded.frequency,
           link_clicks = excluded.link_clicks, lp_views = excluded.lp_views,
           adds_to_cart = excluded.adds_to_cart, payment_info = excluded.payment_info,
           checkouts = excluded.checkouts, purchases = excluded.purchases,
           revenue = excluded.revenue, delivery = excluded.delivery`,
        chunk.flat());
    }
    return { upserted: agg.size, anomalies };
  }

  async ingestGoogle(rows: GoogleRow[]): Promise<{ upserted: number; anomalies: Anomaly[] }> {
    const googleAccount = await this.accountId("google");
    type Agg = { campaignId: string; day: string; n: number[] };
    const agg = new Map<string, Agg>();
    for (const r of rows) {
      if (!r.day || !r.campaign) continue;
      const camp = await this.ensureCampaign(googleAccount, r.campaign);
      const key = `${camp}|${r.day}`;
      const vals = [r.spend, r.impressions, r.clicks, r.conversions, r.convValue];
      const prev = agg.get(key);
      if (prev) prev.n = prev.n.map((v, i) => v + vals[i]);
      else agg.set(key, { campaignId: camp, day: r.day, n: vals });
    }
    const rows7 = [...agg.values()].map(({ campaignId, day, n }) =>
      [campaignId, day, n[0], n[1], n[2], n[3], n[4]]);
    const CHUNK = 400;
    for (let i = 0; i < rows7.length; i += CHUNK) {
      const chunk = rows7.slice(i, i + CHUNK);
      const placeholders = chunk.map((_, r) =>
        `(${Array.from({ length: 7 }, (_, c) => `$${r * 7 + c + 1}`).join(",")})`).join(",");
      await this.db.query(
        `insert into fact_campaign_daily (campaign_id, day, spend, impressions, clicks, conversions, conv_value)
         values ${placeholders}
         on conflict (campaign_id, day) do update set
           spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks,
           conversions = excluded.conversions, conv_value = excluded.conv_value`,
        chunk.flat());
    }
    return { upserted: agg.size, anomalies: [] };
  }

  /** Data-quality checks after an ingest: gaps in the daily series. */
  async detectGaps(): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];
    const gaps = await this.db.query<{ platform: string; missing: string }>(
      `with days as (
         select platform, generate_series(min(day), max(day), interval '1 day')::date as day
         from unified_daily where client_id = $1 group by platform
       )
       select d.platform, d.day::text as missing
       from days d
       left join unified_daily u on u.platform = d.platform and u.day = d.day and u.client_id = $1
       where u.day is null
       order by d.platform, d.day`, [this.clientId]);
    for (const g of gaps) {
      anomalies.push({ kind: "missing_day", detail: `${g.platform}: no data for ${g.missing}` });
    }
    return anomalies;
  }

  async recordRun(source: string, rowsUpserted: number, anomalies: Anomaly[]) {
    await this.db.query(
      `insert into sync_runs (client_id, source, rows_upserted, anomalies) values ($1,$2,$3,$4)`,
      [this.clientId, source, rowsUpserted, JSON.stringify(anomalies)]);
  }

  async refreshCampaignSeen() {
    await this.db.query(`
      update campaigns c set first_seen = s.min_day, last_seen = s.max_day
      from (
        select campaign_id as id, min(day) as min_day, max(day) as max_day
        from unified_daily group by campaign_id
      ) s where s.id = c.id`);
  }
}
