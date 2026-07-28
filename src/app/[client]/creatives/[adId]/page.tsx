import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug, getCreatives, getCreativeDaily } from "@/lib/queries";
import { inr, inrCompact, num, ratio, pct, dayLabel } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";
import { CreativeDailyChart } from "@/components/creative-daily-chart";

export default async function CreativeDetail({
  params,
}: {
  params: Promise<{ client: string; adId: string }>;
}) {
  const { client: slug, adId } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const [all, daily] = await Promise.all([getCreatives(client.id), getCreativeDaily(adId)]);
  const c = all.find((r) => r.ad_id === adId);
  if (!c) notFound();

  const stats: Array<[string, string]> = [
    ["Spend", inrCompact(c.spend)],
    ["Revenue", inrCompact(c.revenue)],
    ["ROAS", `${ratio(c.roas)}×`],
    ["Orders", num(c.purchases)],
    ["CPA", c.purchases > 0 ? inr(c.cpa) : "—"],
    ["AOV", c.purchases > 0 ? inr(c.aov) : "—"],
    ["CTR", pct(c.ctr)],
    ["CPC", inr(c.cpc)],
    ["CPM", inr(c.cpm)],
    ["LP views", num(c.lp_views)],
    ["Adds to cart", num(c.adds_to_cart ?? 0)],
    ["Days running", String(c.days_running)],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/${slug}/creatives`} className="text-xs underline" style={{ color: "var(--text-secondary)" }}>
          ← All creatives
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">{c.ad_name}</h2>
          <StatusChip status={c.status} muted={!c.active} />
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {c.campaign} → {c.ad_set} · {c.format} · {dayLabel(c.first_day)} → {dayLabel(c.last_day)}
          {c.active ? " (active)" : " (inactive)"}
        </p>
        {c.status_reasons.length > 0 && (
          <p className="mt-2 rounded-md px-3 py-2 text-sm" style={{ background: "var(--surface-1)", border: "1px solid var(--border-hairline)", color: "var(--text-secondary)" }}>
            {c.status_reasons.join(" · ")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-3">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
            <div className="mt-0.5 text-base font-semibold tabular">{value}</div>
          </div>
        ))}
      </div>

      <CreativeDailyChart rows={daily.map((d) => ({ day: d.day, spend: d.spend, revenue: d.revenue, roas: d.roas }))} />

      {/* table view (accessibility fallback + export-friendly) */}
      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Daily table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                {["Day", "Spend", "Impr.", "Clicks", "LPV", "Orders", "Revenue", "ROAS"].map((h) => (
                  <th key={h} className="py-1 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                  <td className="py-1 pr-4">{d.day}</td>
                  <td className="py-1 pr-4">{inr(d.spend)}</td>
                  <td className="py-1 pr-4">{num(d.impressions)}</td>
                  <td className="py-1 pr-4">{num(d.clicks)}</td>
                  <td className="py-1 pr-4">{num(d.lp_views)}</td>
                  <td className="py-1 pr-4">{num(d.purchases)}</td>
                  <td className="py-1 pr-4">{inr(d.revenue)}</td>
                  <td className="py-1 pr-4">{ratio(d.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
