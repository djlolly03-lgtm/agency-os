import { Explain } from "@/components/explain";
import { SpotlightStage } from "@/components/hero-cinema";
import { inrCompact, inr, ratio, pct } from "@/lib/format";

export interface DuelPlatform {
  platform: string;            // "meta" | "google"
  spend: number;
  revenue: number;
  purchases: number;
  impressions: number;         // 0 when only manual monthlies exist
  manual?: boolean;            // Google figures from the monthly report
}

const NAME: Record<string, string> = { meta: "Meta", google: "Google" };
const COLOR: Record<string, string> = { meta: "#3987e5", google: "#ef8c33" };

/**
 * 02 · Channels — Meta vs Google, rupee for rupee. ROAS rings sized to
 * spend share, per-metric winner ticks, and a computed "move" line when
 * the numbers argue for reallocation.
 */
export function ChannelDuel({ platforms, periodLabel }: {
  platforms: DuelPlatform[];
  periodLabel: string;
}) {
  if (platforms.length < 2) return null;
  const totalSpend = platforms.reduce((t, p) => t + p.spend, 0) || 1;
  const rows = platforms.map((p) => ({
    ...p,
    name: NAME[p.platform] ?? p.platform,
    color: COLOR[p.platform] ?? "var(--brand)",
    share: p.spend / totalSpend,
    roas: p.spend > 0 ? p.revenue / p.spend : 0,
    cpa: p.purchases > 0 ? p.spend / p.purchases : null,
    cpm: p.impressions > 0 ? (p.spend / p.impressions) * 1000 : null,
  }));
  const byRoas = [...rows].sort((a, b) => b.roas - a.roas);
  const winner = byRoas[0], loser = byRoas[1];
  const bigger = rows.reduce((a, b) => (b.spend > a.spend ? b : a));
  const bestCpa = rows.filter((r) => r.cpa != null).sort((a, b) => a.cpa! - b.cpa!)[0];
  const bestCpm = rows.filter((r) => r.cpm != null).sort((a, b) => a.cpm! - b.cpm!)[0];

  // the move: underdog earns meaningfully more per rupee but gets the small share
  const move = winner.roas > loser.roas * 1.1 && winner.share < 0.4
    ? `shift 10–15% of ${loser.name} budget into ${winner.name} and re-measure in 4 weeks — at current rates every reallocated lakh is worth ≈${inrCompact((winner.roas - loser.roas) * 1_00_000)} more revenue.`
    : winner.roas > loser.roas * 1.1
      ? `${winner.name} already gets the bigger share and still earns more per rupee — keep feeding it, and treat ${loser.name} as the testing ground.`
      : `the platforms are close on return — split by role (reach vs closing), not by ROAS alone.`;

  return (
    <SpotlightStage>
      <div className="canvas-dark p-5 md:p-6">
        <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
          {rows.map((p, idx) => (
            <div key={p.platform} className={idx === 1 ? "md:order-3" : ""}>
              <Explain block math={{
                title: `${p.name} · ${periodLabel}`,
                steps: [
                  { label: `Spend · ${pct(p.share, 0)} of paid`, value: inrCompact(p.spend) },
                  { label: "Attributed revenue", value: inrCompact(p.revenue) },
                  { label: "Orders", value: String(Math.round(p.purchases)) },
                  { label: "ROAS = revenue ÷ spend", value: `${ratio(p.roas)}×` },
                  ...(p.cpa != null ? [{ label: "CPA = spend ÷ orders", value: inr(p.cpa) }] : []),
                  ...(p.cpm != null ? [{ label: "CPM = spend ÷ impressions × 1000", value: inr(p.cpm) }] : []),
                ],
                formula: `${p.name} ROAS = ${inrCompact(p.revenue)} ÷ ${inrCompact(p.spend)} = ${ratio(p.roas)}×`,
                note: p.manual ? "Google figures for pre-May months come from the monthly report (no daily rows)." : undefined,
                source: "Platform daily exports · Sheets → Supabase",
              }}>
                <div className="relative h-full rounded-2xl border p-5"
                  style={{
                    borderColor: `color-mix(in srgb, ${p.color} 35%, transparent)`,
                    background: `radial-gradient(420px 200px at 20% -20%, color-mix(in srgb, ${p.color} 18%, transparent), transparent 70%), var(--surface-1)`,
                  }}>
                  {p.platform === winner.platform && winner.roas > loser.roas * 1.02 && (
                    <span className="absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest"
                      style={{ background: p.color, color: "#fff" }}>
                      Winner · per ₹
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black uppercase tracking-wider" style={{ color: p.color }}>{p.name}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                      {pct(p.share, 0)} of spend
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-5">
                    {/* ROAS ring — arc length = share of spend */}
                    <svg viewBox="0 0 96 96" className="h-24 w-24 shrink-0" aria-hidden>
                      <circle cx="48" cy="48" r="40" fill="none" stroke="var(--grid)" strokeWidth="7" />
                      <circle cx="48" cy="48" r="40" fill="none" stroke={p.color} strokeWidth="7"
                        strokeLinecap="round" strokeDasharray={`${Math.max(p.share, 0.04) * 251.3} 251.3`}
                        transform="rotate(-90 48 48)" />
                      <text x="48" y="46" textAnchor="middle" fontSize="19" fontWeight="800"
                        fill="var(--text-primary)" className="tabular">{ratio(p.roas)}×</text>
                      <text x="48" y="62" textAnchor="middle" fontSize="9" letterSpacing="1.5"
                        fill="var(--text-muted)">ROAS</text>
                    </svg>
                    <dl className="flex-1 text-sm">
                      {([
                        { k: "Spend", v: inrCompact(p.spend), win: false },
                        { k: "Paid revenue", v: inrCompact(p.revenue), win: false },
                        { k: "CPA", v: p.cpa != null ? inr(p.cpa) : "—", win: bestCpa?.platform === p.platform && rows.every((r) => r.cpa != null) },
                        { k: "CPM", v: p.cpm != null ? inr(p.cpm) : "—", win: bestCpm?.platform === p.platform && rows.every((r) => r.cpm != null) },
                      ]).map((row) => (
                        <div key={row.k} className="flex items-baseline justify-between gap-3 py-1">
                          <dt style={{ color: "var(--text-muted)" }}>{row.k}</dt>
                          <dd className="font-bold tabular" style={{ color: row.win ? p.color : "var(--text-primary)" }}>
                            {row.v}{row.win ? " ✓" : ""}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <p className="mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {p.platform === bigger.platform
                      ? "The volume engine — reach and scale live here."
                      : "The closer — cheaper orders, starved of budget."}
                  </p>
                </div>
              </Explain>
            </div>
          ))}
          <div className="serif-display order-3 hidden items-center text-2xl md:order-2 md:flex"
            style={{ color: "var(--text-muted)" }}>
            vs
          </div>
        </div>
        <p className="mt-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--brand-accent)" }}>The move:</strong> {move}
        </p>
      </div>
    </SpotlightStage>
  );
}
