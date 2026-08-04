/**
 * Metrics/query layer. Every ratio metric is computed here from additive
 * columns — never stored. Definitions mirror the metric_definitions table.
 *
 * "Today" is data-relative (latest ingested day), since data arrives via
 * manual daily exports rather than a live API.
 */
import { cache } from "react";
import { getDb } from "./db";
import { getShopifyCustomerStats } from "./shopify";

// ---------- shared ----------

export type Range = { from: string; to: string };

export function derive(m: {
  spend: number; impressions: number; clicks: number; lp_views: number;
  purchases: number; revenue: number;
}) {
  const safe = (a: number, b: number) => (b > 0 ? a / b : 0);
  return {
    roas: safe(m.revenue, m.spend),
    cpa: safe(m.spend, m.purchases),
    aov: safe(m.revenue, m.purchases),
    cpm: safe(m.spend, m.impressions) * 1000,
    cpc: safe(m.spend, m.clicks),
    ctr: safe(m.clicks, m.impressions),
    cplpv: safe(m.spend, m.lp_views),
    cvr: safe(m.purchases, m.lp_views),
  };
}

const N = (v: unknown) => Number(v ?? 0);

// cache() dedupes within a single request — layout and page both need the
// client row and latest day, and each cost a Tokyo round trip if run twice.
export const getClientBySlug = cache(async (slug: string) => {
  const db = await getDb();
  const rows = await db.query<{ id: string; name: string; slug: string; currency: string }>(
    `select id, name, slug, currency from clients where slug = $1`, [slug]);
  return rows[0] ?? null;
});

export const latestDay = cache(async (clientId: string): Promise<string> => {
  const db = await getDb();
  const [r] = await db.query<{ d: string }>(
    `select max(day)::text as d from unified_daily where client_id = $1`, [clientId]);
  return r?.d ?? new Date().toISOString().slice(0, 10);
});

// ---------- overview ----------

export interface PlatformTotals {
  platform: string; spend: number; impressions: number; clicks: number;
  lp_views: number; purchases: number; revenue: number;
}

async function totalsBetween(clientId: string, range: Range): Promise<PlatformTotals[]> {
  const db = await getDb();
  const rows = await db.query(
    `select platform, sum(spend) spend, sum(impressions) impressions, sum(clicks) clicks,
            sum(lp_views) lp_views, sum(purchases) purchases, sum(revenue) revenue
     from unified_daily where client_id = $1 and day between $2 and $3
     group by platform order by platform desc`, [clientId, range.from, range.to]); // meta before google
  return rows.map((r) => ({
    platform: String(r.platform), spend: N(r.spend), impressions: N(r.impressions),
    clicks: N(r.clicks), lp_views: N(r.lp_views), purchases: N(r.purchases), revenue: N(r.revenue),
  }));
}

function sumPlatforms(rows: PlatformTotals[]) {
  const t = { spend: 0, impressions: 0, clicks: 0, lp_views: 0, purchases: 0, revenue: 0 };
  for (const r of rows) {
    t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks;
    t.lp_views += r.lp_views; t.purchases += r.purchases; t.revenue += r.revenue;
  }
  return t;
}

export async function getOverview(clientId: string) {
  const today = await latestDay(clientId);
  const d = new Date(today + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const yesterday = iso(new Date(d.getTime() - 86400000));
  const monthStart = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  // previous MTD window of equal length for delta
  const prevMonthStart = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
  const prevMtdEnd = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, Math.min(d.getUTCDate(),
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).getUTCDate()))));

  const [todayRows, ydayRows, mtdRows, prevMtdRows] = await Promise.all([
    totalsBetween(clientId, { from: today, to: today }),
    totalsBetween(clientId, { from: yesterday, to: yesterday }),
    totalsBetween(clientId, { from: monthStart, to: today }),
    totalsBetween(clientId, { from: prevMonthStart, to: prevMtdEnd }),
  ]);

  const mtd = sumPlatforms(mtdRows);
  return {
    asOf: today,
    today: sumPlatforms(todayRows),
    yesterday: sumPlatforms(ydayRows),
    mtd: { ...mtd, ...derive(mtd) },
    prevMtd: (() => { const p = sumPlatforms(prevMtdRows); return { ...p, ...derive(p) }; })(),
    mtdByPlatform: mtdRows.map((r) => ({ ...r, ...derive(r) })),
  };
}

// ---------- timeseries ----------

export async function getTimeseries(clientId: string, grain: "day" | "week" | "month", range?: Range) {
  const db = await getDb();
  const trunc = grain === "day" ? "day" : grain === "week" ? "week" : "month";
  const params: unknown[] = [clientId];
  let dateFilter = "";
  if (range) { params.push(range.from, range.to); dateFilter = "and day between $2 and $3"; }
  const rows = await db.query(
    `select date_trunc('${trunc}', day)::date::text as period, platform,
            sum(spend) spend, sum(impressions) impressions, sum(clicks) clicks,
            sum(lp_views) lp_views, sum(purchases) purchases, sum(revenue) revenue
     from unified_daily where client_id = $1 ${dateFilter}
     group by 1, 2 order by 1`, params);
  return rows.map((r) => {
    const base = { spend: N(r.spend), impressions: N(r.impressions), clicks: N(r.clicks),
      lp_views: N(r.lp_views), purchases: N(r.purchases), revenue: N(r.revenue) };
    return { period: String(r.period), platform: String(r.platform), ...base, ...derive(base) };
  });
}

