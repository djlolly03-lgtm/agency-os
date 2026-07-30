import { Explain } from "@/components/explain";
import { SpotlightStage } from "@/components/hero-cinema";
import { inrCompact, ratio } from "@/lib/format";
import { shortMonth, type MonthSeries } from "@/lib/periods";

/** Catmull-Rom → cubic bezier path through points (gentle smoothing). */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * 01 · Efficiency — the margin engine. Revenue and spend as layered areas
 * (the widening gap IS the margin), with the blended-ROAS line riding above:
 * flat through a spend ramp is the strongest scaling signal there is.
 */
export function MarginEngine({ series }: { series: MonthSeries[] }) {
  if (series.length < 3) return null;
  const full = series.filter((s) => !s.isPartial);
  const first = full[0], last = full[full.length - 1];
  const spendX = first && last && first.spend > 0 ? last.spend / first.spend : null;

  const roasVals = series.map((s) => s.blendedRoas ?? 0).filter((r) => r > 0);
  const fullRoas = full.map((s) => s.blendedRoas ?? 0).filter((r) => r > 0);
  const roasMin = Math.min(...fullRoas), roasMax = Math.max(...fullRoas);
  const peakIdx = series.reduce((bi, s, i) =>
    (s.blendedRoas ?? 0) > (series[bi].blendedRoas ?? 0) ? i : bi, 0);

  const totRevenue = series.reduce((t, s) => t + s.revenue, 0);
  const totSpend = series.reduce((t, s) => t + s.spend, 0);
  const blendedAll = totSpend > 0 ? totRevenue / totSpend : 0;

  // ---- geometry ----
  const W = 1180, H = 330, PADL = 46, PADR = 56, TOP = 16, BOT = 30;
  const plotW = W - PADL - PADR, plotH = H - TOP - BOT;
  const n = series.length;
  const x = (i: number) => PADL + (n === 1 ? 0 : (plotW * i) / (n - 1));
  const maxRev = Math.max(...series.map((s) => s.revenue), 1);
  const yV = (v: number) => TOP + plotH * 0.32 + (1 - v / maxRev) * plotH * 0.68;
  const baseline = yV(0);
  // ROAS band: the top strip of the plot
  const yR = (r: number) => {
    const lo = Math.min(...roasVals) * 0.9, hi = Math.max(...roasVals) * 1.05;
    return TOP + 8 + (1 - (r - lo) / Math.max(hi - lo, 0.01)) * (plotH * 0.24);
  };

  const revPts = series.map((s, i) => ({ x: x(i), y: yV(s.revenue) }));
  const spendPts = series.map((s, i) => ({ x: x(i), y: yV(s.spend) }));
  const roasPts = series.map((s, i) => ({ x: x(i), y: yR(s.blendedRoas ?? 0) }));
  const area = (pts: typeof revPts) =>
    `${smoothPath(pts)} L${pts[pts.length - 1].x.toFixed(1)},${baseline.toFixed(1)} L${pts[0].x.toFixed(1)},${baseline.toFixed(1)} Z`;

  // ₹ gridlines at sensible lakh steps
  const step = maxRev > 8_00_000 ? 5_00_000 : 2_00_000;
  const grids: number[] = [];
  for (let g = step; g <= maxRev; g += step) grids.push(g);

  return (
    <SpotlightStage>
      <div className="canvas-dark p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <p className="max-w-md text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            The gap between the teal and amber areas is <strong style={{ color: "var(--text-primary)" }}>margin</strong> —
            and it widens every month. The white line is blended ROAS: flat through a spend ramp is the win.
          </p>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            {([
              { label: "Revenue", value: inrCompact(totRevenue), color: "#7ff0d8",
                math: {
                  title: "Revenue across the series",
                  steps: series.map((s) => ({ label: `${shortMonth(s.month)}${s.isPartial ? " (MTD)" : ""}`, value: inrCompact(s.revenue) })),
                  formula: `revenue = ${inrCompact(totRevenue)} (store totals; Nov ’25 paid-only)`,
                  source: "Dashboard tab (Shopify) + platform exports",
                } },
              { label: "ROAS", value: `${ratio(blendedAll)}×`, color: "#ffffff",
                math: {
                  title: "Blended ROAS across the series",
                  steps: [
                    { label: "Total revenue", value: inrCompact(totRevenue) },
                    { label: "Total paid spend", value: inrCompact(totSpend) },
                  ],
                  formula: `blended ROAS = ${inrCompact(totRevenue)} ÷ ${inrCompact(totSpend)} = ${ratio(blendedAll)}×`,
                  source: "Monthly revenue series",
                } },
              { label: "Spend", value: inrCompact(totSpend), color: "#ffb267",
                math: {
                  title: "Paid spend across the series",
                  steps: series.map((s) => ({ label: shortMonth(s.month), value: inrCompact(s.spend) })),
                  formula: `spend = ${inrCompact(totSpend)}`,
                  source: "Platform daily exports · Sheets → Supabase",
                } },
            ]).map((s) => (
              <Explain key={s.label} math={s.math}>
                <div className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  {s.label}
                </div>
                <div className="text-2xl font-bold tabular md:text-3xl" style={{ color: s.color }}>{s.value}</div>
              </Explain>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="img"
            aria-label="Monthly revenue vs spend with blended ROAS line">
            <defs>
              <linearGradient id="me-rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2fd9ba" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#0d5f50" stopOpacity="0.25" />
              </linearGradient>
              <linearGradient id="me-spend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef8c33" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#8a4c14" stopOpacity="0.3" />
              </linearGradient>
              <filter id="me-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {grids.map((g) => (
              <g key={g}>
                <line x1={PADL} x2={W - PADR} y1={yV(g)} y2={yV(g)} stroke="var(--grid)" strokeDasharray="2 5" />
                <text x={PADL - 8} y={yV(g) + 4} textAnchor="end" fontSize="10.5" fill="var(--text-muted)" className="tabular">
                  ₹{Math.round(g / 1_00_000)} L
                </text>
              </g>
            ))}
            <line x1={PADL} x2={W - PADR} y1={baseline} y2={baseline} stroke="var(--baseline)" />

            {/* revenue then spend areas — the gap is margin */}
            <path d={area(revPts)} fill="url(#me-rev)" />
            <path d={smoothPath(revPts)} fill="none" stroke="#4be3c3" strokeWidth="2" />
            <path d={area(spendPts)} fill="url(#me-spend)" />
            <path d={smoothPath(spendPts)} fill="none" stroke="#ffb267" strokeWidth="1.8" />

            {/* blended ROAS line riding the top band */}
            <path d={smoothPath(roasPts)} fill="none" stroke="#f2f5f3" strokeWidth="1.8"
              strokeLinecap="round" filter="url(#me-glow)" opacity="0.95" />
            <circle cx={roasPts[peakIdx].x} cy={roasPts[peakIdx].y} r="4" fill="#ffffff" filter="url(#me-glow)" />
            <text x={roasPts[peakIdx].x} y={roasPts[peakIdx].y - 10} textAnchor="middle"
              fontSize="11.5" fontWeight="800" fill="#ffffff" className="tabular">
              peak {ratio(series[peakIdx].blendedRoas ?? 0, 1)}×
            </text>
            <text x={roasPts[0].x + 4} y={roasPts[0].y - 10} textAnchor="start" fontSize="10.5"
              fill="var(--text-secondary)">
              ROAS — flat is the win
            </text>

            {/* series labels at the right edge */}
            <text x={W - PADR + 6} y={revPts[n - 1].y + 4} fontSize="11" fontWeight="700" fill="#4be3c3">revenue</text>
            <text x={W - PADR + 6} y={spendPts[n - 1].y + 4} fontSize="11" fontWeight="700" fill="#ffb267">spend</text>
            <text x={W - PADR + 6} y={roasPts[n - 1].y + 4} fontSize="11" fontWeight="700" fill="#f2f5f3">
              {series[n - 1].isPartial ? "MTD" : ratio(series[n - 1].blendedRoas ?? 0, 1) + "×"}
            </text>

            {/* month ticks */}
            {series.map((s, i) => (
              <text key={s.month} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">
                {shortMonth(s.month)}
              </text>
            ))}
          </svg>
        </div>

        <p className="mt-3 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--brand)" }}>The story:</strong>{" "}
          {spendX != null && spendX > 1
            ? `blended ROAS held between ${ratio(roasMin, 1)}× and ${ratio(roasMax, 1)}× while monthly spend scaled ${ratio(spendX, 1)}× (${shortMonth(first.month)} → ${shortMonth(last.month)}) — efficiency that survives a spend ramp is the strongest scaling signal in the account.`
            : `blended ROAS has held between ${ratio(roasMin, 1)}× and ${ratio(roasMax, 1)}× across the series — the margin gap is stable while volume grows.`}
        </p>
      </div>
    </SpotlightStage>
  );
}
