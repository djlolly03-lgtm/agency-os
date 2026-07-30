import { Explain } from "@/components/explain";
import { SpotlightStage } from "@/components/hero-cinema";
import { inr, inrCompact } from "@/lib/format";

export interface KillMapCampaign {
  id: string; name: string; platform: string;
  spend: number; revenue: number; purchases: number;
}

/**
 * 04 · Campaigns — the kill map. CAC (what an order costs) against AOV
 * (what an order is worth), bubble = spend. Left of blended CAC = scale;
 * expensive orders for small baskets = the kill zone, glowing red.
 */
export function KillMap({ campaigns, slug, minSpend = 5000 }: {
  campaigns: KillMapCampaign[];
  slug: string;
  minSpend?: number;
}) {
  const pts = campaigns
    .filter((c) => c.purchases > 0 && c.spend >= minSpend)
    .map((c) => ({
      ...c,
      cac: c.spend / c.purchases,
      aov: c.revenue / c.purchases,
    }));
  if (pts.length < 3) return null;

  const totSpend = pts.reduce((t, p) => t + p.spend, 0);
  const totOrders = pts.reduce((t, p) => t + p.purchases, 0);
  const totRevenue = pts.reduce((t, p) => t + p.revenue, 0);
  const blendedCac = totSpend / totOrders;
  const avgAov = totRevenue / totOrders;

  const W = 1180, H = 420, PADL = 64, PADR = 28, TOP = 24, BOT = 44;
  const plotW = W - PADL - PADR, plotH = H - TOP - BOT;
  const cacLo = Math.min(...pts.map((p) => p.cac)) * 0.85;
  const cacHi = Math.max(...pts.map((p) => p.cac)) * 1.1;
  const aovLo = Math.min(...pts.map((p) => p.aov)) * 0.92;
  const aovHi = Math.max(...pts.map((p) => p.aov)) * 1.08;
  const x = (cac: number) => PADL + ((cac - cacLo) / (cacHi - cacLo)) * plotW;
  const y = (aov: number) => TOP + (1 - (aov - aovLo) / (aovHi - aovLo)) * plotH;
  const maxSpend = Math.max(...pts.map((p) => p.spend));
  const r = (spend: number) => 8 + Math.sqrt(spend / maxSpend) * 26;

  const zone = (p: (typeof pts)[number]) =>
    p.cac <= blendedCac ? "scale" : p.aov >= avgAov ? "watch" : "kill";
  const ZONE_COLOR = { scale: "#2fd9ba", watch: "#ffb267", kill: "#ff5f57" } as const;
  const labeled = [...pts].sort((a, b) => b.spend - a.spend).slice(0, 6);
  const killers = pts.filter((p) => zone(p) === "kill").sort((a, b) => b.spend - a.spend);

  return (
    <SpotlightStage>
      <div className="canvas-dark p-5 md:p-6">
        <Explain block math={{
          title: "The kill map — how to read it",
          steps: [
            { label: "x-axis · CAC = spend ÷ orders (per campaign)", value: `₹${Math.round(cacLo)} → ₹${Math.round(cacHi)}` },
            { label: "y-axis · AOV = revenue ÷ orders", value: `₹${Math.round(aovLo)} → ₹${Math.round(aovHi)}` },
            { label: "Bubble size", value: "spend" },
            { label: "Blended CAC (dashed vertical)", value: inr(blendedCac) },
            { label: "Average AOV (dashed horizontal)", value: inr(avgAov) },
            { label: `Campaigns shown (≥ ${inrCompact(minSpend)} spend, ≥ 1 order)`, value: String(pts.length) },
          ],
          formula: `scale: CAC ≤ ${inr(blendedCac)} · watch: costly but big baskets · kill: CAC > ${inr(blendedCac)} and AOV < ${inr(avgAov)}`,
          note: "Platform-attributed orders. Campaigns below the spend floor are hidden so tiny tests don't shout.",
          source: "Platform daily exports · Sheets → Supabase",
        }}>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="img"
              aria-label="Campaign kill map: CAC vs AOV, bubble size = spend">
              <defs>
                <filter id="km-red" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="7" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <linearGradient id="km-killzone" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ff5f57" stopOpacity="0" />
                  <stop offset="100%" stopColor="#ff5f57" stopOpacity="0.10" />
                </linearGradient>
              </defs>

              {/* kill-zone tint: right of blended CAC, below avg AOV */}
              <rect x={x(blendedCac)} y={y(avgAov)} width={W - PADR - x(blendedCac)}
                height={H - BOT - y(avgAov)} fill="url(#km-killzone)" />

              {/* reference lines */}
              <line x1={x(blendedCac)} x2={x(blendedCac)} y1={TOP} y2={H - BOT}
                stroke="var(--baseline)" strokeDasharray="4 5" />
              <text x={x(blendedCac)} y={H - 26} textAnchor="middle" fontSize="10.5"
                fill="var(--text-secondary)" className="tabular">{inr(blendedCac)} · blended CAC</text>
              <line x1={PADL} x2={W - PADR} y1={y(avgAov)} y2={y(avgAov)}
                stroke="var(--baseline)" strokeDasharray="4 5" />
              <text x={PADL - 8} y={y(avgAov) + 4} textAnchor="end" fontSize="10.5"
                fill="var(--text-secondary)" className="tabular">AOV {inr(avgAov)}</text>

              {/* zone labels */}
              <text x={PADL + 6} y={H - BOT - 10} fontSize="11" fontWeight="800" letterSpacing="2"
                fill="#2fd9ba">SCALE ZONE</text>
              <text x={W - PADR - 6} y={H - BOT - 10} textAnchor="end" fontSize="11" fontWeight="800"
                letterSpacing="2" fill="#ff5f57">KILL ZONE</text>

              {/* axis extents */}
              <text x={PADL - 8} y={TOP + 6} textAnchor="end" fontSize="10.5" fill="var(--text-muted)" className="tabular">₹{Math.round(aovHi)}</text>
              <text x={PADL - 8} y={H - BOT} textAnchor="end" fontSize="10.5" fill="var(--text-muted)" className="tabular">₹{Math.round(aovLo)}</text>
              <text x={PADL} y={H - 8} fontSize="10.5" fill="var(--text-muted)" className="tabular">CAC ₹{Math.round(cacLo)}</text>
              <text x={W - PADR} y={H - 8} textAnchor="end" fontSize="10.5" fill="var(--text-muted)" className="tabular">₹{Math.round(cacHi)}</text>

              {/* bubbles (small on top) */}
              {[...pts].sort((a, b) => b.spend - a.spend).map((p) => {
                const z = zone(p);
                return (
                  <a key={p.id} href={`/${slug}/campaigns/${p.id}`}>
                    <circle cx={x(p.cac)} cy={y(p.aov)} r={r(p.spend)}
                      fill={ZONE_COLOR[z]} fillOpacity={z === "kill" ? 0.85 : 0.72}
                      stroke={ZONE_COLOR[z]} strokeOpacity="0.9"
                      filter={z === "kill" ? "url(#km-red)" : undefined}
                      style={{ cursor: "pointer" }}>
                      <title>{`${p.name} · CAC ${inr(p.cac)} · AOV ${inr(p.aov)} · ${inrCompact(p.spend)} spend`}</title>
                    </circle>
                  </a>
                );
              })}
              {labeled.map((p) => (
                <text key={p.id} x={x(p.cac)} y={y(p.aov) - r(p.spend) - 6} textAnchor="middle"
                  fontSize="10.5" fontWeight="600" fill="var(--text-secondary)">
                  {p.name.length > 26 ? p.name.slice(0, 24) + "…" : p.name}
                </text>
              ))}
            </svg>
          </div>
        </Explain>
        <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--brand)" }}>The story:</strong>{" "}
          left of the dashed line, orders cost less than the account average ({inr(blendedCac)}); above the
          horizontal, baskets are bigger than average ({inr(avgAov)}).
          {killers.length > 0
            ? ` ${killers[0].name} pays ${inr(killers[0].cac)} for a ${inr(killers[0].aov)} basket — glowing red for a reason.`
            : " Nothing currently sits in the kill zone."}
          {" "}Click any bubble for the campaign's full story.
        </p>
      </div>
    </SpotlightStage>
  );
}