// ---------- creatives ----------

export type CreativeStatus = "winner" | "hidden_gem" | "average" | "fatiguing" | "testing" | "losing";

export interface CreativeRollup {
  ad_id: string; ad_name: string; ad_set: string; campaign: string; format: string;
  launched_on: string | null; first_day: string; last_day: string; days_running: number; active: boolean;
  spend: number; impressions: number; clicks: number; lp_views: number;
  purchases: number; revenue: number; frequency: number | null; adds_to_cart: number;
  window_spend: number; window_revenue: number; window_purchases: number;
  prior_spend: number; prior_revenue: number;
  status: CreativeStatus; status_reasons: string[];
  roas: number; cpa: number; aov: number; cpm: number; cpc: number; ctr: number; cplpv: number; cvr: number;
  asset_id: string | null; asset_filename: string | null; asset_mime: string | null; match_type: string | null;
}

/**
 * Status rules (v1 — thresholds are deliberately explicit so buyers can tune):
 * window = trailing 14 data-days; prior = the 28 days before that.
 * baseline = account-wide window ROAS.
 */
const RULES = {
  windowDays: 14,
  priorDays: 28,
  minTestSpend: 500,     // below this: not enough signal
  minTestDays: 7,
  winnerSpend: 3000,     // window spend proving scale
  winnerRoasX: 1.3,      // x account baseline
  gemRoasX: 1.5,
  gemShareMax: 0.05,     // <5% of window spend = under-fed
  loserNoSaleSpend: 2000,
  loserRoasX: 0.5,
  fatigueDrop: 0.4,      // window ROAS down 40%+ vs prior
};

