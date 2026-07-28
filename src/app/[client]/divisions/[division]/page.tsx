import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, getDivisionOverview, getDivisionMonthly, getCampaigns, getMonths, getFunnel,
  inferDivision, type Division,
} from "@/lib/queries";
import { inr, inrCompact, num, ratio, pct, monthLabel } from "@/lib/format";
import { MonthPicker } from "@/components/month-picker";
import { Funnel } from "@/components/funnel";
import { DIVISION_LABEL, DIVISION_COLOR } from "@/components/division-section";
import { DataTrail } from "@/components/data-trail";

/** Division drill-down: economics, campaign list, month-on-month trend. */
export default async function DivisionPage({ params, searchParams }: {
  params: Promise<{ client: string; division: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { client: slug, division } = await params;
  const sp = await searchParams;
  if (division !== "fruits_veggies" && division !== "groceries") notFound();
  const dv = division as Division;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const months = await getMonths(client.id);
  const selectedMonth = sp.month && months.includes(sp.month + "-01") ? sp.month + "-01" : months[0];

  const [overview, monthlyTrend] = await Promise.all([
    getDivisionOverview(client.id, selectedMonth),
    getDivisionMonthly(client.id),
  ]);
  const d = overview.divisions.find((x) => x.division === dv)!;
  const periodLabel = overview.isPartial ? "MTD" : monthLabel(selectedMonth.slice(0, 7));

  // campaigns of this division for the selected month
  const monthEnd = new Date(Date.UTC(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0))
    .toISOString().slice(0, 10);
  const rangeEnd = monthEnd < overview.asOf ? monthEnd : overview.asOf;
  const campaigns = (await getCampaigns(client.id, { from: selectedMonth, to: rangeEnd }))
    .filter((c) => inferDivision(c.name) === dv);
  const funnel = await getFunnel(client.id, { from: selectedMonth, to: rangeEnd }, { division: dv });

  const maxRev = Math.max(...monthlyTrend.map((m) => m[dv].revenue), 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <DataTrail
            crumbs={[{ label: "Overview", href: `/${slug}` }, { label: DIVISION_LABEL[dv] }]}
            source="Meta + Google daily exports · classified by campaign name"
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-sm" aria-hidden style={{ background: DIVISION_COLOR[dv] }} />
            <h2 className="text-base font-semibold">{DIVISION_LABEL[dv]}</h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{periodLabel}</span>
          </div>
        </div>
        <MonthPicker months={months} selected={selectedMonth} basePath={`/${slug}/divisions/${dv}`} />
      </div>

      {/* economics row */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {([
          ["Spend", inrCompact(d.spend)],
          ["Revenue", inrCompact(d.revenue)],
          ["ROAS", `${ratio(d.roas)}×`],
          ["Orders", num(d.purchases)],
          ["CAC (paid)", d.purchases > 0 ? inr(d.cpa) : "—"],
          ["AOV", d.purchases > 0 ? inr(d.aov) : "—"],
          ["CTR", pct(d.ctr)],
          ["CPM", inr(d.cpm)],
        ] as Array<[string, string]>).map(([label, value]) => (
          <div key={label} className="card p-3">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
            <div className="mt-0.5 text-base font-semibold tabular">{value}</div>
          </div>
        ))}
      </div>

      {/* conversion funnel for this division */}
      {funnel.stages[0].value > 0 && (
        <div className="canvas-dark p-6">
          <Funnel stages={funnel.stages}
            title={`Conversion funnel — ${periodLabel}`}
            subtitle="Meta attribution"
            footer={`This flow cost ${inrCompact(funnel.spend)} and returned ${inrCompact(funnel.revenue)} — ${(funnel.spend > 0 ? funnel.revenue / funnel.spend : 0).toFixed(2)}× ROAS`} />
        </div>
      )}

      {/* month-on-month trend */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">Month on month</h3>
        <div className="flex flex-col gap-2">
          {monthlyTrend.map((m) => {
            const row = m[dv];
            const roas = row.spend > 0 ? row.revenue / row.spend : 0;
            const isSel = m.month === selectedMonth;
            return (
              <Link key={m.month} href={`/${slug}/divisions/${dv}?month=${m.month.slice(0, 7)}`}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-xs tabular hover:underline"
                style={{ background: isSel ? "var(--grid)" : "transparent" }}>
                <span className="w-16 shrink-0 font-medium">{monthLabel(m.month.slice(0, 7))}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--grid)" }}>
                  <span className="block h-full rounded-full"
                    style={{ width: `${(100 * row.revenue) / maxRev}%`, background: DIVISION_COLOR[dv] }} />
                </span>
                <span className="w-20 shrink-0 text-right">{inrCompact(row.revenue)}</span>
                <span className="w-24 shrink-0 text-right" style={{ color: "var(--text-secondary)" }}>
                  {inrCompact(row.spend)} spend
                </span>
                <span className="w-14 shrink-0 text-right font-medium">{ratio(roas)}×</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* campaigns in this division */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
              {["Campaign", "Platform", "Spend", "Orders", "Revenue", "ROAS", "CPA"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id + c.platform} style={{ borderTop: "1px solid var(--border-hairline)" }}>
                <td className="max-w-72 px-4 py-2.5">
                  <Link href={`/${slug}/campaigns/${c.id}`} className="line-clamp-1 font-medium underline-offset-2 hover:underline">{c.name}</Link>
                </td>
                <td className="px-4 py-2.5 text-xs capitalize">{c.platform}</td>
                <td className="px-4 py-2.5">{inrCompact(c.spend)}</td>
                <td className="px-4 py-2.5">{num(c.purchases)}</td>
                <td className="px-4 py-2.5">{inrCompact(c.revenue)}</td>
                <td className="px-4 py-2.5 font-medium">{ratio(c.roas)}</td>
                <td className="px-4 py-2.5">{c.purchases > 0 ? inr(c.cpa) : "—"}</td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr><td className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }} colSpan={7}>
                No {DIVISION_LABEL[dv]} campaigns this month.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
