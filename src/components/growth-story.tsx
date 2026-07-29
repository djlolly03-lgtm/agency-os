import { Explain } from "@/components/explain";
import { AnimatedNumber } from "@/components/motion";
import { inrCompact, ratio, num } from "@/lib/format";
import { shortMonth, type MonthSeries } from "@/lib/periods";

/**
 * The growth story: month-on-month revenue towers with % steps, a cumulative
 * revenue arc climbing over them, headline growth stats, and quarter-on-quarter
 * rollup cards. Every figure opens into its math.
 */
export function GrowthStory({ series, accentMonths }: {
  series: MonthSeries[];           // asc
  accentMonths?: string[];         // months to spotlight (period mode)
}) {
  if (series.length < 2) return null;
  const accent = accentMonths ? new Set(accentMonths) : null;
  const full = series.filter((s) => !s.isPartial);
  const cumulative: number[] = [];
  series.reduce((acc, s) => { cumulative.push(acc + s.revenue); return acc + s.revenue; }, 0);
  const totalAll = cumulative[cumulative.length - 1];

  // headline growth stats (full months only — the running month would lie)
  const first = full[0], last = full[full.length - 1];
  const multiple = first && last && first.revenue > 0 ? last.revenue / first.revenue : null;
  const avgMom = first && last && full.length > 1 && first.revenue > 0
    ? Math.pow(last.revenue / first.revenue, 1 / (full.length - 1)) - 1 : null;
  const best = full.length ? full.reduce((a, b) => (b.revenue > a.revenue ? b : a)) : null;

  // ---- chart geometry ----
  const W = 1040, H = 330, PAD = 10, LABEL_H = 26, TOP = 56;
  const plotH = H - LABEL_H - TOP;
  const n = series.length;
  const slot = (W - PAD * 2) / n;
  const bw = Math.min(slot * 0.62, 72);
  const maxRev = Math.max(...series.map((s) => s.revenue), 1);
  const barX = (i: number) => PAD + slot * i + (slot - bw) / 2;
  const barH = (v: number) => Math.max((v / maxRev) * plotH, 3);
  // cumulative arc on its own scale, riding the upper band of the chart
  const cy = (v: number) => TOP + (1 - v / totalAll) * (plotH * 0.72);
  const pts = series.map((s, i) => ({ x: PAD + slot * i + slot / 2, y: cy(cumulative[i]) }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const lineLen = pts.reduce((acc, p, i) =>
    i === 0 ? 0 : acc + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="canvas-dark p-6 md:p-8">
        {/* header: cumulative total + growth stats */}
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <Explain block math={{
            title: "Cumulative revenue since launch",
            steps: [
              ...series.map((s) => ({
                label: `${shortMonth(s.month)}${s.isPartial ? " (MTD)" : ""} — ${s.source === "store" ? "store total" : "paid only*"}`,
                value: inrCompact(s.revenue),
              })),
              { label: "Running total", value: inrCompact(totalAll) },
            ],
            formula: `total = ${series.map((s) => inrCompact(s.revenue)).join(" + ")} = ${inrCompact(totalAll)}`,
            note: "*Months without a Shopify store total (e.g. Nov ’25) count paid-attributed revenue only.",
            source: "Dashboard tab (Shopify) + platform exports · Sheets → Supabase",
          }}>
            <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Revenue since {shortMonth(series[0].month)}
            </span>
            <div className="hero-number tabular num-gradient mt-1">
              <AnimatedNumber value={totalAll} format="inr-compact" />
            </div>
          </Explain>
          <div className="flex flex-wrap gap-6">
            {multiple != null && first && last && (
              <Explain block math={{
                title: "Growth multiple",
                steps: [
                  { label: `${shortMonth(first.month)} revenue (first full month)`, value: inrCompact(first.revenue) },
                  { label: `${shortMonth(last.month)} revenue (latest full month)`, value: inrCompact(last.revenue) },
                ],
                formula: `growth = ${inrCompact(last.revenue)} ÷ ${inrCompact(first.revenue)} = ${ratio(multiple, 1)}×`,
                note: "The running month is excluded — it would understate growth.",
                source: "Monthly revenue series",
              }}>
                <GrowthStat label={`growth since ${shortMonth(first.month)}`} value={`${ratio(multiple, 1)}×`} />
              </Explain>
            )}
            {avgMom != null && first && last && (
              <Explain block math={{
                title: "Average month-on-month growth",
                steps: [
                  { label: "First full month", value: inrCompact(first.revenue) },
                  { label: "Latest full month", value: inrCompact(last.revenue) },
                  { label: "Full months spanned", value: String(full.length) },
                ],
                formula: `avg growth = (${inrCompact(last.revenue)} ÷ ${inrCompact(first.revenue)})^(1/${full.length - 1}) − 1 = ${(avgMom * 100).toFixed(0)}%/mo`,
                note: "Compound (geometric) rate — the steady monthly climb that produces the same total growth.",
                source: "Monthly revenue series",
              }}>
                <GrowthStat label="avg growth / month" value={`+${(avgMom * 100).toFixed(0)}%`} />
              </Explain>
            )}
            {best && (
              <Explain block math={{
                title: "Best month",
                steps: full.map((s) => ({ label: shortMonth(s.month), value: inrCompact(s.revenue) })),
                formula: `best = max(monthly revenue) = ${shortMonth(best.month)}`,
                source: "Monthly revenue series",
              }}>
                <GrowthStat label={`best · ${shortMonth(best.month)}`} value={inrCompact(best.revenue)} />
              </Explain>
            )}
          </div>
        </div>

        {/* the mountain */}
        <div className="mt-6 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="img"
            aria-label="Monthly revenue with cumulative total">
            <defs>
              <linearGradient id="g-bar" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#17b39a" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#7ff0d8" stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id="g-bar-dim" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#17b39a" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#4dcdb4" stopOpacity="0.34" />
              </linearGradient>
              <filter id="g-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {series.map((s, i) => {
              const h = barH(s.revenue);
              const x = barX(i), y = H - LABEL_H - h;
              const dimmed = accent ? !accent.has(s.month) : false;
              const growth = i > 0 && series[i - 1].revenue > 0
                ? s.revenue / series[i - 1].revenue - 1 : null;
              return (
                <g key={s.month}>
                  <rect x={x} y={y} width={bw} height={h} rx="7"
                    className="growth-bar" style={{ animationDelay: `${i * 0.06}s` }}
                    fill={s.isPartial ? "none" : `url(#${dimmed ? "g-bar-dim" : "g-bar"})`}
                    stroke={s.isPartial ? "#4dcdb4" : "none"}
                    strokeWidth={s.isPartial ? 1.5 : 0}
                    strokeDasharray={s.isPartial ? "5 4" : undefined} />
                  {/* value: inside solid bars when tall enough, else above */}
                  <text x={x + bw / 2} y={!s.isPartial && h > 46 ? y + 18 : y - 8} textAnchor="middle"
                    fontSize="12.5" fontWeight="700" className="tabular"
                    fill={!s.isPartial && h > 46 ? "#083f36" : "var(--text-secondary)"}>
                    {inrCompact(s.revenue)}
                  </text>
                  {/* growth chip */}
                  {growth != null && !s.isPartial && Math.abs(growth) >= 0.005 && (
                    <text x={x + bw / 2} y={y - (h > 46 ? 8 : 24)} textAnchor="middle"
                      fontSize="11.5" fontWeight="800" className="tabular"
                      fill={growth > 0 ? "#34c759" : "#ff5f57"}>
                      {growth > 0 ? "▲" : "▼"}{Math.abs(growth * 100).toFixed(0)}%
                    </text>
                  )}
                  {s.isPartial && (
                    <text x={x + bw / 2} y={y - 24} textAnchor="middle" fontSize="10.5"
                      fontWeight="700" letterSpacing="1" fill="var(--text-muted)">MTD</text>
                  )}
                  {/* month label */}
                  <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11.5"
                    fill={dimmed ? "var(--text-muted)" : "var(--text-secondary)"}
                    fontWeight={dimmed ? 400 : 600}>
                    {shortMonth(s.month)}
                  </text>
                </g>
              );
            })}

            {/* cumulative arc */}
            <path d={linePath} fill="none" stroke="#ef8c33" strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" filter="url(#g-glow)"
              className="growth-line" style={{ ["--len" as string]: `${Math.ceil(lineLen)}` }} />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i === n - 1 ? 5 : 2.5}
                fill={i === n - 1 ? "#ffb267" : "#ef8c33"}
                filter={i === n - 1 ? "url(#g-glow)" : undefined} />
            ))}
            <text x={Math.min(pts[n - 1].x, W - 6)} y={pts[n - 1].y - 12}
              textAnchor="end" fontSize="12.5" fontWeight="800" className="tabular" fill="#ffb267">
              {inrCompact(totalAll)} cumulative
            </text>
          </svg>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Bars: monthly revenue (Shopify store totals; Nov ’25 is paid-only — no store total on record).
          Orange arc: running total. Dashed bar: month in progress.
        </p>
      </div>

      {/* quarter-on-quarter */}
      <QuarterCards series={series} />
    </div>
  );
}

function GrowthStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular md:text-3xl">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function QuarterCards({ series }: { series: MonthSeries[] }) {
  const byQ = new Map<string, MonthSeries[]>();
  for (const s of series) {
    const q = `${s.month.slice(0, 4)}-q${Math.floor((Number(s.month.slice(5, 7)) - 1) / 3) + 1}`;
    byQ.set(q, [...(byQ.get(q) ?? []), s]);
  }
  const quarters = [...byQ.entries()].map(([key, ms]) => ({
    key,
    label: `Q${key.slice(6)} ’${key.slice(2, 4)}`,
    months: ms,
    revenue: ms.reduce((t, m) => t + m.revenue, 0),
    spend: ms.reduce((t, m) => t + m.spend, 0),
    orders: ms.reduce((t, m) => t + m.orders, 0),
    partial: ms.some((m) => m.isPartial) || ms.length < 3,
  }));
  if (quarters.length < 2) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {quarters.map((q, i) => {
        const prev = i > 0 ? quarters[i - 1] : null;
        const delta = prev && prev.revenue > 0 && !q.partial && !prev.partial
          ? q.revenue / prev.revenue - 1 : null;
        const roas = q.spend > 0 ? q.revenue / q.spend : null;
        const latest = i === quarters.length - 1;
        return (
          <Explain key={q.key} block math={{
            title: `${q.label} rollup`,
            steps: [
              ...q.months.map((m) => ({
                label: `${shortMonth(m.month)}${m.isPartial ? " (MTD)" : ""}`,
                value: inrCompact(m.revenue),
              })),
              { label: "Quarter revenue", value: inrCompact(q.revenue) },
              { label: "Quarter spend", value: inrCompact(q.spend) },
              { label: "Orders", value: num(q.orders) },
            ],
            formula: roas != null
              ? `blended ROAS = ${inrCompact(q.revenue)} ÷ ${inrCompact(q.spend)} = ${ratio(roas)}×`
              : `revenue = ${q.months.map((m) => inrCompact(m.revenue)).join(" + ")}`,
            note: q.partial ? "Incomplete quarter — comparisons are suppressed until it closes." : undefined,
            source: "Monthly revenue series · Sheets → Supabase",
          }}>
            <div className={`card card-lift h-full p-4 ${latest ? "hero-band" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--brand)" }}>
                  {q.label}{q.partial ? " · so far" : ""}
                </span>
                {delta != null && Math.abs(delta) >= 0.005 && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular"
                    style={{
                      background: `color-mix(in srgb, ${delta > 0 ? "var(--status-good)" : "var(--status-critical)"} 15%, transparent)`,
                      color: delta > 0 ? "var(--delta-good)" : "var(--status-critical)",
                    }}>
                    {delta > 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(0)}% QoQ
                  </span>
                )}
              </div>
              <div className="mt-2 text-2xl font-bold tabular">{inrCompact(q.revenue)}</div>
              <div className="mt-1 text-xs tabular" style={{ color: "var(--text-secondary)" }}>
                {roas != null ? `${ratio(roas)}× blended` : "—"} · {num(q.orders)} orders · {inrCompact(q.spend)} spend
              </div>
            </div>
          </Explain>
        );
      })}
    </div>
  );
}