export async function getCreatives(clientId: string) {
  const db = await getDb();
  const today = await latestDay(clientId);
  const d = new Date(today + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const winFrom = iso(new Date(d.getTime() - (RULES.windowDays - 1) * 86400000));
  const priorFrom = iso(new Date(d.getTime() - (RULES.windowDays + RULES.priorDays - 1) * 86400000));
  const priorTo = iso(new Date(d.getTime() - RULES.windowDays * 86400000));

  const rows = await db.query(
    `select a.id as ad_id, a.name as ad_name, a.format, a.launched_on::text as launched_on,
            s.name as ad_set, ca.name as campaign,
            min(f.day)::text as first_day, max(f.day)::text as last_day,
            count(distinct f.day)::int as days_running,
            sum(f.spend) spend, sum(f.impressions) impressions, sum(f.link_clicks) clicks,
            sum(f.lp_views) lp_views, sum(f.purchases) purchases, sum(f.revenue) revenue,
            max(f.frequency) frequency, sum(f.adds_to_cart) adds_to_cart,
            sum(f.spend) filter (where f.day >= $2) as window_spend,
            sum(f.revenue) filter (where f.day >= $2) as window_revenue,
            sum(f.purchases) filter (where f.day >= $2) as window_purchases,
            sum(f.spend) filter (where f.day between $3 and $4) as prior_spend,
            sum(f.revenue) filter (where f.day between $3 and $4) as prior_revenue
     from fact_ad_daily f
     join ads a on a.id = f.ad_id
     join ad_sets s on s.id = a.ad_set_id
     join campaigns ca on ca.id = s.campaign_id
     join ad_accounts aa on aa.id = ca.ad_account_id
     where aa.client_id = $1
     group by a.id, a.name, a.format, a.launched_on, s.name, ca.name
     order by sum(f.spend) desc`,
    [clientId, winFrom, priorFrom, priorTo]);

  // creative asset links (best link per ad: manual > exact > fuzzy)
  const links = await db.query<{ ad_id: string; asset_id: string; filename: string; mime_type: string | null; match_type: string }>(
    `select distinct on (l.ad_id) l.ad_id, l.asset_id, ca.filename, ca.mime_type, l.match_type
     from creative_links l
     join creative_assets ca on ca.id = l.asset_id
     where ca.client_id = $1
     order by l.ad_id, case l.match_type when 'manual' then 0 when 'exact' then 1 else 2 end, l.confidence desc`,
    [clientId]);
  const linkByAd = new Map(links.map((l) => [String(l.ad_id), l]));

  // account baselines: current window + lifetime (for inactive ads)
  let winSpendTotal = 0, winRevTotal = 0, lifeSpendTotal = 0, lifeRevTotal = 0;
  for (const r of rows) {
    winSpendTotal += N(r.window_spend); winRevTotal += N(r.window_revenue);
    lifeSpendTotal += N(r.spend); lifeRevTotal += N(r.revenue);
  }
  const baselineRoas = winSpendTotal > 0 ? winRevTotal / winSpendTotal : 0;
  const lifetimeBaselineRoas = lifeSpendTotal > 0 ? lifeRevTotal / lifeSpendTotal : 0;

  return rows.map((r) => {
    const base = { spend: N(r.spend), impressions: N(r.impressions), clicks: N(r.clicks),
      lp_views: N(r.lp_views), purchases: N(r.purchases), revenue: N(r.revenue) };
    const windowSpend = N(r.window_spend), windowRevenue = N(r.window_revenue);
    const priorSpend = N(r.prior_spend), priorRevenue = N(r.prior_revenue);
    const windowRoas = windowSpend > 0 ? windowRevenue / windowSpend : 0;
    const priorRoas = priorSpend > 0 ? priorRevenue / priorSpend : 0;
    const daysRunning = N(r.days_running);
    const active = String(r.last_day) >= winFrom;

    let status: CreativeStatus = "average";
    const reasons: string[] = [];
    if (!active) {
      // inactive: classify on lifetime performance vs lifetime account baseline
      const lifeRoas = base.spend > 0 ? base.revenue / base.spend : 0;
      if (base.spend < RULES.minTestSpend) { status = "testing"; reasons.push("retired with too little spend to judge"); }
      else if (lifeRoas >= RULES.winnerRoasX * lifetimeBaselineRoas) { status = "winner"; reasons.push(`lifetime ROAS ${lifeRoas.toFixed(2)} ≥ 1.3× account — consider reviving`); }
      else if (base.spend >= RULES.loserNoSaleSpend && base.purchases === 0) { status = "losing"; reasons.push("retired with spend and zero purchases"); }
      else if (lifeRoas < RULES.loserRoasX * lifetimeBaselineRoas) { status = "losing"; reasons.push(`lifetime ROAS ${lifeRoas.toFixed(2)} < half of account`); }
      else reasons.push("inactive");
    } else if (windowSpend < RULES.minTestSpend || daysRunning <= RULES.minTestDays) {
      status = "testing";
      reasons.push(`only ₹${Math.round(windowSpend)} / ${daysRunning}d of signal`);
    } else if (windowSpend >= RULES.loserNoSaleSpend && N(r.window_purchases) === 0) {
      status = "losing"; reasons.push(`₹${Math.round(windowSpend)} spent, zero purchases in ${RULES.windowDays}d`);
    } else if (baselineRoas > 0 && windowSpend >= RULES.winnerSpend && windowRoas < RULES.loserRoasX * baselineRoas) {
      status = "losing"; reasons.push(`ROAS ${windowRoas.toFixed(2)} < half of account ${baselineRoas.toFixed(2)}`);
    } else if (priorRoas > 0 && windowRoas < (1 - RULES.fatigueDrop) * priorRoas && priorSpend >= RULES.minTestSpend) {
      status = "fatiguing"; reasons.push(`ROAS fell ${Math.round((1 - windowRoas / priorRoas) * 100)}% vs prior ${RULES.priorDays}d`);
    } else if (baselineRoas > 0 && windowRoas >= RULES.gemRoasX * baselineRoas && windowSpend < RULES.gemShareMax * winSpendTotal) {
      status = "hidden_gem"; reasons.push(`ROAS ${windowRoas.toFixed(2)} on only ${(100 * windowSpend / winSpendTotal).toFixed(1)}% of spend — scale candidate`);
    } else if (baselineRoas > 0 && windowSpend >= RULES.winnerSpend && windowRoas >= RULES.winnerRoasX * baselineRoas) {
      status = "winner"; reasons.push(`ROAS ${windowRoas.toFixed(2)} ≥ 1.3× account at ₹${Math.round(windowSpend)} scale`);
    }

    return {
      ad_id: String(r.ad_id), ad_name: String(r.ad_name), ad_set: String(r.ad_set),
      campaign: String(r.campaign), format: String(r.format ?? "unknown"),
      launched_on: r.launched_on ? String(r.launched_on) : null,
      first_day: String(r.first_day), last_day: String(r.last_day), days_running: daysRunning, active,
      ...base, frequency: r.frequency == null ? null : N(r.frequency), adds_to_cart: N(r.adds_to_cart),
      window_spend: windowSpend, window_revenue: windowRevenue, window_purchases: N(r.window_purchases),
      prior_spend: priorSpend, prior_revenue: priorRevenue,
      status, status_reasons: reasons, ...derive(base),
      asset_id: linkByAd.get(String(r.ad_id))?.asset_id ?? null,
      asset_filename: linkByAd.get(String(r.ad_id))?.filename ?? null,
      asset_mime: linkByAd.get(String(r.ad_id))?.mime_type ?? null,
      match_type: linkByAd.get(String(r.ad_id))?.match_type ?? null,
    } satisfies CreativeRollup;
  });
}

export async function getCreativeDaily(adId: string) {
  const db = await getDb();
  const rows = await db.query(
    `select day::text as day, spend, impressions, link_clicks as clicks, lp_views, purchases, revenue, frequency
     from fact_ad_daily where ad_id = $1 order by day`, [adId]);
  return rows.map((r) => {
    const base = { spend: N(r.spend), impressions: N(r.impressions), clicks: N(r.clicks),
      lp_views: N(r.lp_views), purchases: N(r.purchases), revenue: N(r.revenue) };
    return { day: String(r.day), frequency: r.frequency == null ? null : N(r.frequency), ...base, ...derive(base) };
  });
}

// ---------- campaigns ----------

export async function getCampaigns(clientId: string, range?: Range) {
  const db = await getDb();
  const params: unknown[] = [clientId];
  let dateFilter = "";
  if (range) { params.push(range.from, range.to); dateFilter = "and u.day between $2 and $3"; }
  const rows = await db.query(
    `select ca.id, ca.name, u.platform, ca.first_seen::text as first_seen, ca.last_seen::text as last_seen,
            sum(u.spend) spend, sum(u.impressions) impressions, sum(u.clicks) clicks,
            sum(u.lp_views) lp_views, sum(u.purchases) purchases, sum(u.revenue) revenue
     from unified_daily u join campaigns ca on ca.id = u.campaign_id
     where u.client_id = $1 ${dateFilter}
     group by ca.id, ca.name, u.platform, ca.first_seen, ca.last_seen
     order by sum(u.spend) desc`, params);
  return rows.map((r) => {
    const base = { spend: N(r.spend), impressions: N(r.impressions), clicks: N(r.clicks),
      lp_views: N(r.lp_views), purchases: N(r.purchases), revenue: N(r.revenue) };
    return { id: String(r.id), name: String(r.name), platform: String(r.platform),
      first_seen: r.first_seen ? String(r.first_seen) : null, last_seen: r.last_seen ? String(r.last_seen) : null,
      ...base, ...derive(base) };
  });
}

export async function getAdSetsForCampaign(campaignId: string) {
  const db = await getDb();
  const rows = await db.query(
    `select s.id, s.name,
            sum(f.spend) spend, sum(f.impressions) impressions, sum(f.link_clicks) clicks,
            sum(f.lp_views) lp_views, sum(f.purchases) purchases, sum(f.revenue) revenue
     from fact_ad_daily f
     join ads a on a.id = f.ad_id
     join ad_sets s on s.id = a.ad_set_id
     where s.campaign_id = $1
     group by s.id, s.name order by sum(f.spend) desc`, [campaignId]);
  return rows.map((r) => {
    const base = { spend: N(r.spend), impressions: N(r.impressions), clicks: N(r.clicks),
      lp_views: N(r.lp_views), purchases: N(r.purchases), revenue: N(r.revenue) };
    return { id: String(r.id), name: String(r.name), ...base, ...derive(base) };
  });
}

// ---------- divisions (Fruits & Veggies vs Groceries) ----------

export type Division = "fruits_veggies" | "groceries";

/**
 * Sheets-era heuristic: divisions are inferred from campaign names (same split
 * the workbook's April block used). A stored override column can come later.
 */
const GROCERY_RE = /grocer|rice|dal\b|atta|flour|\boil\b|ghee|masala|spice|turmeric|jam\b|honey|egg|bread|milk|paneer|snack|staple|pulse|millet|high aov/i;

export function inferDivision(campaignName: string): Division {
  return GROCERY_RE.test(campaignName) ? "groceries" : "fruits_veggies";
}

export interface DivisionRollup {
  division: Division;
  spend: number; impressions: number; clicks: number; lp_views: number;
  purchases: number; revenue: number;
  campaigns: number;
  ltv: number | null;                 // placeholder until client provides
  roas: number; cpa: number; aov: number; cpm: number; cpc: number; ctr: number; cplpv: number; cvr: number;
}

export interface CampaignHighlight {
  id: string; name: string; platform: string; division: Division;
  spend: number; revenue: number; purchases: number; roas: number; cpa: number;
}

/** Months with any data, newest first (YYYY-MM-01). */
export async function getMonths(clientId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.query<{ m: string }>(
    `select distinct to_char(date_trunc('month', day), 'YYYY-MM-01') as m
     from unified_daily where client_id = $1 order by m desc`, [clientId]);
  return rows.map((r) => String(r.m));
}

export async function getDivisionOverview(clientId: string, month?: string, range?: Range) {
  const db = await getDb();
  const today = await latestDay(clientId);
  const monthStart = range?.from ?? month ?? today.slice(0, 8) + "01";
  const monthEndDate = new Date(Date.UTC(
    Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0));
  const monthEnd = range?.to ?? monthEndDate.toISOString().slice(0, 10);
  const rangeEnd = monthEnd < today ? monthEnd : today;   // past month = full month
  const isPartial = rangeEnd === today &&
    (range ? range.to >= today : monthStart === today.slice(0, 8) + "01");
  const campaigns = await getCampaigns(clientId, { from: monthStart, to: rangeEnd });

  // per-division aggregates
  const agg = new Map<Division, { spend: number; impressions: number; clicks: number; lp_views: number; purchases: number; revenue: number; campaigns: number }>();
  for (const dv of ["fruits_veggies", "groceries"] as Division[]) {
    agg.set(dv, { spend: 0, impressions: 0, clicks: 0, lp_views: 0, purchases: 0, revenue: 0, campaigns: 0 });
  }
  for (const c of campaigns) {
    const a = agg.get(inferDivision(c.name))!;
    a.spend += c.spend; a.impressions += c.impressions; a.clicks += c.clicks;
    a.lp_views += c.lp_views; a.purchases += c.purchases; a.revenue += c.revenue;
    a.campaigns += 1;
  }

  // manual inputs: offline revenue, division LTV placeholders, Shopify store
  // total. In range mode, additive metrics are summed over the covered months.
  const manual = await db.query<{ metric: string; value: number }>(
    range
      ? `select metric, sum(value) as value from manual_actuals
         where client_id = $1 and month between $2 and $3
           and metric in ('offline_revenue','total_revenue')
         group by metric`
      : `select metric, value from manual_actuals
         where client_id = $1 and month = $2
           and metric in ('offline_revenue','ltv_fruits_veggies','ltv_groceries','total_revenue')`,
    range ? [clientId, range.from, range.to] : [clientId, monthStart]);
  const manualMap = new Map(manual.map((m) => [String(m.metric), Number(m.value)]));

  const divisions: DivisionRollup[] = (["fruits_veggies", "groceries"] as Division[]).map((dv) => {
    const a = agg.get(dv)!;
    return {
      division: dv, ...a,
      ltv: manualMap.get(`ltv_${dv}`) ?? null,
      ...derive(a),
    };
  });

  // hero / loser campaigns (MTD, spend floor so tiny tests don't win/lose)
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const floor = Math.max(5000, totalSpend * 0.03);
  const eligible = campaigns.filter((c) => c.spend >= floor);
  const byRoas = [...eligible].sort((a, b) => b.roas - a.roas);
  const toHighlight = (c: (typeof campaigns)[number] | undefined): CampaignHighlight | null =>
    c ? { id: c.id, name: c.name, platform: c.platform, division: inferDivision(c.name),
          spend: c.spend, revenue: c.revenue, purchases: c.purchases, roas: c.roas, cpa: c.cpa } : null;
  const hero = toHighlight(byRoas[0]);
  const loser = toHighlight(byRoas.length > 1 ? byRoas[byRoas.length - 1] : undefined);

  // Online = Shopify store total when the month has one (complete months);
  // otherwise tracked paid-attributed revenue.
  const storeTotal = manualMap.get("total_revenue") ?? null;
  const trackedRevenue = divisions.reduce((s, d) => s + d.revenue, 0);

  return {
    month: monthStart,
    asOf: today,
    isPartial,
    onlineRevenueMtd: storeTotal ?? trackedRevenue,
    onlineIsTracked: storeTotal == null,
    offlineRevenue: manualMap.get("offline_revenue") ?? null,
    divisions,
    hero,
    loser,
    spendFloor: floor,
  };
}

/** Per-division monthly trend (classified in TS from campaign names). */
export async function getDivisionMonthly(clientId: string) {
  const db = await getDb();
  const rows = await db.query<{ month: string; name: string; spend: number; purchases: number; revenue: number }>(
    `select to_char(date_trunc('month', u.day), 'YYYY-MM-01') as month, c.name,
            sum(u.spend) spend, sum(u.purchases) purchases, sum(u.revenue) revenue
     from unified_daily u join campaigns c on c.id = u.campaign_id
     where u.client_id = $1 group by 1, 2 order by 1`, [clientId]);
  const byMonth = new Map<string, Record<Division, { spend: number; purchases: number; revenue: number }>>();
  for (const r of rows) {
    const m = String(r.month);
    if (!byMonth.has(m)) byMonth.set(m, {
      fruits_veggies: { spend: 0, purchases: 0, revenue: 0 },
      groceries: { spend: 0, purchases: 0, revenue: 0 },
    });
    const slot = byMonth.get(m)![inferDivision(String(r.name))];
    slot.spend += Number(r.spend ?? 0);
    slot.purchases += Number(r.purchases ?? 0);
    slot.revenue += Number(r.revenue ?? 0);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, ...d }));
}

