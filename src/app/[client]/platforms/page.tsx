import { notFound } from "next/navigation";
import { getClientBySlug, getTimeseries, getOverview, getMonthlyReport } from "@/lib/queries";
import { inrCompact, ratio, pct, monthLabel } from "@/lib/format";
import { TrendChart } from "@/components/trend-chart";
import { CinemaBanner, BannerStat } from "@/components/hero-cinema";

export default async function PlatformsPage({ params }: { params: Promise<{ client: string }> }) {
  const { client: slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const [ov, daily, weekly, monthly, report] = await Promise.all([
    getOverview(client.id),
    getTimeseries(client.id, "day"),
    getTimeseries(client.id, "week"),
    getTimeseries(client.id, "month"),
    getMonthlyReport(client.id),
  ]);

  // spend-share shift: how the Meta/Google split has moved from the first
  // month both platforms had real spend to the latest one — this is the
  // one thing a single-month snapshot (the Overview Channels act) can't show
  const withBoth = report.filter((m) => m.meta.spend > 0 && m.google.spend > 0);
  const first = withBoth[0], last = withBoth[withBoth.length - 1];
  const shareShift = first && last && first.month !== last.month
    ? {
        firstLabel: monthLabel(first.month.slice(0, 7)),
        lastLabel: monthLabel(last.month.slice(0, 7)),
        firstShare: first.meta.spend / (first.meta.spend + first.google.spend),
        lastShare: last.meta.spend / (last.meta.spend + last.google.spend),
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <CinemaBanner
        eyebrow="Platforms"
        line1="Meta vs Google,"
        line2="over time."
        sub="Month to date, and the full trend below — Google reports campaign-level, Meta ad-level (per current export formats)"
        skyline={daily.map((d) => d.spend)}
        stats={ov.mtdByPlatform.map((p) => (
          <BannerStat key={p.platform}
            label={`${p.platform} · MTD`}
            value={`${ratio(p.spend > 0 ? p.revenue / p.spend : 0)}×`}
            sub={`${inrCompact(p.spend)} spend`} />
        ))}
      />

      {shareShift && (
        <div className="card px-5 py-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text-primary)" }}>Meta&rsquo;s share of spend</strong>{" "}
          moved from <strong className="tabular" style={{ color: "var(--text-primary)" }}>{pct(shareShift.firstShare, 0)}</strong> in {shareShift.firstLabel}{" "}
          to <strong className="tabular" style={{ color: "var(--text-primary)" }}>{pct(shareShift.lastShare, 0)}</strong> in {shareShift.lastLabel}
          {shareShift.lastShare > shareShift.firstShare ? " — Google's slice keeps shrinking." : " — budget is drifting toward Google."}
        </div>
      )}

      <TrendChart daily={daily} weekly={weekly} monthly={monthly} defaultGrain="month" defaultMetric="roas" />
    </div>
  );
}
