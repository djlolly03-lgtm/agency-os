import { notFound } from "next/navigation";
import { getClientBySlug, getMonthlyReport } from "@/lib/queries";
import { inrCompact, inr, num, ratio, monthLabel } from "@/lib/format";
import { CinemaBanner, BannerStat } from "@/components/hero-cinema";

/** The client-facing monthly funnel report — replaces the workbook's Dashboard tab. */
export default async function MonthlyPage({ params }: { params: Promise<{ client: string }> }) {
  const { client: slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const months = (await getMonthlyReport(client.id)).reverse();

  return (
    <div className="flex flex-col gap-4">
      <CinemaBanner
        eyebrow="Monthly report"
        line1="Month by month,"
        line2="the whole story."
        sub="Meta & Google from daily platform data · store totals & pre-May Google from declared manual inputs · Organic = store total − paid"
        skyline={[...months].reverse().map((m) => m.totalRevenue ?? (m.meta.revenue + m.google.revenue))}
        stats={<>
          <BannerStat label="Months tracked" value={String(months.length)} />
          <BannerStat label="Latest month" value={monthLabel(months[0]?.month.slice(0, 7) ?? "")} />
        </>}
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
              {["Month", "Spend", "Meta rev", "Google rev", "Organic rev", "Store revenue", "Orders", "AOV", "Blended CPA", "Blended ROAS"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                <td className="px-4 py-2.5 font-medium">
                  <a href={`/${slug}?month=${m.month.slice(0, 7)}`} className="underline-offset-2 hover:underline">
                    {monthLabel(m.month.slice(0, 7))}
                  </a>
                </td>
                <td className="px-4 py-2.5">{inrCompact(m.spend)}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" aria-hidden style={{ background: "var(--series-1)" }} />
                    {inrCompact(m.meta.revenue)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" aria-hidden style={{ background: "var(--series-2)" }} />
                    {m.google.spend > 0 ? inrCompact(m.google.revenue) : "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" aria-hidden style={{ background: "var(--series-3)" }} />
                    {m.organicRevenue != null ? inrCompact(m.organicRevenue) : "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium">{m.totalRevenue != null ? inrCompact(m.totalRevenue) : "—"}</td>
                <td className="px-4 py-2.5">{m.totalOrders != null ? num(m.totalOrders) : "—"}</td>
                <td className="px-4 py-2.5">{m.aov != null ? inr(m.aov) : "—"}</td>
                <td className="px-4 py-2.5">{m.cac != null ? inr(m.cac) : "—"}</td>
                <td className="px-4 py-2.5 font-semibold">{ratio(m.blendedRoas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Numbers are recomputed from raw daily data on every load — no pasted snapshots.
        Dec 2025–Apr 2026 Google figures come from declared monthly inputs (daily Google data begins May 2026).
      </p>
    </div>
  );
}