/**
 * Manual Google monthlies (Dec 2025 – Apr 2026 have no daily Google rows;
 * their platform numbers were recorded as monthly manual inputs).
 */
export async function getManualGoogleMonth(clientId: string, month: string) {
  const db = await getDb();
  const rows = await db.query<{ metric: string; value: number }>(
    `select metric, value from manual_actuals
     where client_id = $1 and month = $2 and metric in ('google_spend','google_purchases','google_revenue')`,
    [clientId, month]);
  if (!rows.length) return null;
  const m = new Map(rows.map((r) => [String(r.metric), Number(r.value)]));
  return {
    spend: m.get("google_spend") ?? 0,
    purchases: m.get("google_purchases") ?? 0,
    revenue: m.get("google_revenue") ?? 0,
  };
}

/**
 * Monthly name-level rollups (campaign + ad names preserved) across all
 * history — Meta at ad grain, Google at campaign grain. Feeds the seasonal
 * produce classifier.
 */
export async function getMonthlyNameRollups(clientId: string) {
  const db = await getDb();
  const meta = await db.query(
    `select to_char(date_trunc('month', f.day), 'YYYY-MM-01') as month,
            ca.name as campaign, a.name as ad,
            sum(f.spend) spend, sum(f.revenue) revenue, sum(f.purchases) purchases
     from fact_ad_daily f
     join ads a on a.id = f.ad_id
     join ad_sets s on s.id = a.ad_set_id
     join campaigns ca on ca.id = s.campaign_id
     join ad_accounts aa on aa.id = ca.ad_account_id
     where aa.client_id = $1
     group by 1, ca.name, a.name`, [clientId]);
  const google = await db.query(
    `select to_char(date_trunc('month', f.day), 'YYYY-MM-01') as month,
            ca.name as campaign, null as ad,
            sum(f.spend) spend, sum(f.conv_value) revenue, sum(f.conversions) purchases
     from fact_campaign_daily f
     join campaigns ca on ca.id = f.campaign_id
     join ad_accounts aa on aa.id = ca.ad_account_id
     where aa.client_id = $1
     group by 1, ca.name`, [clientId]);
  return [...meta, ...google].map((r) => ({
    month: String(r.month), campaign: String(r.campaign), ad: r.ad ? String(r.ad) : null,
    spend: N(r.spend), revenue: N(r.revenue), purchases: N(r.purchases),
  }));
}

