import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, getCampaignById, getCampaignDaily, getAdsForCampaign,
  getAdSetsForCampaign, getFunnel, inferDivision, latestDay,
} from "@/lib/queries";
import { inr, inrCompact, num, ratio, pct, dayLabel } from "@/lib/format";
import { Funnel } from "@/components/funnel";
import { FadeIn } from "@/components/motion";
import { CreativeDailyChart } from "@/components/creative-daily-chart";
import { DIVISION_LABEL } from "@/components/division-section";
import { DataTrail } from "@/components/data-trail";
import { classifyProduce, inSeason, atPeak, seasonLabel } from "@/lib/seasons";

/** Campaign drill-down: KPIs → funnel → daily trend → ad sets → ads. */
export default async function CampaignDetail({ params }: {
  params: Promise<{ client: string; id: string }>;
}) {
  const { client: slug, id } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const today = await latestDay(client.id);
  const [daily, ads, adSets, funnel] = await Promise.all([
    getCampaignDaily(id),
    campaign.platform === "meta" ? getAdsForCampaign(id) : Promise.resolve([]),
    campaign.platform === "meta" ? getAdSetsForCampaign(id) : Promise.resolve([]),
    campaign.platform === "meta"
      ? getFunnel(client.id, { from: "2000-01-01", to: today }, { campaignId: id })
      : Promise.resolve(null),
  ]);

  const totals = daily.reduce((t, d) => ({
    spend: t.spend + d.spend, revenue: t.revenue + d.revenue,
    purchases: t.purchases + d.purchases, clicks: t.clicks + d.clicks,
    impressions: t.impressions + d.impressions,
  }), { spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0 });
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const division = inferDivision(campaign.name);
  const produce = classifyProduce(campaign.name);
  const nowMonth = Number(today.slice(5, 7));

  return (
    <div className="flex flex-col gap-4">
      <DataTrail
        crumbs={[
          { label: "Overview", href: `/${slug}` },
          { label: "Campaigns", href: `/${slug}/campaigns` },
          { label: campaign.name },
        ]}
        source={campaign.platform === "meta"
          ? "Meta daily export · ad-level · Sheets → Supabase"
          : "Google daily export · campaign-level · Sheets → Supabase"}
      />
      <div>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg font-semibold">{campaign.name}</h2>
          {produce && produce.months.length < 12 && (
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={inSeason(produce, nowMonth)
                ? { background: "color-mix(in srgb, var(--status-good) 16%, transparent)", color: "var(--status-good)" }
                : { background: "color-mix(in srgb, var(--status-serious) 16%, transparent)", color: "var(--status-serious)" }}>
              {produce.label} · {inSeason(produce, nowMonth) ? (atPeak(produce, nowMonth) ? "peak season" : "in season") : "out of season"} · {seasonLabel(produce)}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {campaign.platform === "meta" ? "Meta" : "Google"} ·{" "}
          <Link href={`/${slug}/divisions/${division}`} className="underline">{DIVISION_LABEL[division]}</Link>
          {campaign.first_seen && ` · ${dayLabel(campaign.first_seen)} → ${dayLabel(campaign.last_seen ?? campaign.first_seen)}`}
        </p>
      </div>

      <FadeIn>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {([
            ["Spend", inrCompact(totals.spend)],
            ["Revenue", inrCompact(totals.revenue)],
            ["ROAS", `${ratio(roas)}×`],
            ["Orders", num(totals.purchases)],
            ["CPA", totals.purchases > 0 ? inr(totals.spend / totals.purchases) : "—"],
            ["CTR", totals.impressions > 0 ? pct(totals.clicks / totals.impressions) : "—"],
          ] as Array<[string, string]>).map(([label, value]) => (
            <div key={label} className="card p-3">
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
              <div className="mt-0.5 text-base font-semibold tabular">{value}</div>
            </div>
          ))}
        </div>
      </FadeIn>

      {funnel && funnel.stages[0].value > 0 && (
        <FadeIn>
          <div className="canvas-dark p-6">
            <Funnel stages={funnel.stages} title="Conversion funnel — lifetime"
              subtitle="Meta attribution"
              footer={`Meta flow: ${inrCompact(funnel.spend)} in → ${inrCompact(funnel.revenue)} out · ${(funnel.spend > 0 ? funnel.revenue / funnel.spend : 0).toFixed(2)}× ROAS on this funnel`} />
          </div>
        </FadeIn>
      )}

      <FadeIn>
        <CreativeDailyChart rows={daily.map((d) => ({ day: d.period, spend: d.spend, revenue: d.revenue, roas: d.roas }))} />
      </FadeIn>

      {adSets.length > 1 && (
        <FadeIn>
          <div className="card p-5">
            <h3 className="mb-2 text-sm font-semibold">Ad sets</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                    {["Ad set", "Spend", "Orders", "Revenue", "ROAS", "CTR"].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adSets.map((s) => (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2">{inrCompact(s.spend)}</td>
                      <td className="px-3 py-2">{num(s.purchases)}</td>
                      <td className="px-3 py-2">{inrCompact(s.revenue)}</td>
                      <td className="px-3 py-2 font-medium">{ratio(s.roas)}</td>
                      <td className="px-3 py-2">{pct(s.ctr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FadeIn>
      )}

      {ads.length > 0 && (
        <FadeIn>
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold">Creatives in this campaign</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ads.map((a) => (
                <Link key={a.id} href={`/${slug}/creatives/${a.id}`}
                  className="card card-lift block p-4">
                  <div className="line-clamp-2 text-sm font-medium">{a.name}</div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {a.ad_set} · {a.format}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-xs tabular">
                    <span style={{ color: "var(--text-secondary)" }}>{inrCompact(a.spend)} spend · {num(a.purchases)} orders</span>
                    <span className="text-base font-bold">{ratio(a.roas)}×</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      {campaign.platform === "google" && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Google reporting is campaign-level in the current export — funnel stages and per-ad breakdowns aren&apos;t available for Google campaigns.
        </p>
      )}
    </div>
  );
}
