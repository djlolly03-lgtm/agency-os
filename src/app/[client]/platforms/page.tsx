import { notFound } from "next/navigation";
import { getClientBySlug, getTimeseries, getOverview } from "@/lib/queries";
import { inrCompact, inr, num, ratio, pct } from "@/lib/format";
import { TrendChart } from "@/components/trend-chart";

export default async function PlatformsPage({ params }: { params: Promise<{ client: string }> }) {
  const { client: slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const [ov, daily, weekly, monthly] = await Promise.all([
    getOverview(client.id),
    getTimeseries(client.id, "day"),
    getTimeseries(client.id, "week"),
    getTimeseries(client.id, "month"),
  ]);

  const totalSpend = ov.mtd.spend || 1;
  const totalRevenue = ov.mtd.revenue || 1;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Meta vs Google (MTD)</h2>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Note: Google reporting is campaign-level (per current export format); Meta is ad-level.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {ov.mtdByPlatform.map((p) => (
          <div key={p.platform} className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" aria-hidden
                style={{ background: p.platform === "meta" ? "var(--series-1)" : "var(--series-2)" }} />
              <h3 className="text-sm font-semibold capitalize">{p.platform}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["Spend", inrCompact(p.spend)],
                ["Spend share", pct(p.spend / totalSpend, 0)],
                ["Revenue", inrCompact(p.revenue)],
                ["Revenue share", pct(p.revenue / totalRevenue, 0)],
                ["ROAS", `${ratio(p.roas)}×`],
                ["Orders", num(p.purchases)],
                ["CPA", p.purchases > 0 ? inr(p.cpa) : "—"],
                ["CPC", inr(p.cpc)],
              ] as Array<[string, string]>).map(([label, value]) => (
                <div key={label}>
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
                  <div className="text-lg font-semibold tabular">{value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <TrendChart daily={daily} weekly={weekly} monthly={monthly} />
    </div>
  );
}