/** Per-ad rollup for an arbitrary range (Meta facts) — used by month-scoped insights. */
export async function getAdRangeRollups(clientId: string, range: Range) {
  const db = await getDb();
  const rows = await db.query(
    `select a.id as ad_id, a.name as ad_name, ca.name as campaign,
            sum(f.spend) spend, sum(f.revenue) revenue, sum(f.purchases) purchases
     from fact_ad_daily f
     join ads a on a.id = f.ad_id
     join ad_sets s on s.id = a.ad_set_id
     join campaigns ca on ca.id = s.campaign_id
     join ad_accounts aa on aa.id = ca.ad_account_id
     where aa.client_id = $1 and f.day between $2 and $3
     group by a.id, a.name, ca.name
     having sum(f.spend) > 0
     order by sum(f.spend) desc`, [clientId, range.from, range.to]);
  return rows.map((r) => ({
    ad_id: String(r.ad_id), ad_name: String(r.ad_name), campaign: String(r.campaign),
    spend: N(r.spend), revenue: N(r.revenue), purchases: N(r.purchases),
  }));
}

// ---------- funnel ----------

export interface FunnelStage { key: string; label: string; value: number }

/**
 * Conversion funnel from Meta ad-level facts (Google's export has no
 * stage-level data, so the funnel is Meta-only and labeled as such).
 * Optional filters: single campaign, or a division (classified by name).
 */
