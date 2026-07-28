import Link from "next/link";
import { Trophy, AlertTriangle } from "lucide-react";
import type { DivisionRollup, CampaignHighlight } from "@/lib/queries";
import { inr, inrCompact, num, ratio, pct, monthLabel } from "@/lib/format";
import { SegmentBar } from "@/components/segment-bar";

export const DIVISION_LABEL: Record<string, string> = {
  fruits_veggies: "Fruits & Veggies",
  groceries: "Groceries",
};
export const DIVISION_COLOR: Record<string, string> = {
  fruits_veggies: "var(--brand)",
  groceries: "var(--brand-accent)",
};

export function OnlineOfflineCard({ month, online, onlineIsTracked, offline, href }: {
  month: string; online: number; onlineIsTracked: boolean; offline: number | null; href: string;
}) {
  const total = online + (offline ?? 0);
  return (
    <Link href={href} className="card card-lift block p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Online vs offline sales — {monthLabel(month.slice(0, 7))}</h3>
        <span className="text-xs underline" style={{ color: "var(--text-muted)" }}>monthly report →</span>
      </div>
      {offline != null && total > 0 && (
        <div className="mb-3">
          <SegmentBar segments={[
            { label: "Online", value: online, color: "var(--brand)", sub: inrCompact(online) },
            { label: "Offline", value: offline ?? 0, color: "var(--brand-accent)", sub: inrCompact(offline ?? 0) },
          ]} />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5"
          style={{ borderColor: "var(--border-hairline)" }}>
          <span className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" aria-hidden style={{ background: "var(--brand)" }} />
            Online{onlineIsTracked ? " (tracked)" : ""}
          </span>
          <span className="text-sm font-semibold tabular">{inrCompact(online)}
            {offline != null && total > 0 && (
              <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--text-muted)" }}>{pct(online / total, 0)}</span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5"
          style={{ borderColor: "var(--border-hairline)" }}>
          <span className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" aria-hidden style={{ background: "var(--brand-accent)" }} />
            Offline
          </span>
          {offline != null ? (
            <span className="text-sm font-semibold tabular">{inrCompact(offline)}
              <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--text-muted)" }}>{pct(offline / total, 0)}</span>
            </span>
          ) : (
            <span className="rounded-full border px-2 py-0.5 text-xs"
              style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}>
              awaiting client number
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function DivisionCards({ divisions, slug, month, isPartial }: {
  divisions: DivisionRollup[]; slug: string; month: string; isPartial: boolean;
}) {
  const totalSpend = divisions.reduce((s, d) => s + d.spend, 0) || 1;
  const totalRevenue = divisions.reduce((s, d) => s + d.revenue, 0) || 1;
  const periodLabel = isPartial ? "MTD" : monthLabel(month.slice(0, 7));
  const monthParam = month.slice(0, 7);
  return (
    <div className="flex flex-col gap-3">
      {/* split bar */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold">Division split ({periodLabel})</h3>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Spend</div>
        <SegmentBar segments={divisions.map((d) => ({
          label: DIVISION_LABEL[d.division], value: d.spend, color: DIVISION_COLOR[d.division], sub: inrCompact(d.spend),
        }))} />
        <div className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Revenue</div>
        <SegmentBar segments={divisions.map((d) => ({
          label: DIVISION_LABEL[d.division], value: d.revenue, color: DIVISION_COLOR[d.division], sub: inrCompact(d.revenue),
        }))} />
        <div className="mt-3 flex flex-wrap gap-4">
          {divisions.map((d) => (
            <span key={d.division} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="h-2.5 w-2.5 rounded-sm" aria-hidden style={{ background: DIVISION_COLOR[d.division] }} />
              {DIVISION_LABEL[d.division]} · {pct(d.spend / totalSpend, 0)} spend · {pct(d.revenue / totalRevenue, 0)} revenue
            </span>
          ))}
        </div>
      </div>

      {/* per-division economics + media analysis (clickable → drill-down) */}
      <div className="grid gap-3 md:grid-cols-2">
        {divisions.map((d) => (
          <Link key={d.division} href={`/${slug}/divisions/${d.division}?month=${monthParam}`}
            className="card card-lift block p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" aria-hidden style={{ background: DIVISION_COLOR[d.division] }} />
              <h3 className="text-sm font-semibold">{DIVISION_LABEL[d.division]}</h3>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{d.campaigns} campaigns · {periodLabel}</span>
              <span className="ml-auto text-xs underline" style={{ color: "var(--text-muted)" }}>dig in →</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                ["CAC (paid)", d.purchases > 0 ? inr(d.cpa) : "—"],
                ["AOV", d.purchases > 0 ? inr(d.aov) : "—"],
                ["LTV", d.ltv != null ? inr(d.ltv) : null],
                ["Spend", inrCompact(d.spend)],
                ["Revenue", inrCompact(d.revenue)],
                ["ROAS", `${ratio(d.roas)}×`],
                ["Orders", num(d.purchases)],
                ["CTR", pct(d.ctr)],
                ["CPM", inr(d.cpm)],
              ] as Array<[string, string | null]>).map(([label, value]) => (
                <div key={label}>
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
                  {value != null ? (
                    <div className="text-base font-semibold tabular">{value}</div>
                  ) : (
                    <div className="mt-0.5 w-fit rounded-full border px-2 py-0.5 text-[10px]"
                      style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}>
                      awaiting data
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function HeroLoserCards({ hero, loser, slug, periodLabel }: {
  hero: CampaignHighlight | null; loser: CampaignHighlight | null; slug: string; periodLabel: string;
}) {
  const card = (c: CampaignHighlight | null, kind: "hero" | "loser") => {
    const color = kind === "hero" ? "var(--status-good)" : "var(--status-critical)";
    const Icon = kind === "hero" ? Trophy : AlertTriangle;
    return (
    <div className="card overflow-hidden" style={{ borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}>
      <div className="flex items-center gap-2.5 px-4 py-2.5"
        style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
          <Icon size={15} strokeWidth={2.4} />
        </span>
        <h3 className="text-sm font-bold">{kind === "hero" ? "Hero campaign" : "Loser campaign"}
          <span className="ml-1.5 font-medium" style={{ color: "var(--text-muted)" }}>{periodLabel}</span>
        </h3>
      </div>
      <div className="p-4">
      {c ? (
        <>
          <div className="text-sm font-medium">{c.name}</div>
          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {c.platform === "meta" ? "Meta" : "Google"} · {DIVISION_LABEL[c.division]}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {([
              ["Spend", inrCompact(c.spend), false],
              ["Revenue", inrCompact(c.revenue), false],
              ["ROAS", `${ratio(c.roas)}×`, true],
              ["CPA", c.purchases > 0 ? inr(c.cpa) : "—", false],
            ] as Array<[string, string, boolean]>).map(([label, value, big]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
                <div className={big ? "text-xl font-bold tabular" : "text-sm font-semibold tabular"}
                  style={big ? { color: kind === "hero" ? "var(--status-good)" : "var(--status-critical)" } : undefined}>{value}</div>
              </div>
            ))}
          </div>
          <Link href={`/${slug}/campaigns/${c.id}`} className="mt-3 inline-block text-xs font-medium underline" style={{ color: "var(--brand)" }}>
            {kind === "hero" ? "See campaign detail →" : "Review or pause →"}
          </Link>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Not enough spend this month to call it.</p>
      )}
      </div>
    </div>
  ); };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {card(hero, "hero")}
      {card(loser, "loser")}
    </div>
  );
}
