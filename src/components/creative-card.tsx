import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import { inrCompact, inr, num, ratio } from "@/lib/format";
import type { CreativeRollup } from "@/lib/queries";

export type CreativeTone = "scale" | "watch" | "kill" | "muted";

const TONE = {
  scale: { color: "var(--status-good)", border: "color-mix(in srgb, var(--status-good) 30%, var(--border-hairline))" },
  watch: { color: "var(--text-primary)", border: "var(--border-hairline)" },
  kill: { color: "var(--status-critical)", border: "color-mix(in srgb, var(--status-critical) 35%, var(--border-hairline))" },
  muted: { color: "var(--text-secondary)", border: "var(--border-hairline)" },
} as const;

export function toneFor(c: CreativeRollup): CreativeTone {
  if (!c.active) return "muted";
  if (c.status === "winner" || c.status === "hidden_gem") return "scale";
  if (c.status === "losing" || c.status === "fatiguing") return "kill";
  return "watch";
}

/**
 * One creative, one verdict. The 14-day ROAS is the hero — huge, tone-colored,
 * with its distance from the account average and a meter to make cards
 * comparable at a glance. Everything else steps back.
 */
export function CreativeCard({ c, slug, baseline, tone, compact }: {
  c: CreativeRollup;
  slug: string;
  /** account-wide 14d ROAS — the line every creative is judged against */
  baseline: number;
  tone: CreativeTone;
  compact?: boolean;
}) {
  const t = TONE[tone];
  // active ads are judged on their 14-day form; retired ones on lifetime
  const spend = c.active ? c.window_spend : c.spend;
  const revenue = c.active ? c.window_revenue : c.revenue;
  const orders = c.active ? c.window_purchases : c.purchases;
  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = orders > 0 ? spend / orders : null;
  const vsAccount = baseline > 0 && spend > 0 ? roas / baseline - 1 : null;
  const meterFill = baseline > 0 ? Math.min(roas / (2 * baseline), 1) : 0;
  const windowLabel = c.active ? "14d" : "lifetime";
  const lowSignal = c.status === "testing";

  const roasColor = lowSignal
    ? "var(--text-secondary)"
    : tone === "watch"
      ? (vsAccount != null && vsAccount >= 0 ? "var(--text-primary)" : "var(--status-warning)")
      : t.color;

  return (
    <Link href={`/${slug}/creatives/${c.ad_id}`}
      className="card card-lift flex flex-col overflow-hidden"
      style={{ borderColor: t.border, opacity: tone === "muted" ? 0.75 : 1 }}>
      {/* visual */}
      <div className="relative" style={{ background: "var(--grid)" }}>
        {c.asset_id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/v1/assets/${c.asset_id}/thumb`} alt={c.asset_filename ?? c.ad_name}
            loading="lazy" className={`${compact ? "h-24" : "h-36"} w-full object-cover`} />
        ) : (
          <div className={`${compact ? "h-24" : "h-36"} flex w-full items-center justify-center`}
            style={{
              background: `radial-gradient(300px 140px at 30% 0%, color-mix(in srgb, var(--brand) 14%, transparent), transparent 70%), var(--surface-2)`,
            }}>
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              {c.format === "unknown" ? "creative" : c.format} · no file matched yet
            </span>
          </div>
        )}
        <div className="absolute left-2 top-2">
          <StatusChip status={c.status} muted={!c.active} />
        </div>
      </div>

      <div className={`flex flex-1 flex-col gap-1.5 ${compact ? "p-3" : "p-4"}`}>
        <span className={`line-clamp-1 font-semibold ${compact ? "text-xs" : "text-sm"}`}>{c.ad_name}</span>
        <span className="line-clamp-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {c.campaign} · {c.days_running}d {c.active ? "running" : "retired"}
        </span>

        {/* the verdict number */}
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`font-extrabold tabular ${compact ? "text-2xl" : "text-3xl"}`} style={{ color: roasColor }}>
            {spend > 0 ? `${ratio(roas)}×` : "—"}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            ROAS {windowLabel}
          </span>
          {vsAccount != null && !lowSignal && Math.abs(vsAccount) >= 0.05 && (
            <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular"
              style={{
                background: `color-mix(in srgb, ${vsAccount > 0 ? "var(--status-good)" : "var(--status-critical)"} 14%, transparent)`,
                color: vsAccount > 0 ? "var(--delta-good)" : "var(--status-critical)",
              }}>
              {vsAccount > 0 ? "▲" : "▼"} {Math.abs(vsAccount * 100).toFixed(0)}% vs acct
            </span>
          )}
        </div>

        {/* meter: this creative vs the account line (tick at account avg) */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--grid)" }}
          title={`account ${windowLabel} ROAS ${ratio(baseline)}× at the tick`}>
          <div className="h-full rounded-full" style={{ width: `${meterFill * 100}%`, background: roasColor, opacity: lowSignal ? 0.4 : 0.9 }} />
          <div className="absolute top-0 h-full w-0.5" style={{ left: "50%", background: "var(--text-muted)" }} />
        </div>

        <div className="mt-0.5 text-[11px] tabular" style={{ color: "var(--text-secondary)" }}>
          {inrCompact(spend)} spend · {num(orders)} orders{cpa != null ? ` · CPA ${inr(cpa)}` : ""}
        </div>

        {c.status_reasons.length > 0 && (
          <div className="mt-auto rounded-md px-2 py-1.5 text-[11px] leading-4"
            style={{
              background: tone === "scale" ? "color-mix(in srgb, var(--status-good) 9%, transparent)"
                : tone === "kill" ? "color-mix(in srgb, var(--status-critical) 9%, transparent)"
                : "var(--page)",
              color: tone === "kill" ? "var(--status-critical)" : tone === "scale" ? "var(--delta-good)" : "var(--text-secondary)",
            }}>
            {c.status_reasons[0]}
          </div>
        )}
      </div>
    </Link>
  );
}