export async function getFunnel(clientId: string, range: Range, filter?: {
  campaignId?: string; division?: Division;
}): Promise<{ stages: FunnelStage[]; spend: number; revenue: number }> {
  const db = await getDb();
  const params: unknown[] = [clientId, range.from, range.to];
  let campaignFilter = "";
  if (filter?.campaignId) { params.push(filter.campaignId); campaignFilter = `and ca.id = $4`; }
  const rows = await db.query<{ name: string; impressions: number; clicks: number; lp: number; atc: number; pay: number; purchases: number; spend: number; revenue: number }>(
    `select ca.name,
            sum(f.impressions) impressions, sum(f.link_clicks) clicks, sum(f.lp_views) lp,
            sum(f.adds_to_cart) atc, sum(f.payment_info) pay, sum(f.purchases) purchases,
            sum(f.spend) spend, sum(f.revenue) revenue
     from fact_ad_daily f
     join ads a on a.id = f.ad_id
     join ad_sets s on s.id = a.ad_set_id
     join campaigns ca on ca.id = s.campaign_id
     join ad_accounts aa on aa.id = ca.ad_account_id
     where aa.client_id = $1 and f.day between $2 and $3 ${campaignFilter}
     group by ca.name`, params);
  const filtered = filter?.division
    ? rows.filter((r) => inferDivision(String(r.name)) === filter.division)
    : rows;
  const sum = (k: keyof (typeof rows)[number]) => filtered.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return {
    spend: sum("spend"),
    revenue: sum("revenue"),
    stages: [
      { key: "impressions", label: "Impressions", value: sum("impressions") },
      { key: "clicks", label: "Link clicks", value: sum("clicks") },
      { key: "lp_views", label: "LP views", value: sum("lp") },
      { key: "atc", label: "Add to cart", value: sum("atc") },
      { key: "payment", label: "Payment", value: sum("pay") },
      { key: "purchases", label: "Purchases", value: sum("purchases") },
    ],
  };
}

/** Daily blended totals for heatmaps (trailing N days). */
export async function getDailyBlended(clientId: string, days = 91) {
  const db = await getDb();
  const rows = await db.query<{ day: string; spend: number; revenue: number; purchases: number }>(
    `select day::text as day, sum(spend) spend, sum(revenue) revenue, sum(purchases) purchases
     from unified_daily where client_id = $1
     group by day order by day desc limit $2`, [clientId, days]);
  return rows.reverse().map((r) => ({
    day: String(r.day), spend: N(r.spend), revenue: N(r.revenue), purchases: N(r.purchases),
    roas: N(r.spend) > 0 ? N(r.revenue) / N(r.spend) : 0,
  }));
}

export async function getCampaignById(campaignId: string) {
  const db = await getDb();
  const [row] = await db.query<{ id: string; name: string; platform: string; first_seen: string | null; last_seen: string | null }>(
    `select ca.id, ca.name, aa.platform, ca.first_seen::text as first_seen, ca.last_seen::text as last_seen
     from campaigns ca join ad_accounts aa on aa.id = ca.ad_account_id
     where ca.id = $1`, [campaignId]);
  return row ?? null;
}

export async function getCampaignDaily(campaignId: string) {
  const db = await getDb();
  const rows = await db.query(
    `select day::text as period, platform, spend, impressions, clicks, lp_views, purchases, revenue
     from unified_daily where campaign_id = $1 order by day`, [campaignId]);
  return rows.map((r) => {
    const base = { spend: N(r.spend), impressions: N(r.impressions), clicks: N(r.clicks),
      lp_views: N(r.lp_views), purchases: N(r.purchases), revenue: N(r.revenue) };
    return { period: String(r.period), platform: String(r.platform), ...base, ...derive(base) };
  });
}

export async function getAdsForCampaign(campaignId: string) {
  const db = await getDb();
  const rows = await db.query(
    `select a.id, a.name, a.format, s.name as ad_set,
            min(f.day)::text as first_day, max(f.day)::text as last_day,
            sum(f.spend) spend, sum(f.impressions) impressions, sum(f.link_clicks) clicks,
            sum(f.lp_views) lp_views, sum(f.purchases) purchases, sum(f.revenue) revenue
     from fact_ad_daily f
     join ads a on a.id = f.ad_id
     join ad_sets s on s.id = a.ad_set_id
     where s.campaign_id = $1
     group by a.id, a.name, a.format, s.name
     order by sum(f.spend) desc`, [campaignId]);
  return rows.map((r) => {
    const base = { spend: N(r.spend), impressions: N(r.impressions), clicks: N(r.clicks),
      lp_views: N(r.lp_views), purchases: N(r.purchases), revenue: N(r.revenue) };
    return { id: String(r.id), name: String(r.name), format: String(r.format ?? "unknown"),
      ad_set: String(r.ad_set), first_day: String(r.first_day), last_day: String(r.last_day),
      ...base, ...derive(base) };
  });
}

