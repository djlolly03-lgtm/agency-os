/**
 * Forensic audit: recompute every dashboard figure independently from the
 * database and print them with their derivations, so the UI can be diffed
 * against ground truth. Run: npx tsx scripts/audit-numbers.ts
 */
import { getDb } from "../src/lib/db";

const fmt = (v: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(v));
const L = (v: number) => `₹${(v / 1_00_000).toFixed(1)}L`;

async function main() {
  const db = await getDb();
  const [client] = await db.query<{ id: string }>(`select id from clients where slug = 'organik-truck'`);
  const cid = client.id;

  const latest = (await db.query<{ d: string }>(
    `select max(day)::text as d from unified_daily where client_id = $1`, [cid]))[0].d;
  console.log(`\n=== GROUND TRUTH AUDIT · latest data day: ${latest} ===`);

  for (const [label, from, to, prevFrom, prevTo] of [
    ["JUL 2026 (MTD)", "2026-07-01", latest, "2026-06-01", "2026-06-27"],
    ["APR 2026 (complete)", "2026-04-01", "2026-04-30", "2026-03-01", "2026-03-31"],
    ["NOV 2025 (complete)", "2025-11-01", "2025-11-30", "", ""],
  ] as const) {
    console.log(`\n--- ${label} ---`);
    const rows = await db.query<{ platform: string; spend: number; revenue: number; purchases: number; clicks: number; impressions: number; lp: number }>(
      `select platform, sum(spend) spend, sum(revenue) revenue, sum(purchases) purchases,
              sum(clicks) clicks, sum(impressions) impressions, sum(lp_views) lp
       from unified_daily where client_id = $1 and day between $2 and $3 group by platform order by platform desc`,
      [cid, from, to]);
    const manual = await db.query<{ metric: string; value: number }>(
      `select metric, value from manual_actuals where client_id = $1 and month = $2`, [cid, from]);
    const mm = new Map(manual.map((r) => [String(r.metric), Number(r.value)]));
    const hasGoogleDaily = rows.some((r) => r.platform === "google");

    let spend = 0, revenue = 0, purchases = 0, clicks = 0, impressions = 0, lp = 0;
    for (const r of rows) {
      spend += Number(r.spend); revenue += Number(r.revenue); purchases += Number(r.purchases);
      clicks += Number(r.clicks); impressions += Number(r.impressions); lp += Number(r.lp);
    }
    if (!hasGoogleDaily && mm.has("google_spend")) {
      spend += mm.get("google_spend")!; revenue += mm.get("google_revenue") ?? 0; purchases += mm.get("google_purchases") ?? 0;
      console.log(`  [manual google folded: spend ${fmt(mm.get("google_spend")!)} rev ${fmt(mm.get("google_revenue") ?? 0)} orders ${mm.get("google_purchases")}]`);
    }
    console.log(`  HERO paid revenue: ${L(revenue)} (${fmt(revenue)})  | orders ${fmt(purchases)} | AOV ₹${fmt(revenue / purchases)}`);
    console.log(`  HERO ROAS: ${(revenue / spend).toFixed(2)}×  | CPA ₹${fmt(spend / purchases)} | CTR ${((100 * clicks) / impressions).toFixed(1)}% (tracked-only ctr)`);
    console.log(`  HERO spend: ${L(spend)} (${fmt(spend)})`);
    for (const r of rows) {
      console.log(`    ${r.platform}: spend ${fmt(Number(r.spend))} rev ${fmt(Number(r.revenue))} roas ${(Number(r.revenue) / Number(r.spend)).toFixed(2)} share ${((100 * Number(r.spend)) / spend).toFixed(0)}%`);
    }
    if (!hasGoogleDaily && mm.has("google_spend")) {
      console.log(`    google(manual): spend ${fmt(mm.get("google_spend")!)} share ${((100 * mm.get("google_spend")!) / spend).toFixed(0)}%`);
    }
    if (mm.has("total_revenue")) console.log(`  STORE total revenue: ${L(mm.get("total_revenue")!)} | orders ${mm.get("total_orders")} | organic rev = ${fmt(mm.get("total_revenue")! - revenue)}`);

    // funnel (Meta only)
    const [f] = await db.query<{ imp: number; clk: number; lp: number; atc: number; pay: number; pur: number; spend: number; rev: number }>(
      `select sum(f.impressions) imp, sum(f.link_clicks) clk, sum(f.lp_views) lp, sum(f.adds_to_cart) atc,
              sum(f.payment_info) pay, sum(f.purchases) pur, sum(f.spend) spend, sum(f.revenue) rev
       from fact_ad_daily f join ads a on a.id=f.ad_id join ad_sets s on s.id=a.ad_set_id
       join campaigns ca on ca.id=s.campaign_id join ad_accounts aa on aa.id=ca.ad_account_id
       where aa.client_id = $1 and f.day between $2 and $3`, [cid, from, to]);
    console.log(`  FUNNEL(meta): ${fmt(Number(f.imp))} imp → ${fmt(Number(f.clk))} clk (${((100 * Number(f.clk)) / Number(f.imp)).toFixed(1)}%) → ${fmt(Number(f.lp))} lpv (${((100 * Number(f.lp)) / Number(f.clk)).toFixed(1)}%) → ${fmt(Number(f.atc))} atc (${((100 * Number(f.atc)) / Number(f.lp)).toFixed(1)}%) → ${fmt(Number(f.pay))} pay (${((100 * Number(f.pay)) / Number(f.atc)).toFixed(1)}%) → ${fmt(Number(f.pur))} pur (${((100 * Number(f.pur)) / Number(f.pay)).toFixed(1)}%)`);
    console.log(`  FUNNEL footer: ${L(Number(f.spend))} in → ${L(Number(f.rev))} out · ${(Number(f.rev) / Number(f.spend)).toFixed(2)}×`);

    // divisions (tracked campaigns classified by name)
    const drows = await db.query<{ name: string; spend: number; revenue: number; purchases: number; clicks: number; impressions: number }>(
      `select c.name, sum(u.spend) spend, sum(u.revenue) revenue, sum(u.purchases) purchases,
              sum(u.clicks) clicks, sum(u.impressions) impressions
       from unified_daily u join campaigns c on c.id = u.campaign_id
       where u.client_id = $1 and u.day between $2 and $3 group by c.name`, [cid, from, to]);
    const GR = /grocer|rice|dal\b|atta|flour|\boil\b|ghee|masala|spice|turmeric|jam\b|honey|egg|bread|milk|paneer|snack|staple|pulse|millet|high aov/i;
    const agg = { fv: { s: 0, r: 0, p: 0, c: 0, i: 0, n: 0 }, gr: { s: 0, r: 0, p: 0, c: 0, i: 0, n: 0 } };
    for (const d of drows) {
      const t = GR.test(String(d.name)) ? agg.gr : agg.fv;
      t.s += Number(d.spend); t.r += Number(d.revenue); t.p += Number(d.purchases);
      t.c += Number(d.clicks); t.i += Number(d.impressions); t.n += 1;
    }
    for (const [k, t] of Object.entries(agg)) {
      console.log(`  DIVISION ${k}: ${t.n} campaigns | spend ${fmt(t.s)} (${((100 * t.s) / (agg.fv.s + agg.gr.s)).toFixed(0)}%) | rev ${fmt(t.r)} (${((100 * t.r) / (agg.fv.r + agg.gr.r)).toFixed(0)}%) | roas ${(t.r / t.s).toFixed(2)} | cac ₹${fmt(t.s / t.p)} | aov ₹${fmt(t.r / t.p)} | orders ${fmt(t.p)} | ctr ${((100 * t.c) / t.i).toFixed(1)}% | cpm ₹${fmt((1000 * t.s) / t.i)}`);
    }

    // hero / loser campaigns (spend floor max(5000, 3% of tracked spend))
    const trackedSpend = drows.reduce((s, d) => s + Number(d.spend), 0);
    const floor = Math.max(5000, trackedSpend * 0.03);
    const eligible = drows.filter((d) => Number(d.spend) >= floor)
      .map((d) => ({ name: String(d.name), roas: Number(d.revenue) / Number(d.spend), spend: Number(d.spend) }))
      .sort((a, b) => b.roas - a.roas);
    if (eligible.length) {
      console.log(`  HERO campaign (floor ₹${fmt(floor)}): ${eligible[0].name.slice(0, 45)} @ ${eligible[0].roas.toFixed(2)}×`);
      console.log(`  LOSER campaign: ${eligible[eligible.length - 1].name.slice(0, 45)} @ ${eligible[eligible.length - 1].roas.toFixed(2)}×`);
    }

    // CPA trend: last 5 data days vs prior 5 within range
    const days = await db.query<{ day: string; spend: number; purchases: number }>(
      `select day::text as day, sum(spend) spend, sum(purchases) purchases
       from unified_daily where client_id = $1 and day between $2 and $3 group by day order by day`, [cid, from, to]);
    if (days.length >= 10) {
      const r5 = days.slice(-5), p5 = days.slice(-10, -5);
      const cpa = (xs: typeof days) => xs.reduce((a, x) => a + Number(x.spend), 0) / xs.reduce((a, x) => a + Number(x.purchases), 0);
      console.log(`  CPA TREND: recent5 ₹${fmt(cpa(r5))} vs prior5 ₹${fmt(cpa(p5))} → ${(((cpa(r5) / cpa(p5)) - 1) * 100).toFixed(0)}%`);
    }

    // prev-month comparison basis (deltas)
    if (prevFrom) {
      const prows = await db.query<{ spend: number; revenue: number }>(
        `select sum(spend) spend, sum(revenue) revenue from unified_daily
         where client_id = $1 and day between $2 and $3`, [cid, prevFrom, prevTo]);
      let ps = Number(prows[0].spend), pr = Number(prows[0].revenue);
      const pHasGoogle = (await db.query<{ n: string }>(
        `select count(*) as n from unified_daily where client_id=$1 and platform='google' and day between $2 and $3`,
        [cid, prevFrom, prevTo]))[0];
      if (Number(pHasGoogle.n) === 0) {
        const pm = await db.query<{ metric: string; value: number }>(
          `select metric, value from manual_actuals where client_id = $1 and month = $2 and metric in ('google_spend','google_revenue')`,
          [cid, prevFrom]);
        for (const x of pm) { if (x.metric === "google_spend") ps += Number(x.value); else pr += Number(x.value); }
      }
      console.log(`  DELTA basis (${prevFrom}→${prevTo}): prev rev ${fmt(pr)} → Δrev ${(((revenue / pr) - 1) * 100).toFixed(0)}% | prev roas ${(pr / ps).toFixed(2)} → Δroas ${((((revenue / spend) / (pr / ps)) - 1) * 100).toFixed(0)}%`);
    }
  }

  // latest-day KPIs
  const [kd] = await db.query<{ d1: number; d2: number }>(
    `select (select sum(spend) from unified_daily where client_id=$1 and day=$2) d1,
            (select sum(spend) from unified_daily where client_id=$1 and day=($2::date - 1)) d2`, [cid, latest]);
  console.log(`\nLATEST DAY spend: ₹${fmt(Number(kd.d1))} vs prev ₹${fmt(Number(kd.d2))} → ${(((Number(kd.d1) / Number(kd.d2)) - 1) * 100).toFixed(0)}%`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
