import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug, getCampaigns, latestDay, type Range } from "@/lib/queries";
import { inrCompact, inr, num, ratio, pct, dayLabel } from "@/lib/format";
import { CampaignScatter } from "@/components/campaign-scatter";
import { FadeIn } from "@/components/motion";
import { CinemaBanner, BannerStat } from "@/components/hero-cinema";
import { KillMap } from "@/components/kill-map";
import { SectionHeader } from "@/components/section-header";

const RANGES = ["7d", "30d", "mtd", "all"] as const;
type RangeKey = (typeof RANGES)[number];

function resolveRange(key: RangeKey, today: string): Range | undefined {
  const d = new Date(today + "T00:00:00Z");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  switch (key) {
    case "7d": return { from: iso(new Date(d.getTime() - 6 * 86400000)), to: today };
    case "30d": return { from: iso(new Date(d.getTime() - 29 * 86400000)), to: today };
    case "mtd": return { from: today.slice(0, 8) + "01", to: today };
    default: return undefined;
  }
}

export default async function CampaignsPage({
  params, searchParams,
}: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { client: slug } = await params;
  const sp = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const today = await latestDay(client.id);
  const isCustom = Boolean(sp.from && sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) && /^\d{4}-\d{2}-\d{2}$/.test(sp.to));
  const rangeKey: RangeKey = (RANGES as readonly string[]).includes(sp.range ?? "") ? sp.range as RangeKey : "all";
  const range = isCustom ? { from: sp.from!, to: sp.to! } : resolveRange(rangeKey, today);
  const campaigns = await getCampaigns(client.id, range);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0) || 1;
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const accountRoas = totalRevenue / totalSpend;

  const rangeLabel = isCustom
    ? (sp.from === sp.to ? dayLabel(sp.from!) : `${dayLabel(sp.from!)} → ${dayLabel(sp.to!)}`)
    : rangeKey === "all" ? "All time" : rangeKey === "mtd" ? "MTD" : `Last ${rangeKey.replace("d", "")} days`;

  return (
    <div className="flex flex-col gap-4">
      <CinemaBanner
        eyebrow="Campaigns"
        line1="Every campaign,"
        line2="weighed and ranked."
        sub={`${rangeLabel} · ${campaigns.length} campaigns · each dot below opens into its full story`}
        skyline={campaigns.map((c) => c.spend).sort((a, b) => b - a)}
        stats={<>
          <BannerStat label="Spend" value={inrCompact(totalSpend)} />
          <BannerStat label="Paid revenue" value={inrCompact(totalRevenue)} />
          <BannerStat label="ROAS" value={`${ratio(accountRoas)}×`} />
        </>}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-1 text-xs">
          {isCustom && (
            <span className="rounded-md border px-3 py-1.5 font-semibold"
              style={{ borderColor: "var(--border-hairline)", background: "var(--grid)" }}>
              {rangeLabel}
            </span>
          )}
          {RANGES.map((r) => (
            <Link key={r} href={`?range=${r}`}
              className="rounded-md border px-3 py-1.5 uppercase"
              style={{
                borderColor: "var(--border-hairline)",
                background: !isCustom && rangeKey === r ? "var(--grid)" : "transparent",
                fontWeight: !isCustom && rangeKey === r ? 600 : 400,
              }}>
              {r === "all" ? "All time" : r === "mtd" ? "MTD" : `Last ${r.replace("d", "")}d`}
            </Link>
          ))}
        </div>
      </div>

      <FadeIn>
        <CampaignScatter
          points={campaigns.map((c) => ({ id: c.id, name: c.name, platform: c.platform,
            spend: c.spend, revenue: c.revenue, roas: c.roas, purchases: c.purchases }))}
          accountRoas={accountRoas} slug={slug}
        />
      </FadeIn>

      <FadeIn delay={0.05}>
        <SectionHeader eyebrow="The kill map" title="Scale, watch, or cut."
          meta={`${rangeLabel} · CAC vs AOV · bubble = spend`} />
      </FadeIn>
      <FadeIn delay={0.05}>
        <KillMap campaigns={campaigns} slug={slug} />
      </FadeIn>

      <FadeIn>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                {["Campaign", "Platform", "Spend", "Share", "Orders", "Revenue", "ROAS", "CPA"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {campaigns.map((c) => (
                <tr key={c.id + c.platform} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                  <td className="max-w-72 px-4 py-2.5">
                    <Link href={`/${slug}/campaigns/${c.id}`} className="line-clamp-1 font-medium underline-offset-2 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs capitalize">
                      <span className="h-2 w-2 rounded-sm" aria-hidden
                        style={{ background: c.platform === "meta" ? "var(--series-1)" : "var(--series-2)" }} />
                      {c.platform}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{inrCompact(c.spend)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--grid)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (100 * c.spend) / totalSpend)}%`, background: c.platform === "meta" ? "var(--series-1)" : "var(--series-2)" }} />
                      </div>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{pct(c.spend / totalSpend, 1)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{num(c.purchases)}</td>
                  <td className="px-4 py-2.5">{inrCompact(c.revenue)}</td>
                  <td className="px-4 py-2.5 font-medium">{ratio(c.roas)}</td>
                  <td className="px-4 py-2.5">{c.purchases > 0 ? inr(c.cpa) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeIn>
    </div>
  );
}