// ---------- customer economics ----------

export interface CustomerMonth {
  month: string;                    // YYYY-MM-01
  hasData: boolean;                 // client provided new/returning counts
  newCustomers: number | null;
  returningCustomers: number | null;
  totalOrders: number | null;
  totalRevenue: number | null;
  paidSpend: number;                // Meta + Google (incl. manual Google months)
  // derived (null when hasData is false)
  repeatRate: number | null;        // returning / (new + returning)
  aov: number | null;               // totalRevenue / totalOrders
  cacNew: number | null;            // paidSpend / newCustomers — the REAL acquisition cost
  ltv: number | null;               // AOV / (1 - repeatRate)  (geometric repeat model)
  ltvCac: number | null;            // ltv / cacNew
  // real order-level stats (Shopify export) — null until ingested
  newAov: number | null;
  repeatAov: number | null;
}

/**
 * Customer economics per month, derived from client-provided monthly
 * new/returning counts + Shopify totals + paid spend.
 * LTV model: expected orders per customer = 1/(1−r) where r = repeat rate,
 * so LTV = AOV ÷ (1−r). Standard, explainable, assumption-light.
 */
export async function getCustomerEconomics(clientId: string): Promise<CustomerMonth[]> {
  const db = await getDb();
  const months = await getMonths(clientId);           // desc
  const manual = await db.query<{ month: string; metric: string; value: number }>(
    `select month::text as month, metric, value from manual_actuals where client_id = $1`, [clientId]);
  const byMonth = new Map<string, Map<string, number>>();
  for (const r of manual) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, new Map());
    byMonth.get(r.month)!.set(String(r.metric), Number(r.value));
  }
  const spendRows = await db.query<{ month: string; spend: number }>(
    `select to_char(date_trunc('month', day), 'YYYY-MM-01') as month, sum(spend) spend
     from unified_daily where client_id = $1 group by 1`, [clientId]);
  const spendBy = new Map(spendRows.map((r) => [String(r.month), N(r.spend)]));
  const shopify = await getShopifyCustomerStats(clientId);
  const shopifyByMonth = new Map((shopify?.byMonth ?? []).map((s) => [s.month, s]));

  return [...months].sort().map((month) => {
    const mm = byMonth.get(month) ?? new Map<string, number>();
    const realAov = shopifyByMonth.get(month);
    let paidSpend = spendBy.get(month) ?? 0;
    // months without daily Google rows carry manual google_spend
    if (mm.has("google_spend")) paidSpend += mm.get("google_spend")!;
    const newC = mm.get("new_customers") ?? null;
    const retC = mm.get("returning_customers") ?? null;
    const totalOrders = mm.get("total_orders") ?? null;
    const totalRevenue = mm.get("total_revenue") ?? null;
    const hasData = newC != null && retC != null && totalOrders != null && totalRevenue != null;
    if (!hasData) {
      return { month, hasData, newCustomers: newC, returningCustomers: retC,
        totalOrders, totalRevenue, paidSpend,
        repeatRate: null, aov: null, cacNew: null, ltv: null, ltvCac: null,
        newAov: realAov?.newAov ?? null, repeatAov: realAov?.repeatAov ?? null };
    }
    const customers = newC! + retC!;
    const repeatRate = customers > 0 ? retC! / customers : 0;
    const aov = totalOrders! > 0 ? totalRevenue! / totalOrders! : 0;
    const cacNew = newC! > 0 ? paidSpend / newC! : null;
    const ltv = repeatRate < 1 ? aov / (1 - repeatRate) : null;
    const ltvCac = ltv != null && cacNew != null && cacNew > 0 ? ltv / cacNew : null;
    return { month, hasData, newCustomers: newC, returningCustomers: retC,
      totalOrders, totalRevenue, paidSpend, repeatRate, aov, cacNew, ltv, ltvCac,
      newAov: realAov?.newAov ?? null, repeatAov: realAov?.repeatAov ?? null };
  });
}

/** Measured (right-censored) lifetime revenue-to-date per customer, from order-level data. */
export async function getMeasuredLtv(clientId: string) {
  const s = await getShopifyCustomerStats(clientId);
  return s ? { ltv: s.ltvMeasured, customers: s.customers, orders: s.orders } : null;
}

// ---------- goals, pacing & forecast ----------

export interface PacingMetric {
  metric: "spend" | "revenue" | "orders";
  actualMtd: number;
  goal: number;
  goalIsDefault: boolean;      // true = auto (+25% over last month), not set by a human
  expectedByToday: number;     // goal * elapsed/daysInMonth
  paceRatio: number;           // actualMtd / expectedByToday
  projected: number;           // MTD + trailing-7d daily runrate * remaining days
  daysElapsed: number;
  daysInMonth: number;
}

/**
 * Month pacing à la Triple Whale: where the month lands if the trailing-7-day
 * run rate holds, vs the goal (explicit, or +25% MoM default when unset).
 */
