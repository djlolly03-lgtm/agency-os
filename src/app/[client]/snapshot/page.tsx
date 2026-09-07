import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug, getTimeseries, latestDay, derive } from "@/lib/queries";
import { inr, inrCompact, num, ratio } from "@/lib/format";
import { SnapshotTrend, SnapshotSplit } from "@/components/snapshot-charts";

const DAY_OPTIONS = [7, 14, 30, 90];
const PLATFORM_OPTIONS: Array<{ key: "all" | "meta" | "google"; label: string }> = [
  { key: "all", label: "All platforms" },
  { key: "meta", label: "Meta" },
  { key: "google", label: "Google" },
];

/**
 * The boardroom view — everyone else on this app is depth-first (Today's
 * "why we're saying this" case files, Review's full decision memo). This
 * page is the opposite on purpose: six numbers, one chart, one split, one
 * table, filterable, nothing to click into. Built for a screen-share where
 * someone needs the picture in ten seconds, not the reasoning behind it —
 * the reasoning lives on Today and Review, a link away.
 */
export default async function SnapshotPage({ params, searchParams }: {
  params: Promise<{ client: string }>;
  searchParams: Promise<{ days?: string; platform?: string }>;
}) {
  const { client: slug } = await params;
  const sp = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const days = DAY_OPTIONS.includes(Number(sp.days)) ? Number(sp.days) : 14;
  const platformFilter = (["all", "meta", "google"] as const).includes(sp.platform as never)
    ? (sp.platform as "all" | "meta" | "google") : "all";

  const asOf = await latestDay(client.id);
  const to = asOf;
  const from = new Date(new Date(to + "T00:00:00Z").getTime() - (days - 1) * 86400000)
    .toISOString().slice(0, 10);

  const rows = await getTimeseries(client.id, "day", { from, to });

  // platform split — always computed from the full window, independent of
  // the filter, so "where the spend went" still answers that question even
  // when you've filtered the rest of the page down to one platform
  const byPlatformTotal = new Map<string, number>();
  for (const r of rows) byPlatformTotal.set(r.platform, (byPlatformTotal.get(r.platform) ?? 0) + r.spend);
  const splitSegments = [...byPlatformTotal.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([platform, value]) => ({
      label: platform === "meta" ? "Meta" : platform === "google" ? "Google" : platform,
      value,
      color: platform === "meta" ? "var(--series-1)" : platform === "google" ? "var(--series-2)" : "var(--series-3)",
    }));

  const filteredRows = platformFilter === "all" ? rows : rows.filter((r) => r.platform === platformFilter);

  // one row per day, blended across whatever platforms survived the filter
  const byDay = new Map<string, { spend: number; revenue: number; purchases: number; impressions: number; clicks: number; lp_views: number }>();
  for (const r of filteredRows) {
    const d = byDay.get(r.period) ?? { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0, lp_views: 0 };
    d.spend += r.spend; d.revenue += r.revenue; d.purchases += r.purchases;
    d.impressions += r.impressions; d.clicks += r.clicks; d.lp_views += r.lp_views;
    byDay.set(r.period, d);
  }
  const daily = [...byDay.entries()]
    .map(([day, d]) => ({ day, ...d, roas: d.spend > 0 ? d.revenue / d.spend : 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const totals = daily.reduce((t, d) => ({
    spend: t.spend + d.spend, revenue: t.revenue + d.revenue, purchases: t.purchases + d.purchases,
    impressions: t.impressions + d.impressions, clicks: t.clicks + d.clicks, lp_views: t.lp_views + d.lp_views,
  }), { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0, lp_views: 0 });
  const kpi = derive(totals);

  const dayLabelShort = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  const trendPoints = daily.map((d) => ({
    day: d.day, label: new Date(d.day + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
    spend: d.spend, revenue: d.revenue,
  }));

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ days: String(days), platform: platformFilter, ...patch });
    return `?${p.toString()}`;
  };

  const roasTone = (r: number) => r >= 1.5 ? "var(--status-good)" : r >= 1 ? "var(--status-warning)" : "var(--status-critical)";

  return (
    <div className="flex flex-col gap-5">
      {/* ===== masthead ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-lg font-bold">{client.name}</h1>
          <span className="text-sm italic" style={{ fontFamily: "var(--font-serif), Georgia, serif", color: "var(--brand)" }}>
            Snapshot
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PLATFORM_OPTIONS.map((p) => (
            <Link key={p.key} href={qs({ platform: p.key })}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{
                borderColor: platformFilter === p.key ? "transparent" : "var(--border-hairline)",
                background: platformFilter === p.key ? "var(--brand)" : "transparent",
                color: platformFilter === p.key ? "#ffffff" : "var(--text-secondary)",
              }}>
              {p.label}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px" style={{ background: "var(--border-hairline)" }} />
          {DAY_OPTIONS.map((d) => (
            <Link key={d} href={qs({ days: String(d) })}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{
                borderColor: days === d ? "transparent" : "var(--border-hairline)",
                background: days === d ? "var(--brand)" : "transparent",
                color: days === d ? "#ffffff" : "var(--text-secondary)",
              }}>
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* ===== KPI row ===== */}
      <div className="card grid grid-cols-2 divide-x sm:grid-cols-3 lg:grid-cols-6" style={{ borderColor: "var(--border-hairline)" }}>
        {[
          { label: "Revenue", value: inrCompact(totals.revenue), sub: `${num(totals.purchases)} orders` },
          { label: "Spend", value: inrCompact(totals.spend), sub: `${days} days` },
          { label: "Blended ROAS", value: `${ratio(kpi.roas)}×`, sub: null, tone: roasTone(kpi.roas) },
          { label: "Orders", value: num(totals.purchases), sub: null },
          { label: "AOV", value: inr(kpi.aov), sub: null },
          { label: "Blended CPA", value: inr(kpi.cpa), sub: null },
        ].map((t) => (
          <div key={t.label} className="flex flex-col gap-1.5 px-4 py-3.5" style={{ borderColor: "var(--border-hairline)" }}>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
              {t.label}
            </span>
            <span className="tabular text-xl font-extrabold" style={{ color: t.tone ?? "var(--text-primary)" }}>
              {t.value}
            </span>
            {t.sub && <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{t.sub}</span>}
          </div>
        ))}
      </div>

      {/* ===== trend + split ===== */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-5">
          <h2 className="text-sm font-bold">Daily spend vs. revenue</h2>
          <p className="mb-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {dayLabelShort(from)} – {dayLabelShort(to)} · {platformFilter === "all" ? "all platforms, blended" : PLATFORM_OPTIONS.find((p) => p.key === platformFilter)?.label}
          </p>
          <div className="mb-2 flex gap-4 text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--brand)" }} /> Revenue</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--brand-accent)" }} /> Spend</span>
          </div>
          <SnapshotTrend points={trendPoints} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-bold">Where the spend went</h2>
          <p className="mb-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Share of spend, same {days}-day window
          </p>
          <SnapshotSplit segments={splitSegments} />
        </div>
      </div>

      {/* ===== day by day, most recent first ===== */}
      <div className="card overflow-x-auto p-5">
        <h2 className="text-sm font-bold">Day by day</h2>
        <p className="mb-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          Most recent first · {dayLabelShort(from)} – {dayLabelShort(to)}
        </p>
        <table className="w-full text-[12.5px] tabular">
          <thead>
            <tr className="text-left" style={{ color: "var(--text-muted)" }}>
              {["Day", "Spend", "Revenue", "ROAS", "Orders", "Impressions", "Clicks"].map((h, i) => (
                <th key={h} className={`py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.day} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                <td className="py-2 font-medium" style={{ color: "var(--text-secondary)" }}>{dayLabelShort(d.day)}</td>
                <td className="py-2 text-right">{inr(d.spend)}</td>
                <td className="py-2 text-right">{inr(d.revenue)}</td>
                <td className="py-2 text-right">
                  <span className="rounded-full px-2 py-0.5 font-bold" style={{
                    background: `color-mix(in srgb, ${roasTone(d.roas)} 18%, transparent)`, color: roasTone(d.roas),
                  }}>
                    {ratio(d.roas)}×
                  </span>
                </td>
                <td className="py-2 text-right">{num(Math.round(d.purchases))}</td>
                <td className="py-2 text-right">{num(d.impressions)}</td>
                <td className="py-2 text-right">{num(d.clicks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Data through {dayLabelShort(asOf)}, recomputed from raw platform data on every load · full reasoning behind any
        number lives on the <Link href={`/${slug}`} className="underline">Today</Link> and{" "}
        <Link href={`/${slug}/review`} className="underline">Review</Link> pages
      </p>
    </div>
  );
}
