import Link from "next/link";
import { inrCompact, ratio } from "@/lib/format";

/**
 * GitHub-style calendar heatmap of daily ROAS (trailing ~13 weeks).
 * Each day links to that day's campaign breakdown.
 */
export function DayHeatmap({ days, slug }: {
  days: Array<{ day: string; spend: number; revenue: number; roas: number }>;
  slug: string;
}) {
  if (days.length === 0) return null;
  // ROAS buckets → brand-teal sequential steps (0 spend = empty cell)
  const bucket = (d: { spend: number; roas: number }) => {
    if (d.spend <= 0) return "var(--grid)";
    if (d.roas < 1) return "color-mix(in srgb, var(--status-critical) 55%, var(--surface-2))";
    if (d.roas < 2) return "color-mix(in srgb, var(--brand) 25%, var(--surface-2))";
    if (d.roas < 3) return "color-mix(in srgb, var(--brand) 50%, var(--surface-2))";
    if (d.roas < 4) return "color-mix(in srgb, var(--brand) 75%, var(--surface-2))";
    return "var(--brand)";
  };

  // organize into weeks (columns), Mon-first
  const byDay = new Map(days.map((d) => [d.day, d]));
  const start = new Date(days[0].day + "T00:00:00Z");
  const end = new Date(days[days.length - 1].day + "T00:00:00Z");
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  const gridStart = new Date(start.getTime() - mondayOffset * 86400000);
  const weeks: Array<Array<{ day: string; data?: (typeof days)[number] } | null>> = [];
  for (let t = gridStart.getTime(); t <= end.getTime(); ) {
    const week: Array<{ day: string; data?: (typeof days)[number] } | null> = [];
    for (let i = 0; i < 7; i++, t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      week.push(t > end.getTime() || iso < days[0].day ? null : { day: iso, data: byDay.get(iso) });
    }
    weeks.push(week);
  }

  const monthTicks = weeks.map((w) => {
    const firstCell = w.find(Boolean);
    if (!firstCell) return "";
    const d = new Date(firstCell.day + "T00:00:00Z");
    return d.getUTCDate() <= 7 ? d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }) : "";
  });

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Daily ROAS — last {Math.round(days.length / 7)} weeks</h3>
        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          &lt;1×
          {["color-mix(in srgb, var(--status-critical) 55%, var(--surface-2))",
            "color-mix(in srgb, var(--brand) 25%, var(--surface-2))",
            "color-mix(in srgb, var(--brand) 50%, var(--surface-2))",
            "color-mix(in srgb, var(--brand) 75%, var(--surface-2))",
            "var(--brand)"].map((c, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
          ))}
          4×+
        </span>
      </div>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>Click any day to see its campaign breakdown.</p>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1" style={{ minWidth: weeks.length * 23 }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              <div className="h-3 text-[9px]" style={{ color: "var(--text-muted)" }}>{monthTicks[wi]}</div>
              {week.map((cell, di) =>
                cell?.data ? (
                  <Link key={di} href={`/${slug}/campaigns?from=${cell.day}&to=${cell.day}`}
                    title={`${cell.day} · spend ${inrCompact(cell.data.spend)} · ROAS ${ratio(cell.data.roas)}×`}
                    className="block h-[18px] w-[18px] rounded-[5px] transition-all hover:scale-125 hover:ring-2"
                    style={{ background: bucket(cell.data) }} />
                ) : (
                  <span key={di} className="block h-[18px] w-[18px] rounded-[5px]"
                    style={{ background: cell ? "var(--grid)" : "transparent" }} />
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