export async function getPacing(clientId: string): Promise<{ asOf: string; metrics: PacingMetric[] }> {
  const db = await getDb();
  const today = await latestDay(clientId);
  const d = new Date(today + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const monthStart = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const prevMonthStart = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
  const prevMonthEnd = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)));
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = d.getUTCDate();
  const trailing7From = iso(new Date(d.getTime() - 6 * 86400000));

  const [mtdRows, prevRows, trailRows, goalRows] = await Promise.all([
    totalsBetween(clientId, { from: monthStart, to: today }),
    totalsBetween(clientId, { from: prevMonthStart, to: prevMonthEnd }),
    totalsBetween(clientId, { from: trailing7From, to: today }),
    db.query<{ metric: string; target: number }>(
      `select metric, target from goals where client_id = $1 and month = $2`,
      [clientId, monthStart]),
  ]);
  const mtd = sumPlatforms(mtdRows);
  const prev = sumPlatforms(prevRows);
  const trail = sumPlatforms(trailRows);
  const goalMap = new Map(goalRows.map((g) => [String(g.metric), Number(g.target)]));

  const build = (metric: "spend" | "revenue" | "orders", actual: number, prevTotal: number, trail7: number): PacingMetric => {
    const explicit = goalMap.get(metric);
    const goal = explicit ?? prevTotal * 1.25;
    const expectedByToday = goal * (daysElapsed / daysInMonth);
    const projected = actual + (trail7 / 7) * (daysInMonth - daysElapsed);
    return {
      metric, actualMtd: actual, goal, goalIsDefault: explicit == null,
      expectedByToday, paceRatio: expectedByToday > 0 ? actual / expectedByToday : 0,
      projected, daysElapsed, daysInMonth,
    };
  };

  return {
    asOf: today,
    metrics: [
      build("revenue", mtd.revenue, prev.revenue, trail.revenue),
      build("spend", mtd.spend, prev.spend, trail.spend),
      build("orders", mtd.purchases, prev.purchases, trail.purchases),
    ],
  };
}

export async function setGoal(clientId: string, month: string, metric: string, target: number) {
  const db = await getDb();
  await db.query(
    `insert into goals (client_id, month, metric, target) values ($1,$2,$3,$4)
     on conflict (client_id, month, metric) do update set target = excluded.target, updated_at = now()`,
    [clientId, month, metric, target]);
}

export async function getGoals(clientId: string, month: string) {
  const db = await getDb();
  return db.query<{ metric: string; target: number }>(
    `select metric, target from goals where client_id = $1 and month = $2`, [clientId, month]);
}

// ---------- platforms & monthly report ----------

export async function getMonthlyReport(clientId: string) {
  const db = await getDb();
  // platform monthlies from facts
  const rows = await db.query(
    `select to_char(date_trunc('month', day), 'YYYY-MM-01') as month, platform,
            sum(spend) spend, sum(purchases) purchases, sum(revenue) revenue
     from unified_daily where client_id = $1 group by 1, 2 order by 1`, [clientId]);
  // manual actuals (Shopify totals, pre-May Google, customer splits)
  const manual = await db.query(
    `select month::text as month, metric, value from manual_actuals where client_id = $1`, [clientId]);

  const months = new Map<string, { meta: { spend: number; purchases: number; revenue: number };
    google: { spend: number; purchases: number; revenue: number };
    total_orders?: number; total_revenue?: number; new_customers?: number; returning_customers?: number }>();
  const ensure = (m: string) => {
    if (!months.has(m)) months.set(m, { meta: { spend: 0, purchases: 0, revenue: 0 }, google: { spend: 0, purchases: 0, revenue: 0 } });
    return months.get(m)!;
  };
  for (const r of rows) {
    const m = ensure(String(r.month));
    const t = String(r.platform) === "meta" ? m.meta : m.google;
    t.spend += N(r.spend); t.purchases += N(r.purchases); t.revenue += N(r.revenue);
  }
  for (const r of manual) {
    const m = ensure(String(r.month));
    const v = N(r.value);
    switch (String(r.metric)) {
      case "google_spend": m.google.spend += v; break;      // months with no daily Google data
      case "google_purchases": m.google.purchases += v; break;
      case "google_revenue": m.google.revenue += v; break;
      case "total_orders": m.total_orders = v; break;
      case "total_revenue": m.total_revenue = v; break;
      case "new_customers": m.new_customers = v; break;
      case "returning_customers": m.returning_customers = v; break;
    }
  }
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, m]) => {
    const paidSpend = m.meta.spend + m.google.spend;
    const paidRevenue = m.meta.revenue + m.google.revenue;
    const paidPurchases = m.meta.purchases + m.google.purchases;
    const organicRevenue = m.total_revenue != null ? m.total_revenue - paidRevenue : null;
    const organicOrders = m.total_orders != null ? m.total_orders - paidPurchases : null;
    return {
      month, meta: m.meta, google: m.google,
      totalOrders: m.total_orders ?? null, totalRevenue: m.total_revenue ?? null,
      organicRevenue, organicOrders,
      newCustomers: m.new_customers ?? null, returningCustomers: m.returning_customers ?? null,
      spend: paidSpend,
      blendedRoas: m.total_revenue != null && paidSpend > 0 ? m.total_revenue / paidSpend : (paidSpend > 0 ? paidRevenue / paidSpend : 0),
      paidRoas: paidSpend > 0 ? paidRevenue / paidSpend : 0,
      cac: m.total_orders != null && m.total_orders > 0 ? paidSpend / m.total_orders : null,
      aov: m.total_orders ? (m.total_revenue ?? 0) / m.total_orders : null,
    };
  });
}
