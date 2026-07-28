import { Sun, Sprout, CloudOff } from "lucide-react";
import { inrCompact, ratio } from "@/lib/format";
import type { ProduceMonthAgg } from "@/lib/seasons";
import { seasonLabel } from "@/lib/seasons";

function Bucket({ icon: Icon, color, title, note, items, render }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  color: string; title: string; note: string;
  items: ProduceMonthAgg[];
  render: (a: ProduceMonthAgg) => React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <div>
          <h3 className="text-sm font-bold leading-4">{title}</h3>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{note}</span>
        </div>
        <span className="ml-auto text-2xl font-bold tabular" style={{ color }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nothing here — good.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 4).map((a) => (
            <li key={a.produce.key} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">
                {a.produce.label}
                {a.closing && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: "color-mix(in srgb, var(--status-warning) 20%, transparent)", color: "var(--status-warning)" }}>
                  window closing
                </span>}
              </span>
              <span className="shrink-0 tabular" style={{ color: "var(--text-secondary)" }}>{render(a)}</span>
            </li>
          ))}
          {items.length > 4 && (
            <li className="text-[11px]" style={{ color: "var(--text-muted)" }}>+{items.length - 4} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Riding the season / missed windows / fighting the calendar. */
export function SeasonRadar({ riding, missed, offSeason }: {
  riding: ProduceMonthAgg[]; missed: ProduceMonthAgg[]; offSeason: ProduceMonthAgg[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Bucket icon={Sun} color="var(--status-good)" title="Riding the season" note="in-season items with live spend"
        items={riding}
        render={(a) => <>{inrCompact(a.revenue)} · {a.spend > 0 ? `${ratio(a.revenue / a.spend)}×` : "—"}</>} />
      <Bucket icon={Sprout} color="var(--ai)" title="Open windows, no push" note="in season, zero spend — missed demand"
        items={missed}
        render={(a) => <>{seasonLabel(a.produce)}</>} />
      <Bucket icon={CloudOff} color="var(--status-serious)" title="Fighting the calendar" note="spend on out-of-season items"
        items={offSeason}
        render={(a) => <>{inrCompact(a.spend)} spend · {a.spend > 0 ? `${ratio(a.revenue / a.spend)}×` : "—"}</>} />
    </div>
  );
}
